"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyService = void 0;
const monday_service_1 = __importDefault(require("./monday-service"));
const graphql_request_1 = require("graphql-request");
const account_store_1 = require("./account-store");
const board_provisioning_1 = require("./board-provisioning");
// In-memory guard against Shopify webhook retries / duplicate deliveries creating the
// same order more than once (complements the persistent Monday dedup below).
const processingOrders = new Set();
class ShopifyService {
    // The monday account is resolved from the webhook URL's token (Option A) and passed
    // in as opts.accountId. shopDomain is kept only as a legacy fallback / for logging.
    static processOrderCreate(shopifyOrder, opts) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __awaiter(this, void 0, void 0, function* () {
            const shopDomain = opts === null || opts === void 0 ? void 0 : opts.shopDomain;
            const orderKey = String(shopifyOrder.id);
            if (processingOrders.has(orderKey)) {
                console.log(`⏭️ Order ${orderKey} is already being processed — skipping duplicate webhook`);
                return { success: true, duplicate: true, orderId: '' };
            }
            processingOrders.add(orderKey);
            try {
                // Account comes from the per-account webhook token in the URL. Fall back to a
                // shop-domain lookup only for the legacy shared endpoint.
                console.log(`🛒 [shopify] processing order ${orderKey} — account="${(_a = opts === null || opts === void 0 ? void 0 : opts.accountId) !== null && _a !== void 0 ? _a : '(none)'}", shopDomain="${shopDomain !== null && shopDomain !== void 0 ? shopDomain : '(none)'}"`);
                const accountId = (opts === null || opts === void 0 ? void 0 : opts.accountId) || (shopDomain ? yield (0, account_store_1.getAccountByShop)(shopDomain) : null);
                console.log(`🔎 [shopify] resolved accountId="${accountId !== null && accountId !== void 0 ? accountId : '(none)'}"`);
                const MONDAY_API_TOKEN = yield (0, account_store_1.resolveMondayToken)(accountId);
                console.log(`🔑 [shopify] monday token resolved: ${MONDAY_API_TOKEN ? 'YES' : 'NO'}`);
                if (!MONDAY_API_TOKEN) {
                    throw new Error(`No monday token available for account "${accountId !== null && accountId !== void 0 ? accountId : 'unknown'}" (shop "${shopDomain !== null && shopDomain !== void 0 ? shopDomain : 'unknown'}") — this account must complete OAuth (Connect) in Account Settings.`);
                }
                // Verify the token is still valid. It gets REVOKED when the app is uninstalled,
                // yet survives in storage across reinstall — so a stale token would otherwise
                // fail deep inside create_item with a confusing NOT_AUTHENTICATED. Clear it and
                // prompt reconnection instead.
                if (accountId && !(yield monday_service_1.default.isTokenValid(MONDAY_API_TOKEN))) {
                    yield (0, account_store_1.deleteAccountToken)(String(accountId));
                    throw new Error(`monday OAuth token for account "${accountId}" is invalid/expired (the app was likely uninstalled & reinstalled). Reconnect via Account Settings → Connect, then retry.`);
                }
                // Resolve this account's provisioned board IDs STRICTLY from its own config —
                // no hardcoded dev-board fallback (multi-tenant isolation). If the account isn't
                // provisioned yet, provision now rather than writing to some default board.
                let config = accountId ? yield (0, account_store_1.getAccountConfig)(accountId) : null;
                const boardsMissing = (c) => { var _a, _b, _c, _d; return !((_a = c === null || c === void 0 ? void 0 : c.boards) === null || _a === void 0 ? void 0 : _a.customers) || !((_b = c === null || c === void 0 ? void 0 : c.boards) === null || _b === void 0 ? void 0 : _b.orders) || !((_c = c === null || c === void 0 ? void 0 : c.boards) === null || _c === void 0 ? void 0 : _c.lineItems) || !((_d = c === null || c === void 0 ? void 0 : c.boards) === null || _d === void 0 ? void 0 : _d.products); };
                if (accountId && boardsMissing(config)) {
                    console.warn(`🩹 [shopify] account "${accountId}" not fully provisioned — provisioning now`);
                    config = yield (0, board_provisioning_1.provisionAccount)(String(accountId), MONDAY_API_TOKEN);
                }
                console.log(`🗂️ [shopify] stored config for account "${accountId}":`, (config === null || config === void 0 ? void 0 : config.boards) ? JSON.stringify(config.boards) : 'NONE');
                const boards = {
                    customers: ((_b = config === null || config === void 0 ? void 0 : config.boards) === null || _b === void 0 ? void 0 : _b.customers) || '',
                    orders: ((_c = config === null || config === void 0 ? void 0 : config.boards) === null || _c === void 0 ? void 0 : _c.orders) || '',
                    lineItems: ((_d = config === null || config === void 0 ? void 0 : config.boards) === null || _d === void 0 ? void 0 : _d.lineItems) || '',
                    products: ((_e = config === null || config === void 0 ? void 0 : config.boards) === null || _e === void 0 ? void 0 : _e.products) || '',
                };
                if (!boards.customers || !boards.orders || !boards.lineItems || !boards.products) {
                    throw new Error(`This monday account is not fully set up (provisioned boards missing) for account "${accountId !== null && accountId !== void 0 ? accountId : 'unknown'}". Open the app and complete setup, then retry.`);
                }
                console.log(`📋 [shopify] resolved board IDs → customers=${boards.customers}, orders=${boards.orders}, lineItems=${boards.lineItems}, products=${boards.products}`);
                // Verify the resolved boards actually exist for this token. A stale config
                // (board deleted after provisioning) would otherwise fail deep inside with a
                // confusing InvalidBoardIdException. If any is missing AND we have an account,
                // self-heal by re-provisioning server-side (prunes dead IDs, reuses existing
                // boards by name, recreates the rest), then re-resolve — no manual step needed.
                let missingBoards = yield monday_service_1.default.findMissingBoards(MONDAY_API_TOKEN, Object.values(boards));
                if (missingBoards.length && accountId) {
                    console.warn(`🩹 [shopify] boards missing for account "${accountId}": [${missingBoards.join(', ')}] — re-provisioning to repair…`);
                    const repaired = yield (0, board_provisioning_1.provisionAccount)(String(accountId), MONDAY_API_TOKEN);
                    boards.customers = ((_f = repaired.boards) === null || _f === void 0 ? void 0 : _f.customers) || boards.customers;
                    boards.orders = ((_g = repaired.boards) === null || _g === void 0 ? void 0 : _g.orders) || boards.orders;
                    boards.lineItems = ((_h = repaired.boards) === null || _h === void 0 ? void 0 : _h.lineItems) || boards.lineItems;
                    boards.products = ((_j = repaired.boards) === null || _j === void 0 ? void 0 : _j.products) || boards.products;
                    console.log(`📋 [shopify] board IDs after repair → customers=${boards.customers}, orders=${boards.orders}, lineItems=${boards.lineItems}, products=${boards.products}`);
                    missingBoards = yield monday_service_1.default.findMissingBoards(MONDAY_API_TOKEN, Object.values(boards));
                }
                if (missingBoards.length) {
                    throw new Error(`Configured board(s) still do not exist after repair: [${missingBoards.join(', ')}] ` +
                        `(account="${accountId}", shop="${shopDomain}"). Open the Multi-Order Processing view once, then retry.`);
                }
                // Step 1: Parse Shopify data
                const orderData = this.parseShopifyOrder(shopifyOrder);
                // Step 2: Dedup check — skip if this Shopify order ID already exists in Monday
                const ordersColumns = yield monday_service_1.default.getBoardColumns(MONDAY_API_TOKEN, boards.orders);
                const colMap = this.buildColumnMap(ordersColumns);
                const orderIdColId = colMap['Shopify Order ID'] || colMap['Order ID'] || colMap['OrderId'];
                if (orderIdColId) {
                    const existing = yield monday_service_1.default.findItemByColumnValue(MONDAY_API_TOKEN, boards.orders, orderIdColId, orderData.order.orderId);
                    if (existing) {
                        console.log(`⚠️ Order ${orderData.order.orderId} already exists in Monday (item: ${existing.id}) — skipping`);
                        return { success: true, customerId: 'existing', orderId: existing.id, duplicate: true };
                    }
                }
                else {
                    console.warn(`⚠️ No "Shopify Order ID" column on the Orders board — dedup disabled, duplicates possible.`);
                }
                // Step 3: Find or create customer
                const customerId = yield this.findOrCreateCustomer(orderData.customer, MONDAY_API_TOKEN, boards.customers);
                // Step 4: Create order
                const orderId = yield this.createOrder(orderData.order, customerId, MONDAY_API_TOKEN, boards.orders);
                // Step 5: Create line items
                yield this.createLineItems(shopifyOrder.line_items, orderId, MONDAY_API_TOKEN, orderData.order.cod, boards, orderData.order.createdAt);
                return { success: true, customerId, orderId };
            }
            catch (error) {
                console.error('❌ Shopify order processing error:', error);
                throw error;
            }
            finally {
                // Keep the guard for a minute so rapid retries are skipped; after that the
                // persistent Monday dedup (by Order ID) catches any late retry / post-restart.
                setTimeout(() => processingOrders.delete(orderKey), 60000);
            }
        });
    }
    static parseShopifyOrder(data) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13;
        // Phone fallback: customer.phone > customer.default_address.phone > billing_address.phone > order.phone
        const rawPhone = ((_a = data.customer) === null || _a === void 0 ? void 0 : _a.phone)
            || ((_c = (_b = data.customer) === null || _b === void 0 ? void 0 : _b.default_address) === null || _c === void 0 ? void 0 : _c.phone)
            || ((_d = data.billing_address) === null || _d === void 0 ? void 0 : _d.phone)
            || data.phone
            || '';
        const customer = {
            shopifyId: String(((_e = data.customer) === null || _e === void 0 ? void 0 : _e.id) || ''),
            firstName: ((_f = data.customer) === null || _f === void 0 ? void 0 : _f.first_name) || '',
            lastName: ((_g = data.customer) === null || _g === void 0 ? void 0 : _g.last_name) || '',
            email: ((_h = data.customer) === null || _h === void 0 ? void 0 : _h.email) || '',
            phone: rawPhone,
            // "Created Date" = when this record enters the system (the ORDER's date), matching
            // Orders and Line Items. Do NOT use the customer's Shopify signup date
            // (data.customer.created_at) — that can be months/years old and misrepresents when
            // the customer record was created here.
            createdAt: data.created_at || new Date().toISOString(),
            defaultAddress: {
                address1: ((_k = (_j = data.customer) === null || _j === void 0 ? void 0 : _j.default_address) === null || _k === void 0 ? void 0 : _k.address1) || ((_l = data.billing_address) === null || _l === void 0 ? void 0 : _l.address1) || '',
                province: ((_o = (_m = data.customer) === null || _m === void 0 ? void 0 : _m.default_address) === null || _o === void 0 ? void 0 : _o.province) || ((_p = data.billing_address) === null || _p === void 0 ? void 0 : _p.province) || '',
                city: ((_r = (_q = data.customer) === null || _q === void 0 ? void 0 : _q.default_address) === null || _r === void 0 ? void 0 : _r.city) || ((_s = data.billing_address) === null || _s === void 0 ? void 0 : _s.city) || '',
                country: ((_u = (_t = data.customer) === null || _t === void 0 ? void 0 : _t.default_address) === null || _u === void 0 ? void 0 : _u.country) || ((_v = data.billing_address) === null || _v === void 0 ? void 0 : _v.country) || '',
                zip: ((_x = (_w = data.customer) === null || _w === void 0 ? void 0 : _w.default_address) === null || _x === void 0 ? void 0 : _x.zip) || ((_y = data.billing_address) === null || _y === void 0 ? void 0 : _y.zip) || '',
            },
            // Order-level billing_address specifically (falls back to default_address if
            // the order itself has no billing_address, e.g. some manual/API-created orders).
            billingAddress: {
                address1: ((_z = data.billing_address) === null || _z === void 0 ? void 0 : _z.address1) || ((_1 = (_0 = data.customer) === null || _0 === void 0 ? void 0 : _0.default_address) === null || _1 === void 0 ? void 0 : _1.address1) || '',
                province: ((_2 = data.billing_address) === null || _2 === void 0 ? void 0 : _2.province) || ((_4 = (_3 = data.customer) === null || _3 === void 0 ? void 0 : _3.default_address) === null || _4 === void 0 ? void 0 : _4.province) || '',
                city: ((_5 = data.billing_address) === null || _5 === void 0 ? void 0 : _5.city) || ((_7 = (_6 = data.customer) === null || _6 === void 0 ? void 0 : _6.default_address) === null || _7 === void 0 ? void 0 : _7.city) || '',
                country: ((_8 = data.billing_address) === null || _8 === void 0 ? void 0 : _8.country) || ((_10 = (_9 = data.customer) === null || _9 === void 0 ? void 0 : _9.default_address) === null || _10 === void 0 ? void 0 : _10.country) || '',
                zip: ((_11 = data.billing_address) === null || _11 === void 0 ? void 0 : _11.zip) || ((_13 = (_12 = data.customer) === null || _12 === void 0 ? void 0 : _12.default_address) === null || _13 === void 0 ? void 0 : _13.zip) || '',
            }
        };
        const customerName = `${customer.firstName} ${customer.lastName}`.trim();
        const customerItemName = customerName.length > 1 ? customerName : customer.email;
        const gateway = (data.payment_gateway || data.gateway || '').toLowerCase();
        const isCod = gateway === 'cod' || gateway === 'cash_on_delivery' || gateway === 'manual';
        const order = {
            orderNumber: String(data.order_number || ''),
            orderId: String(data.id || ''),
            orderName: data.name || '',
            notes: data.note || '',
            totalPrice: String(data.total_price || '0'),
            subtotalPrice: String(data.subtotal_price || '0'),
            discount: String(data.total_discounts || '0'),
            customerShopifyId: customer.shopifyId,
            createdAt: data.created_at || new Date().toISOString(),
            billingAddress: this.formatAddress(data.billing_address),
            shippingAddress: this.formatAddress(data.shipping_address),
            cod: isCod ? 1 : 0
        };
        return { customer: Object.assign(Object.assign({}, customer), { itemName: customerItemName }), order };
    }
    static formatAddress(addr) {
        if (!addr)
            return '';
        return `${addr.first_name || ''} ${addr.last_name || ''}, ${addr.address1 || ''}, ${addr.city || ''}, ${addr.province || ''}, ${addr.country || ''}, ${addr.zip || ''}`.trim();
    }
    static findOrCreateCustomer(customer, token, customersBoardId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get column mapping for Customers board
            const columns = yield monday_service_1.default.getBoardColumns(token, customersBoardId);
            const colMap = this.buildColumnMap(columns);
            // Resolve the External ID column robustly (accept legacy "ExternalId" too). If this
            // column can't be found, dedup can't work and duplicate customers get created.
            const externalIdCol = colMap['External ID'] || colMap['ExternalId'];
            if (!externalIdCol) {
                console.warn('⚠️ No "External ID" column on the Customers board — customer dedup disabled, duplicates possible.');
            }
            // Find existing customer by External ID (only when we have both the column and a value)
            if (externalIdCol && customer.shopifyId) {
                const existingCustomer = yield monday_service_1.default.findItemByColumnValue(token, customersBoardId, externalIdCol, customer.shopifyId);
                if (existingCustomer) {
                    console.log(`✅ Found existing customer: ${existingCustomer.id} (External ID ${customer.shopifyId})`);
                    return existingCustomer.id;
                }
            }
            // Create new customer
            const columnValues = {};
            if (colMap['Email'])
                columnValues[colMap['Email']] = { email: customer.email, text: customer.email };
            if (externalIdCol)
                columnValues[externalIdCol] = customer.shopifyId;
            if (colMap['First Name'])
                columnValues[colMap['First Name']] = customer.firstName;
            if (colMap['Last Name'])
                columnValues[colMap['Last Name']] = customer.lastName;
            if (colMap['Default Street'])
                columnValues[colMap['Default Street']] = customer.defaultAddress.address1;
            if (colMap['Default Province'])
                columnValues[colMap['Default Province']] = customer.defaultAddress.province;
            if (colMap['Default City'])
                columnValues[colMap['Default City']] = customer.defaultAddress.city;
            if (colMap['Default Country'])
                columnValues[colMap['Default Country']] = customer.defaultAddress.country;
            if (colMap['Postal Code'])
                columnValues[colMap['Postal Code']] = customer.defaultAddress.zip;
            if (colMap['Billing Street'])
                columnValues[colMap['Billing Street']] = customer.billingAddress.address1;
            if (colMap['Billing City'])
                columnValues[colMap['Billing City']] = customer.billingAddress.city;
            if (colMap['Billing State'])
                columnValues[colMap['Billing State']] = customer.billingAddress.province;
            if (colMap['Billing Country'])
                columnValues[colMap['Billing Country']] = customer.billingAddress.country;
            if (colMap['Billing Postal Code'])
                columnValues[colMap['Billing Postal Code']] = customer.billingAddress.zip;
            if (colMap['Created Date'])
                columnValues[colMap['Created Date']] = { date: customer.createdAt.split('T')[0] };
            if (colMap['Phone'] && customer.phone) {
                const digitsOnly = customer.phone.replace(/\D/g, '');
                // Indian mobile numbers are always 10 digits. Anything beyond that is noise —
                // a leading trunk "0" (e.g. "09876543210"), the country code "91", or both
                // (e.g. "+91 09876543210") — so always keep just the last 10 digits rather
                // than only stripping when longer than 10 (which missed the plain 10-digit
                // "0XXXXXXXXX" case and left a stray leading 0 in the stored number).
                const phoneNumber = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
                // countryShortName is how monday's phone column represents the country code
                // (renders as +91 in the UI) — the stored digits themselves must NOT include it.
                const countryShortName = 'IN';
                if (phoneNumber.length === 10) {
                    columnValues[colMap['Phone']] = { phone: phoneNumber, countryShortName };
                }
            }
            const newCustomer = yield monday_service_1.default.createItem(token, customersBoardId, customer.itemName, columnValues);
            console.log(`✅ Created new customer: ${newCustomer.id}`);
            return newCustomer.id;
        });
    }
    static withRetry(fn, retries = 3, delayMs = 2000) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    return yield fn();
                }
                catch (err) {
                    const is503 = ((_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.status) === 503 || ((_b = err === null || err === void 0 ? void 0 : err.message) === null || _b === void 0 ? void 0 : _b.includes('503'));
                    if (is503 && attempt < retries) {
                        console.log(`⚠️ 503 error, retrying in ${delayMs}ms (attempt ${attempt}/${retries})...`);
                        yield new Promise(r => setTimeout(r, delayMs));
                    }
                    else {
                        throw err;
                    }
                }
            }
            throw new Error('Max retries exceeded');
        });
    }
    static getNextOrderName(token, ordersBoardId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: token }
            });
            const query = `query ($boardId: ID!) {
            boards(ids: [$boardId]) {
                items_count
            }
        }`;
            const response = yield this.withRetry(() => client.request(query, { boardId: ordersBoardId }));
            const count = (((_b = (_a = response === null || response === void 0 ? void 0 : response.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.items_count) || 0) + 1;
            return `ORD-${String(count).padStart(4, '0')}`;
        });
    }
    static createOrder(order, customerId, token, ordersBoardId) {
        return __awaiter(this, void 0, void 0, function* () {
            const columns = yield monday_service_1.default.getBoardColumns(token, ordersBoardId);
            const colMap = this.buildColumnMap(columns);
            const orderName = yield this.getNextOrderName(token, ordersBoardId);
            const columnValues = {};
            const orderIdCol = colMap['Shopify Order ID'] || colMap['Order ID'] || colMap['OrderId'];
            if (orderIdCol)
                columnValues[orderIdCol] = order.orderId;
            if (colMap['Notes'])
                columnValues[colMap['Notes']] = order.notes;
            // The Orders board column is titled "Total Price" (with a space); keep the
            // no-space fallback for safety. This is the value the WhatsApp {{2}} reads.
            const totalPriceColId = colMap['Total Price'] || colMap['TotalPrice'];
            if (totalPriceColId)
                columnValues[totalPriceColId] = order.totalPrice;
            if (colMap['Discount'])
                columnValues[colMap['Discount']] = order.discount;
            // Orders board customer-id column is "Customer External ID" (accept legacy "External ID").
            const customerExtIdCol = colMap['Customer External ID'] || colMap['External ID'];
            if (customerExtIdCol)
                columnValues[customerExtIdCol] = order.customerShopifyId;
            // Populate the real billing/shipping addresses from the Shopify order.
            // Shopify may omit the shipping address (e.g. digital/pickup orders) — fall back to billing.
            const shippingAddress = order.shippingAddress || order.billingAddress;
            if (colMap['Billing Address'])
                columnValues[colMap['Billing Address']] = order.billingAddress;
            if (colMap['Shipping Address'])
                columnValues[colMap['Shipping Address']] = shippingAddress;
            if (colMap['Created Date'])
                columnValues[colMap['Created Date']] = { date: order.createdAt.split('T')[0] };
            if (colMap['Customers'])
                columnValues[colMap['Customers']] = { item_ids: [parseInt(customerId)] };
            if (colMap['Order Type'])
                columnValues[colMap['Order Type']] = { label: 'Order' };
            if (colMap['COD'] !== undefined)
                columnValues[colMap['COD']] = order.cod;
            // Source is a plain text column; keep a status fallback for boards provisioned
            // before this changed from a status column.
            const sourceCol = columns.find((c) => c.title === 'Source');
            if (sourceCol)
                columnValues[sourceCol.id] = sourceCol.type === 'status' ? { label: 'Shopify' } : 'Shopify';
            const newOrder = yield monday_service_1.default.createItem(token, ordersBoardId, orderName, columnValues);
            console.log(`✅ Created order: ${newOrder.id} as ${orderName}`);
            return newOrder.id;
        });
    }
    static fetchProductsFromBoard(token, productsBoardId) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: token }
            });
            const query = `query ($boardId: ID!) {
            boards(ids: [$boardId]) {
                items_page(limit: 100) {
                    items {
                        id
                        name
                        column_values {
                            text
                            column { title }
                        }
                    }
                }
            }
        }`;
            const response = yield this.withRetry(() => client.request(query, { boardId: productsBoardId }));
            const items = ((_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.items_page) === null || _c === void 0 ? void 0 : _c.items) || [];
            return items.map((item) => {
                var _a;
                const skuCol = (_a = item.column_values) === null || _a === void 0 ? void 0 : _a.find((col) => { var _a; return ((_a = col.column) === null || _a === void 0 ? void 0 : _a.title) === 'SKU'; });
                return { id: item.id, name: item.name, sku: (skuCol === null || skuCol === void 0 ? void 0 : skuCol.text) || '' };
            });
        });
    }
    // Formats a value for Monday's create_item mutation based on the target column type,
    // so status/dropdown columns take the value instead of silently rejecting a plain string.
    static formatColumnValue(type, value) {
        switch (type) {
            case 'status': return { label: String(value) };
            case 'dropdown': return { labels: [String(value)] };
            default: return String(value); // text, numbers, etc.
        }
    }
    static findOrCreateProduct(token, productName, sku, existingProducts, productsBoardId, price = '', category = '', weight = '') {
        return __awaiter(this, void 0, void 0, function* () {
            // Match by SKU first, then by name (case-insensitive)
            let product = existingProducts.find(p => (sku && p.sku && p.sku.toLowerCase() === sku.toLowerCase()) ||
                p.name.toLowerCase() === productName.toLowerCase());
            if (product) {
                console.log(`✅ Found existing product: "${product.name}" (id: ${product.id})`);
                return product;
            }
            console.log(`📦 Product "${productName}" not found in Products board — creating...`);
            const productColumns = yield monday_service_1.default.getBoardColumns(token, productsBoardId);
            const findCol = (title) => productColumns.find((c) => (c.title || '').trim().toLowerCase() === title.toLowerCase());
            const findColByKeyword = (kw) => productColumns.find((c) => (c.title || '').toLowerCase().includes(kw));
            const productColumnValues = {};
            const skuCol = findCol('SKU');
            if (skuCol && sku)
                productColumnValues[skuCol.id] = sku;
            // Confirmed real title has no space before the parenthesis; keep the spaced
            // variant as a fallback in case a differently-provisioned board uses it.
            const priceCol = findCol('Selling Price(Per Unit)') || findCol('Selling Price (Per Unit)');
            if (priceCol && price)
                productColumnValues[priceCol.id] = price;
            else if (!priceCol)
                console.warn('⚠️ No "Selling Price(Per Unit)" column found on the Products board — price not set.');
            const categoryCol = findCol('Category');
            if (categoryCol && category)
                productColumnValues[categoryCol.id] = this.formatColumnValue(categoryCol.type, category);
            // Weight column matched loosely (e.g. "Weight", "Weight (kg)").
            const weightCol = findColByKeyword('weight');
            if (weightCol && weight)
                productColumnValues[weightCol.id] = this.formatColumnValue(weightCol.type, weight);
            const newProduct = yield monday_service_1.default.createItem(token, productsBoardId, productName, productColumnValues);
            const created = { id: newProduct.id, name: productName, sku };
            existingProducts.push(created);
            console.log(`✅ Created product: "${productName}" (id: ${newProduct.id}) | Price: ${price} | Category: ${category} | Weight: ${weight}`);
            return created;
        });
    }
    static createLineItems(lineItems, orderId, token, cod, boards, orderDate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!lineItems || lineItems.length === 0)
                return;
            const [lineItemColumns, existingProducts] = yield Promise.all([
                monday_service_1.default.getBoardColumns(token, boards.lineItems),
                this.fetchProductsFromBoard(token, boards.products)
            ]);
            const colMap = this.buildColumnMap(lineItemColumns);
            const dateValue = (orderDate || new Date().toISOString()).split('T')[0];
            console.log(`📋 Creating ${lineItems.length} line item(s) from Shopify order | Date: ${dateValue}`);
            for (const item of lineItems) {
                const productName = item.title || item.name || 'Unknown Product';
                const sku = item.sku || '';
                const quantity = item.quantity || 1;
                const price = String(item.price || '0');
                // Shopify line_item.grams is the per-unit weight in grams; store it in kg.
                const weight = item.grams ? String(item.grams / 1000) : '';
                console.log(`🔍 Processing line item: "${productName}" | SKU: ${sku} | Qty: ${quantity} | Price: ${price} | Weight: ${weight}kg`);
                // Category intentionally not populated (left for later) — passed as ''.
                const product = yield this.findOrCreateProduct(token, productName, sku, existingProducts, boards.products, price, '', weight);
                // Connect-column titles are the PLURAL of their target board (e.g. "Orders",
                // "Products") — accept the old singular titles too for boards that haven't
                // been renamed yet. Must also be an actual board_relation column: a same-titled
                // mirror/lookup (e.g. "Customers" on this board mirrors the customer through
                // the Order connection — it's intentionally read-only, not a direct connect)
                // can't be written via the API at all, and sending item_ids to one aborts the
                // whole create_item call, so it must be filtered out here.
                const findConnectCol = (...titles) => {
                    const col = lineItemColumns.find((c) => titles.some(t => (c.title || '').trim().toLowerCase() === t.toLowerCase()) &&
                        c.type === 'board_relation');
                    return col === null || col === void 0 ? void 0 : col.id;
                };
                const orderCol = findConnectCol('Orders', 'Order');
                const productCol = findConnectCol('Products', 'Product');
                // No direct Customer connect on this board — customer is shown via the
                // "Customers" mirror through Order, so it's read-only and never written here.
                const columnValues = {};
                if (colMap['SKU'])
                    columnValues[colMap['SKU']] = sku;
                if (colMap['Quantity'])
                    columnValues[colMap['Quantity']] = quantity;
                if (orderCol)
                    columnValues[orderCol] = { item_ids: [parseInt(orderId)] };
                if (productCol)
                    columnValues[productCol] = { item_ids: [parseInt(product.id)] };
                if (colMap['Status'])
                    columnValues[colMap['Status']] = { label: 'Ready for Supplier Selection' };
                if (colMap['Created Date'])
                    columnValues[colMap['Created Date']] = { date: dateValue };
                if (colMap['COD (1/0)'] !== undefined)
                    columnValues[colMap['COD (1/0)']] = cod;
                if (!orderCol)
                    console.warn('⚠️ No "Orders" board_relation column found on Order Line Items board — order link not set.');
                if (!productCol)
                    console.warn('⚠️ No "Products" board_relation column found on Order Line Items board — product link not set.');
                yield monday_service_1.default.createItem(token, boards.lineItems, productName, columnValues);
                console.log(`✅ Created line item: "${productName}" | SKU: ${sku} | Qty: ${quantity} | Date: ${dateValue} | COD: ${cod}`);
            }
        });
    }
    static buildColumnMap(columns) {
        const map = {};
        columns.forEach((col) => {
            map[col.title] = col.id;
        });
        return map;
    }
}
exports.ShopifyService = ShopifyService;
