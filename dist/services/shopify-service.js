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
const CUSTOMERS_BOARD_ID = process.env.CUSTOMERS_BOARD_ID || '2023614887';
const ORDERS_BOARD_ID = process.env.ORDERS_BOARD_ID || '2023614902';
const LINE_ITEMS_BOARD_ID = process.env.LINE_ITEMS_BOARD_ID || '2028904077';
const PRODUCTS_BOARD_ID = process.env.PRODUCTS_BOARD_ID || '2026780342';
function getMondayToken() {
    const token = process.env.MONDAY_API_TOKEN;
    if (!token) {
        throw new Error('MONDAY_API_TOKEN not found in environment variables');
    }
    return token;
}
class ShopifyService {
    static processOrderCreate(shopifyOrder) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const MONDAY_API_TOKEN = getMondayToken();
                // Step 1: Parse Shopify data
                const orderData = this.parseShopifyOrder(shopifyOrder);
                // Step 2: Dedup check — skip if this Shopify order ID already exists in Monday
                const ordersColumns = yield monday_service_1.default.getBoardColumns(MONDAY_API_TOKEN, ORDERS_BOARD_ID);
                const colMap = this.buildColumnMap(ordersColumns);
                if (colMap['OrderId']) {
                    const existing = yield monday_service_1.default.findItemByColumnValue(MONDAY_API_TOKEN, ORDERS_BOARD_ID, colMap['OrderId'], orderData.order.orderId);
                    if (existing) {
                        console.log(`⚠️ Order ${orderData.order.orderId} already exists in Monday (item: ${existing.id}) — skipping`);
                        return { success: true, customerId: 'existing', orderId: existing.id, duplicate: true };
                    }
                }
                // Step 3: Find or create customer
                const customerId = yield this.findOrCreateCustomer(orderData.customer, MONDAY_API_TOKEN);
                // Step 4: Create order
                const orderId = yield this.createOrder(orderData.order, customerId, MONDAY_API_TOKEN);
                // Step 5: Create line items
                yield this.createLineItems(shopifyOrder.line_items, orderId, MONDAY_API_TOKEN, orderData.order.cod, orderData.order.createdAt);
                return { success: true, customerId, orderId };
            }
            catch (error) {
                console.error('❌ Shopify order processing error:', error);
                throw error;
            }
        });
    }
    static parseShopifyOrder(data) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
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
            createdAt: ((_j = data.customer) === null || _j === void 0 ? void 0 : _j.created_at) || data.created_at || new Date().toISOString(),
            defaultAddress: {
                address1: ((_l = (_k = data.customer) === null || _k === void 0 ? void 0 : _k.default_address) === null || _l === void 0 ? void 0 : _l.address1) || ((_m = data.billing_address) === null || _m === void 0 ? void 0 : _m.address1) || '',
                province: ((_p = (_o = data.customer) === null || _o === void 0 ? void 0 : _o.default_address) === null || _p === void 0 ? void 0 : _p.province) || ((_q = data.billing_address) === null || _q === void 0 ? void 0 : _q.province) || '',
                city: ((_s = (_r = data.customer) === null || _r === void 0 ? void 0 : _r.default_address) === null || _s === void 0 ? void 0 : _s.city) || ((_t = data.billing_address) === null || _t === void 0 ? void 0 : _t.city) || '',
                country: ((_v = (_u = data.customer) === null || _u === void 0 ? void 0 : _u.default_address) === null || _v === void 0 ? void 0 : _v.country) || ((_w = data.billing_address) === null || _w === void 0 ? void 0 : _w.country) || '',
                zip: ((_y = (_x = data.customer) === null || _x === void 0 ? void 0 : _x.default_address) === null || _y === void 0 ? void 0 : _y.zip) || ((_z = data.billing_address) === null || _z === void 0 ? void 0 : _z.zip) || '',
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
    static findOrCreateCustomer(customer, token) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get column mapping for Customers board
            const columns = yield monday_service_1.default.getBoardColumns(token, CUSTOMERS_BOARD_ID);
            const colMap = this.buildColumnMap(columns);
            // Find existing customer by ExternalId
            const existingCustomer = yield monday_service_1.default.findItemByColumnValue(token, CUSTOMERS_BOARD_ID, colMap['ExternalId'], customer.shopifyId);
            if (existingCustomer) {
                console.log(`✅ Found existing customer: ${existingCustomer.id}`);
                return existingCustomer.id;
            }
            // Create new customer
            const columnValues = {};
            if (colMap['Email'])
                columnValues[colMap['Email']] = { email: customer.email, text: customer.email };
            if (colMap['ExternalId'])
                columnValues[colMap['ExternalId']] = customer.shopifyId;
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
            if (colMap['Created Date'])
                columnValues[colMap['Created Date']] = { date: customer.createdAt.split('T')[0] };
            if (colMap['Phone'] && customer.phone) {
                const digitsOnly = customer.phone.replace(/\D/g, '');
                // Strip country code: take last 10 digits for Indian numbers, or use full digits
                const phoneNumber = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
                const countryShortName = customer.defaultAddress.country === 'India' ? 'IN' : 'IN';
                if (phoneNumber.length >= 7) {
                    columnValues[colMap['Phone']] = { phone: phoneNumber, countryShortName };
                }
            }
            const newCustomer = yield monday_service_1.default.createItem(token, CUSTOMERS_BOARD_ID, customer.itemName, columnValues);
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
    static getNextOrderName(token) {
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
            const response = yield this.withRetry(() => client.request(query, { boardId: ORDERS_BOARD_ID }));
            const count = (((_b = (_a = response === null || response === void 0 ? void 0 : response.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.items_count) || 0) + 1;
            return `ORD-${String(count).padStart(4, '0')}`;
        });
    }
    static createOrder(order, customerId, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const columns = yield monday_service_1.default.getBoardColumns(token, ORDERS_BOARD_ID);
            const colMap = this.buildColumnMap(columns);
            const orderName = yield this.getNextOrderName(token);
            const columnValues = {};
            if (colMap['OrderId'])
                columnValues[colMap['OrderId']] = order.orderId;
            if (colMap['Name'])
                columnValues[colMap['Name']] = order.orderName;
            if (colMap['Notes'])
                columnValues[colMap['Notes']] = order.notes;
            // The Orders board column is titled "Total Price" (with a space); keep the
            // no-space fallback for safety. This is the value the WhatsApp {{2}} reads.
            const totalPriceColId = colMap['Total Price'] || colMap['TotalPrice'];
            if (totalPriceColId)
                columnValues[totalPriceColId] = order.totalPrice;
            const subtotalColId = colMap['Subtotal Price'] || colMap['SubtotalPrice'];
            if (subtotalColId)
                columnValues[subtotalColId] = order.subtotalPrice;
            if (colMap['Discount'])
                columnValues[colMap['Discount']] = order.discount;
            if (colMap['Customer ExternalId'])
                columnValues[colMap['Customer ExternalId']] = order.customerShopifyId;
            const fixedAddress = 'Central Spine Vidhyadhar Nagar, Jaipur, Rajasthan, India, 302012';
            if (colMap['Billing Address'])
                columnValues[colMap['Billing Address']] = fixedAddress;
            if (colMap['Shipping Address'])
                columnValues[colMap['Shipping Address']] = fixedAddress;
            if (colMap['Date'])
                columnValues[colMap['Date']] = { date: order.createdAt.split('T')[0] };
            if (colMap['Customers'])
                columnValues[colMap['Customers']] = { item_ids: [parseInt(customerId)] };
            if (colMap['Order Type'])
                columnValues[colMap['Order Type']] = { label: 'Order' };
            if (colMap['COD'] !== undefined)
                columnValues[colMap['COD']] = order.cod;
            if (colMap['Source'])
                columnValues[colMap['Source']] = { label: 'Shopify' };
            const newOrder = yield monday_service_1.default.createItem(token, ORDERS_BOARD_ID, orderName, columnValues);
            console.log(`✅ Created order: ${newOrder.id} as ${orderName}`);
            return newOrder.id;
        });
    }
    static fetchProductsFromBoard(token) {
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
            const response = yield this.withRetry(() => client.request(query, { boardId: PRODUCTS_BOARD_ID }));
            const items = ((_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.items_page) === null || _c === void 0 ? void 0 : _c.items) || [];
            return items.map((item) => {
                var _a;
                const skuCol = (_a = item.column_values) === null || _a === void 0 ? void 0 : _a.find((col) => { var _a; return ((_a = col.column) === null || _a === void 0 ? void 0 : _a.title) === 'SKU'; });
                return { id: item.id, name: item.name, sku: (skuCol === null || skuCol === void 0 ? void 0 : skuCol.text) || '' };
            });
        });
    }
    static findOrCreateProduct(token, productName, sku, existingProducts, price = '', category = '') {
        return __awaiter(this, void 0, void 0, function* () {
            // Match by SKU first, then by name (case-insensitive)
            let product = existingProducts.find(p => (sku && p.sku && p.sku.toLowerCase() === sku.toLowerCase()) ||
                p.name.toLowerCase() === productName.toLowerCase());
            if (product) {
                console.log(`✅ Found existing product: "${product.name}" (id: ${product.id})`);
                return product;
            }
            console.log(`📦 Product "${productName}" not found in Products board — creating...`);
            const productColumns = yield monday_service_1.default.getBoardColumns(token, PRODUCTS_BOARD_ID);
            const productColMap = this.buildColumnMap(productColumns);
            const productColumnValues = {};
            if (productColMap['SKU'] && sku)
                productColumnValues[productColMap['SKU']] = sku;
            if (productColMap['Selling Price(Per Unit)'] && price)
                productColumnValues[productColMap['Selling Price(Per Unit)']] = price;
            if (productColMap['Category'] && category)
                productColumnValues[productColMap['Category']] = category;
            const newProduct = yield monday_service_1.default.createItem(token, PRODUCTS_BOARD_ID, productName, productColumnValues);
            const created = { id: newProduct.id, name: productName, sku };
            existingProducts.push(created);
            console.log(`✅ Created product: "${productName}" (id: ${newProduct.id}) | Price: ${price} | Category: ${category}`);
            return created;
        });
    }
    static createLineItems(lineItems, orderId, token, cod, orderDate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!lineItems || lineItems.length === 0)
                return;
            const [lineItemColumns, existingProducts] = yield Promise.all([
                monday_service_1.default.getBoardColumns(token, LINE_ITEMS_BOARD_ID),
                this.fetchProductsFromBoard(token)
            ]);
            const colMap = this.buildColumnMap(lineItemColumns);
            const dateValue = (orderDate || new Date().toISOString()).split('T')[0];
            console.log(`📋 Creating ${lineItems.length} line item(s) from Shopify order | Date: ${dateValue}`);
            for (const item of lineItems) {
                const productName = item.title || item.name || 'Unknown Product';
                const sku = item.sku || '';
                const quantity = item.quantity || 1;
                const price = String(item.price || '0');
                const category = item.product_type || '';
                console.log(`🔍 Processing line item: "${productName}" | SKU: ${sku} | Qty: ${quantity} | Price: ${price} | Category: ${category}`);
                const product = yield this.findOrCreateProduct(token, productName, sku, existingProducts, price, category);
                const columnValues = {};
                if (colMap['SKU'])
                    columnValues[colMap['SKU']] = sku;
                if (colMap['Quantity'])
                    columnValues[colMap['Quantity']] = quantity;
                if (colMap['Order'])
                    columnValues[colMap['Order']] = { item_ids: [parseInt(orderId)] };
                if (colMap['Product'])
                    columnValues[colMap['Product']] = { item_ids: [parseInt(product.id)] };
                if (colMap['Status'])
                    columnValues[colMap['Status']] = { label: 'Ready for Supplier Selection' };
                if (colMap['Date'])
                    columnValues[colMap['Date']] = { date: dateValue };
                if (colMap['COD (1/0)'] !== undefined)
                    columnValues[colMap['COD (1/0)']] = cod;
                yield monday_service_1.default.createItem(token, LINE_ITEMS_BOARD_ID, productName, columnValues);
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
