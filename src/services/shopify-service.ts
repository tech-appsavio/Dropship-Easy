import MondayService from './monday-service';
import { GraphQLClient } from 'graphql-request';
import { getAccountByShop, getAccountConfig, resolveMondayToken, deleteAccountToken } from './account-store';
import { provisionAccount } from './board-provisioning';

interface Boards { customers: string; orders: string; lineItems: string; products: string; }

// In-memory guard against Shopify webhook retries / duplicate deliveries creating the
// same order more than once (complements the persistent Monday dedup below).
const processingOrders = new Set<string>();

export class ShopifyService {

    // The monday account is resolved from the webhook URL's token (Option A) and passed
    // in as opts.accountId. shopDomain is kept only as a legacy fallback / for logging.
    static async processOrderCreate(shopifyOrder: any, opts?: { accountId?: string | null; shopDomain?: string }) {
        const shopDomain = opts?.shopDomain;
        const orderKey = String(shopifyOrder.id);
        if (processingOrders.has(orderKey)) {
            return { success: true, duplicate: true, orderId: '' };
        }
        processingOrders.add(orderKey);

        try {
            // Account comes from the per-account webhook token in the URL. Fall back to a
            // shop-domain lookup only for the legacy shared endpoint.
            const accountId = opts?.accountId || (shopDomain ? await getAccountByShop(shopDomain) : null);
            const MONDAY_API_TOKEN = await resolveMondayToken(accountId);
            if (!MONDAY_API_TOKEN) {
                throw new Error(`No monday token available for account "${accountId ?? 'unknown'}" (shop "${shopDomain ?? 'unknown'}") — this account must complete OAuth (Connect) in Account Settings.`);
            }

            // Verify the token is still valid. It gets REVOKED when the app is uninstalled,
            // yet survives in storage across reinstall — so a stale token would otherwise
            // fail deep inside create_item with a confusing NOT_AUTHENTICATED. Clear it and
            // prompt reconnection instead.
            if (accountId && !(await MondayService.isTokenValid(MONDAY_API_TOKEN))) {
                await deleteAccountToken(String(accountId));
                throw new Error(`monday OAuth token for account "${accountId}" is invalid/expired (the app was likely uninstalled & reinstalled). Reconnect via Account Settings → Connect, then retry.`);
            }

            // Resolve this account's provisioned board IDs STRICTLY from its own config —
            // no hardcoded dev-board fallback (multi-tenant isolation). If the account isn't
            // provisioned yet, provision now rather than writing to some default board.
            let config = accountId ? await getAccountConfig(accountId) : null;
            const boardsMissing = (c: any) => !c?.boards?.customers || !c?.boards?.orders || !c?.boards?.lineItems || !c?.boards?.products;
            if (accountId && boardsMissing(config)) {
                console.warn(`🩹 [shopify] account "${accountId}" not fully provisioned — provisioning now`);
                config = await provisionAccount(String(accountId), MONDAY_API_TOKEN);
            }
            const boards: Boards = {
                customers: config?.boards?.customers || '',
                orders:    config?.boards?.orders    || '',
                lineItems: config?.boards?.lineItems || '',
                products:  config?.boards?.products  || '',
            };
            if (!boards.customers || !boards.orders || !boards.lineItems || !boards.products) {
                throw new Error(`This monday account is not fully set up (provisioned boards missing) for account "${accountId ?? 'unknown'}". Open the app and complete setup, then retry.`);
            }

            // Verify the resolved boards actually exist for this token. A stale config
            // (board deleted after provisioning) would otherwise fail deep inside with a
            // confusing InvalidBoardIdException. If any is missing AND we have an account,
            // self-heal by re-provisioning server-side (prunes dead IDs, reuses existing
            // boards by name, recreates the rest), then re-resolve — no manual step needed.
            let missingBoards = await MondayService.findMissingBoards(MONDAY_API_TOKEN, Object.values(boards));
            if (missingBoards.length && accountId) {
                console.warn(`🩹 [shopify] boards missing for account "${accountId}": [${missingBoards.join(', ')}] — re-provisioning to repair…`);
                const repaired = await provisionAccount(String(accountId), MONDAY_API_TOKEN);
                boards.customers = repaired.boards?.customers || boards.customers;
                boards.orders    = repaired.boards?.orders    || boards.orders;
                boards.lineItems = repaired.boards?.lineItems || boards.lineItems;
                boards.products  = repaired.boards?.products  || boards.products;
                missingBoards = await MondayService.findMissingBoards(MONDAY_API_TOKEN, Object.values(boards));
            }
            if (missingBoards.length) {
                throw new Error(
                    `Configured board(s) still do not exist after repair: [${missingBoards.join(', ')}] ` +
                    `(account="${accountId}", shop="${shopDomain}"). Open the Multi-Order Processing view once, then retry.`
                );
            }

            // Step 1: Parse Shopify data
            const orderData = this.parseShopifyOrder(shopifyOrder);

            // Step 2: Dedup check — skip if this Shopify order ID already exists in Monday
            const ordersColumns = await MondayService.getBoardColumns(MONDAY_API_TOKEN, boards.orders);
            const colMap = this.buildColumnMap(ordersColumns);
            const orderIdColId = colMap['Shopify Order ID'] || colMap['Order ID'] || colMap['OrderId'];
            if (orderIdColId) {
                const existing = await MondayService.findItemByColumnValue(
                    MONDAY_API_TOKEN, boards.orders, orderIdColId, orderData.order.orderId
                );
                if (existing) {
                    return { success: true, customerId: 'existing', orderId: existing.id, duplicate: true };
                }
            } else {
                console.warn(`⚠️ No "Shopify Order ID" column on the Orders board — dedup disabled, duplicates possible.`);
            }

            // Step 3: Find or create customer
            const customerId = await this.findOrCreateCustomer(orderData.customer, MONDAY_API_TOKEN, boards.customers);

            // Step 4: Create order
            const orderId = await this.createOrder(orderData.order, customerId, MONDAY_API_TOKEN, boards.orders);

            // Step 5: Create line items
            await this.createLineItems(shopifyOrder.line_items, orderId, MONDAY_API_TOKEN, orderData.order.cod, boards, orderData.order.createdAt);

            return { success: true, customerId, orderId };
        } catch (error: any) {
            console.error('❌ Shopify order processing error:', error);
            throw error;
        } finally {
            // Keep the guard for a minute so rapid retries are skipped; after that the
            // persistent Monday dedup (by Order ID) catches any late retry / post-restart.
            setTimeout(() => processingOrders.delete(orderKey), 60000);
        }
    }

    private static parseShopifyOrder(data: any) {
        // Phone fallback: customer.phone > customer.default_address.phone > billing_address.phone > order.phone
        const rawPhone = data.customer?.phone
            || data.customer?.default_address?.phone
            || data.billing_address?.phone
            || data.phone
            || '';

        const customer = {
            shopifyId: String(data.customer?.id || ''),
            firstName: data.customer?.first_name || '',
            lastName: data.customer?.last_name || '',
            email: data.customer?.email || '',
            phone: rawPhone,
            // "Created Date" = when this record enters the system (the ORDER's date), matching
            // Orders and Line Items. Do NOT use the customer's Shopify signup date
            // (data.customer.created_at) — that can be months/years old and misrepresents when
            // the customer record was created here.
            createdAt: data.created_at || new Date().toISOString(),
            defaultAddress: {
                address1: data.customer?.default_address?.address1 || data.billing_address?.address1 || '',
                province: data.customer?.default_address?.province || data.billing_address?.province || '',
                city: data.customer?.default_address?.city || data.billing_address?.city || '',
                country: data.customer?.default_address?.country || data.billing_address?.country || '',
                zip: data.customer?.default_address?.zip || data.billing_address?.zip || '',
            },
            // Order-level billing_address specifically (falls back to default_address if
            // the order itself has no billing_address, e.g. some manual/API-created orders).
            billingAddress: {
                address1: data.billing_address?.address1 || data.customer?.default_address?.address1 || '',
                province: data.billing_address?.province || data.customer?.default_address?.province || '',
                city: data.billing_address?.city || data.customer?.default_address?.city || '',
                country: data.billing_address?.country || data.customer?.default_address?.country || '',
                zip: data.billing_address?.zip || data.customer?.default_address?.zip || '',
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

        return { customer: { ...customer, itemName: customerItemName }, order };
    }

    private static formatAddress(addr: any): string {
        if (!addr) return '';
        return `${addr.first_name || ''} ${addr.last_name || ''}, ${addr.address1 || ''}, ${addr.city || ''}, ${addr.province || ''}, ${addr.country || ''}, ${addr.zip || ''}`.trim();
    }

    private static async findOrCreateCustomer(customer: any, token: string, customersBoardId: string): Promise<string> {
        // Get column mapping for Customers board
        const columns = await MondayService.getBoardColumns(token, customersBoardId);
        const colMap = this.buildColumnMap(columns);

        // Resolve the External ID column robustly (accept legacy "ExternalId" too). If this
        // column can't be found, dedup can't work and duplicate customers get created.
        const externalIdCol = colMap['External ID'] || colMap['ExternalId'];
        if (!externalIdCol) {
            console.warn('⚠️ No "External ID" column on the Customers board — customer dedup disabled, duplicates possible.');
        }

        // Find existing customer by External ID (only when we have both the column and a value)
        if (externalIdCol && customer.shopifyId) {
            const existingCustomer = await MondayService.findItemByColumnValue(
                token,
                customersBoardId,
                externalIdCol,
                customer.shopifyId
            );
            if (existingCustomer) {
                return existingCustomer.id;
            }
        }

        // Create new customer
        const columnValues: any = {};
        if (colMap['Email']) columnValues[colMap['Email']] = { email: customer.email, text: customer.email };
        if (externalIdCol) columnValues[externalIdCol] = customer.shopifyId;
        if (colMap['First Name']) columnValues[colMap['First Name']] = customer.firstName;
        if (colMap['Last Name']) columnValues[colMap['Last Name']] = customer.lastName;
        if (colMap['Default Street']) columnValues[colMap['Default Street']] = customer.defaultAddress.address1;
        if (colMap['Default Province']) columnValues[colMap['Default Province']] = customer.defaultAddress.province;
        if (colMap['Default City']) columnValues[colMap['Default City']] = customer.defaultAddress.city;
        if (colMap['Default Country']) columnValues[colMap['Default Country']] = customer.defaultAddress.country;
        if (colMap['Postal Code']) columnValues[colMap['Postal Code']] = customer.defaultAddress.zip;
        if (colMap['Billing Street']) columnValues[colMap['Billing Street']] = customer.billingAddress.address1;
        if (colMap['Billing City']) columnValues[colMap['Billing City']] = customer.billingAddress.city;
        if (colMap['Billing State']) columnValues[colMap['Billing State']] = customer.billingAddress.province;
        if (colMap['Billing Country']) columnValues[colMap['Billing Country']] = customer.billingAddress.country;
        if (colMap['Billing Postal Code']) columnValues[colMap['Billing Postal Code']] = customer.billingAddress.zip;
        if (colMap['Created Date']) columnValues[colMap['Created Date']] = { date: customer.createdAt.split('T')[0] };
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

        const newCustomer = await MondayService.createItem(
            token,
            customersBoardId,
            customer.itemName,
            columnValues
        );

        return newCustomer.id;
    }

    private static async withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (err: any) {
                const is503 = err?.response?.status === 503 || err?.message?.includes('503');
                if (is503 && attempt < retries) {
                    await new Promise(r => setTimeout(r, delayMs));
                } else {
                    throw err;
                }
            }
        }
        throw new Error('Max retries exceeded');
    }

    private static async getNextOrderName(token: string, ordersBoardId: string): Promise<string> {
        const client = new GraphQLClient('https://api.monday.com/v2', {
            headers: { Authorization: token }
        });
        const query = `query ($boardId: ID!) {
            boards(ids: [$boardId]) {
                items_count
            }
        }`;
        const response: any = await this.withRetry(() => client.request(query, { boardId: ordersBoardId }));
        const count = (response?.boards?.[0]?.items_count || 0) + 1;
        return `ORD-${String(count).padStart(4, '0')}`;
    }

    private static async createOrder(order: any, customerId: string, token: string, ordersBoardId: string): Promise<string> {
        const columns = await MondayService.getBoardColumns(token, ordersBoardId);
        const colMap = this.buildColumnMap(columns);

        const orderName = await this.getNextOrderName(token, ordersBoardId);

        const columnValues: any = {};
        const orderIdCol = colMap['Shopify Order ID'] || colMap['Order ID'] || colMap['OrderId'];
        if (orderIdCol) columnValues[orderIdCol] = order.orderId;
        if (colMap['Notes']) columnValues[colMap['Notes']] = order.notes;
        // The Orders board column is titled "Total Price" (with a space); keep the
        // no-space fallback for safety. This is the value the WhatsApp {{2}} reads.
        const totalPriceColId = colMap['Total Price'] || colMap['TotalPrice'];
        if (totalPriceColId) columnValues[totalPriceColId] = order.totalPrice;
        if (colMap['Discount']) columnValues[colMap['Discount']] = order.discount;
        // Orders board customer-id column is "Customer External ID" (accept legacy "External ID").
        const customerExtIdCol = colMap['Customer External ID'] || colMap['External ID'];
        if (customerExtIdCol) columnValues[customerExtIdCol] = order.customerShopifyId;
        // Populate the real billing/shipping addresses from the Shopify order.
        // Shopify may omit the shipping address (e.g. digital/pickup orders) — fall back to billing.
        const shippingAddress = order.shippingAddress || order.billingAddress;
        if (colMap['Billing Address']) columnValues[colMap['Billing Address']] = order.billingAddress;
        if (colMap['Shipping Address']) columnValues[colMap['Shipping Address']] = shippingAddress;
        if (colMap['Created Date']) columnValues[colMap['Created Date']] = { date: order.createdAt.split('T')[0] };
        if (colMap['Customers']) columnValues[colMap['Customers']] = { item_ids: [parseInt(customerId)] };
        if (colMap['Order Type']) columnValues[colMap['Order Type']] = { label: 'Order' };
        if (colMap['COD'] !== undefined) columnValues[colMap['COD']] = order.cod;
        // Source is a plain text column; keep a status fallback for boards provisioned
        // before this changed from a status column.
        const sourceCol = columns.find((c: any) => c.title === 'Source');
        if (sourceCol) columnValues[sourceCol.id] = sourceCol.type === 'status' ? { label: 'Shopify' } : 'Shopify';

        const newOrder = await MondayService.createItem(
            token,
            ordersBoardId,
            orderName,
            columnValues
        );

        return newOrder.id;
    }

    private static async fetchProductsFromBoard(token: string, productsBoardId: string): Promise<any[]> {
        const client = new GraphQLClient('https://api.monday.com/v2', {
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
        const response: any = await this.withRetry(() => client.request(query, { boardId: productsBoardId }));
        const items = response?.boards?.[0]?.items_page?.items || [];
        return items.map((item: any) => {
            const skuCol = item.column_values?.find((col: any) => col.column?.title === 'SKU');
            return { id: item.id, name: item.name, sku: skuCol?.text || '' };
        });
    }

    // Formats a value for Monday's create_item mutation based on the target column type,
    // so status/dropdown columns take the value instead of silently rejecting a plain string.
    private static formatColumnValue(type: string, value: string): any {
        switch (type) {
            case 'status':   return { label: String(value) };
            case 'dropdown': return { labels: [String(value)] };
            default:         return String(value); // text, numbers, etc.
        }
    }

    private static async findOrCreateProduct(
        token: string,
        productName: string,
        sku: string,
        existingProducts: any[],
        productsBoardId: string,
        price: string = '',
        category: string = '',
        weight: string = ''
    ): Promise<any> {
        // Match by SKU first, then by name (case-insensitive)
        let product = existingProducts.find(p =>
            (sku && p.sku && p.sku.toLowerCase() === sku.toLowerCase()) ||
            p.name.toLowerCase() === productName.toLowerCase()
        );

        if (product) {
            return product;
        }

        const productColumns = await MondayService.getBoardColumns(token, productsBoardId);
        const findCol = (title: string) =>
            productColumns.find((c: any) => (c.title || '').trim().toLowerCase() === title.toLowerCase());
        const findColByKeyword = (kw: string) =>
            productColumns.find((c: any) => (c.title || '').toLowerCase().includes(kw));

        const productColumnValues: any = {};

        const skuCol = findCol('SKU');
        if (skuCol && sku) productColumnValues[skuCol.id] = sku;

        // Confirmed real title has no space before the parenthesis; keep the spaced
        // variant as a fallback in case a differently-provisioned board uses it.
        const priceCol = findCol('Selling Price(Per Unit)') || findCol('Selling Price (Per Unit)');
        if (priceCol && price) productColumnValues[priceCol.id] = price;
        else if (!priceCol) console.warn('⚠️ No "Selling Price(Per Unit)" column found on the Products board — price not set.');

        const categoryCol = findCol('Category');
        if (categoryCol && category) productColumnValues[categoryCol.id] = this.formatColumnValue(categoryCol.type, category);

        // Weight column matched loosely (e.g. "Weight", "Weight (kg)").
        const weightCol = findColByKeyword('weight');
        if (weightCol && weight) productColumnValues[weightCol.id] = this.formatColumnValue(weightCol.type, weight);

        const newProduct = await MondayService.createItem(token, productsBoardId, productName, productColumnValues);
        const created = { id: newProduct.id, name: productName, sku };
        existingProducts.push(created);
        return created;
    }

    private static async createLineItems(lineItems: any[], orderId: string, token: string, cod: number, boards: Boards, orderDate?: string): Promise<void> {
        if (!lineItems || lineItems.length === 0) return;

        const [lineItemColumns, existingProducts] = await Promise.all([
            MondayService.getBoardColumns(token, boards.lineItems),
            this.fetchProductsFromBoard(token, boards.products)
        ]);
        const colMap = this.buildColumnMap(lineItemColumns);

        const dateValue = (orderDate || new Date().toISOString()).split('T')[0];


        for (const item of lineItems) {
            const productName = item.title || item.name || 'Unknown Product';
            const sku         = item.sku || '';
            const quantity    = item.quantity || 1;
            const price       = String(item.price || '0');
            // Shopify line_item.grams is the per-unit weight in grams; store it in kg.
            const weight      = item.grams ? String(item.grams / 1000) : '';


            // Category intentionally not populated (left for later) — passed as ''.
            const product = await this.findOrCreateProduct(token, productName, sku, existingProducts, boards.products, price, '', weight);

            // Connect-column titles are the PLURAL of their target board (e.g. "Orders",
            // "Products") — accept the old singular titles too for boards that haven't
            // been renamed yet. Must also be an actual board_relation column: a same-titled
            // mirror/lookup (e.g. "Customers" on this board mirrors the customer through
            // the Order connection — it's intentionally read-only, not a direct connect)
            // can't be written via the API at all, and sending item_ids to one aborts the
            // whole create_item call, so it must be filtered out here.
            const findConnectCol = (...titles: string[]): string | undefined => {
                const col = lineItemColumns.find((c: any) =>
                    titles.some(t => (c.title || '').trim().toLowerCase() === t.toLowerCase()) &&
                    c.type === 'board_relation'
                );
                return col?.id;
            };
            const orderCol = findConnectCol('Orders', 'Order');
            const productCol = findConnectCol('Products', 'Product');
            // No direct Customer connect on this board — customer is shown via the
            // "Customers" mirror through Order, so it's read-only and never written here.

            const columnValues: any = {};
            if (colMap['SKU'])       columnValues[colMap['SKU']]      = sku;
            if (colMap['Quantity'])  columnValues[colMap['Quantity']]  = quantity;
            if (orderCol)            columnValues[orderCol]            = { item_ids: [parseInt(orderId)] };
            if (productCol)          columnValues[productCol]          = { item_ids: [parseInt(product.id)] };
            if (colMap['Status'])    columnValues[colMap['Status']]    = { label: 'Ready for Supplier Selection' };
            if (colMap['Created Date']) columnValues[colMap['Created Date']] = { date: dateValue };
            if (colMap['COD (1/0)'] !== undefined) columnValues[colMap['COD (1/0)']] = cod;

            if (!orderCol) console.warn('⚠️ No "Orders" board_relation column found on Order Line Items board — order link not set.');
            if (!productCol) console.warn('⚠️ No "Products" board_relation column found on Order Line Items board — product link not set.');

            await MondayService.createItem(token, boards.lineItems, productName, columnValues);
        }
    }

    private static buildColumnMap(columns: any[]): Record<string, string> {
        const map: Record<string, string> = {};
        columns.forEach((col: any) => {
            map[col.title] = col.id;
        });
        return map;
    }
}
