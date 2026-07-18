import MondayService from './monday-service';
import { GraphQLClient } from 'graphql-request';

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

export class ShopifyService {
    
    static async processOrderCreate(shopifyOrder: any) {
        try {
            const MONDAY_API_TOKEN = getMondayToken();
            // Step 1: Parse Shopify data
            const orderData = this.parseShopifyOrder(shopifyOrder);

            // Step 2: Dedup check — skip if this Shopify order ID already exists in Monday
            const ordersColumns = await MondayService.getBoardColumns(MONDAY_API_TOKEN, ORDERS_BOARD_ID);
            const colMap = this.buildColumnMap(ordersColumns);
            if (colMap['OrderId']) {
                const existing = await MondayService.findItemByColumnValue(
                    MONDAY_API_TOKEN, ORDERS_BOARD_ID, colMap['OrderId'], orderData.order.orderId
                );
                if (existing) {
                    console.log(`⚠️ Order ${orderData.order.orderId} already exists in Monday (item: ${existing.id}) — skipping`);
                    return { success: true, customerId: 'existing', orderId: existing.id, duplicate: true };
                }
            }

            // Step 3: Find or create customer
            const customerId = await this.findOrCreateCustomer(orderData.customer, MONDAY_API_TOKEN);

            // Step 4: Create order
            const orderId = await this.createOrder(orderData.order, customerId, MONDAY_API_TOKEN);

            // Step 5: Create line items
            await this.createLineItems(shopifyOrder.line_items, orderId, MONDAY_API_TOKEN, orderData.order.cod, orderData.order.createdAt);

            return { success: true, customerId, orderId };
        } catch (error: any) {
            console.error('❌ Shopify order processing error:', error);
            throw error;
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
            createdAt: data.customer?.created_at || data.created_at || new Date().toISOString(),
            defaultAddress: {
                address1: data.customer?.default_address?.address1 || data.billing_address?.address1 || '',
                province: data.customer?.default_address?.province || data.billing_address?.province || '',
                city: data.customer?.default_address?.city || data.billing_address?.city || '',
                country: data.customer?.default_address?.country || data.billing_address?.country || '',
                zip: data.customer?.default_address?.zip || data.billing_address?.zip || '',
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

    private static async findOrCreateCustomer(customer: any, token: string): Promise<string> {
        // Get column mapping for Customers board
        const columns = await MondayService.getBoardColumns(token, CUSTOMERS_BOARD_ID);
        const colMap = this.buildColumnMap(columns);

        // Find existing customer by ExternalId
        const existingCustomer = await MondayService.findItemByColumnValue(
            token,
            CUSTOMERS_BOARD_ID,
            colMap['ExternalId'],
            customer.shopifyId
        );

        if (existingCustomer) {
            console.log(`✅ Found existing customer: ${existingCustomer.id}`);
            return existingCustomer.id;
        }

        // Create new customer
        const columnValues: any = {};
        if (colMap['Email']) columnValues[colMap['Email']] = { email: customer.email, text: customer.email };
        if (colMap['ExternalId']) columnValues[colMap['ExternalId']] = customer.shopifyId;
        if (colMap['First Name']) columnValues[colMap['First Name']] = customer.firstName;
        if (colMap['Last Name']) columnValues[colMap['Last Name']] = customer.lastName;
        if (colMap['Default Street']) columnValues[colMap['Default Street']] = customer.defaultAddress.address1;
        if (colMap['Default Province']) columnValues[colMap['Default Province']] = customer.defaultAddress.province;
        if (colMap['Default City']) columnValues[colMap['Default City']] = customer.defaultAddress.city;
        if (colMap['Default Country']) columnValues[colMap['Default Country']] = customer.defaultAddress.country;
        if (colMap['Postal Code']) columnValues[colMap['Postal Code']] = customer.defaultAddress.zip;
        if (colMap['Created Date']) columnValues[colMap['Created Date']] = { date: customer.createdAt.split('T')[0] };
        if (colMap['Phone'] && customer.phone) {
            const digitsOnly = customer.phone.replace(/\D/g, '');
            // Strip country code: take last 10 digits for Indian numbers, or use full digits
            const phoneNumber = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
            const countryShortName = customer.defaultAddress.country === 'India' ? 'IN' : 'IN';
            if (phoneNumber.length >= 7) {
                columnValues[colMap['Phone']] = { phone: phoneNumber, countryShortName };
            }
        }

        const newCustomer = await MondayService.createItem(
            token,
            CUSTOMERS_BOARD_ID,
            customer.itemName,
            columnValues
        );

        console.log(`✅ Created new customer: ${newCustomer.id}`);
        return newCustomer.id;
    }

    private static async withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (err: any) {
                const is503 = err?.response?.status === 503 || err?.message?.includes('503');
                if (is503 && attempt < retries) {
                    console.log(`⚠️ 503 error, retrying in ${delayMs}ms (attempt ${attempt}/${retries})...`);
                    await new Promise(r => setTimeout(r, delayMs));
                } else {
                    throw err;
                }
            }
        }
        throw new Error('Max retries exceeded');
    }

    private static async getNextOrderName(token: string): Promise<string> {
        const client = new GraphQLClient('https://api.monday.com/v2', {
            headers: { Authorization: token }
        });
        const query = `query ($boardId: ID!) {
            boards(ids: [$boardId]) {
                items_count
            }
        }`;
        const response: any = await this.withRetry(() => client.request(query, { boardId: ORDERS_BOARD_ID }));
        const count = (response?.boards?.[0]?.items_count || 0) + 1;
        return `ORD-${String(count).padStart(4, '0')}`;
    }

    private static async createOrder(order: any, customerId: string, token: string): Promise<string> {
        const columns = await MondayService.getBoardColumns(token, ORDERS_BOARD_ID);
        const colMap = this.buildColumnMap(columns);

        const orderName = await this.getNextOrderName(token);

        const columnValues: any = {};
        if (colMap['OrderId']) columnValues[colMap['OrderId']] = order.orderId;
        if (colMap['Name']) columnValues[colMap['Name']] = order.orderName;
        if (colMap['Notes']) columnValues[colMap['Notes']] = order.notes;
        // The Orders board column is titled "Total Price" (with a space); keep the
        // no-space fallback for safety. This is the value the WhatsApp {{2}} reads.
        const totalPriceColId = colMap['Total Price'] || colMap['TotalPrice'];
        if (totalPriceColId) columnValues[totalPriceColId] = order.totalPrice;
        if (colMap['Discount']) columnValues[colMap['Discount']] = order.discount;
        if (colMap['Customer ExternalId']) columnValues[colMap['Customer ExternalId']] = order.customerShopifyId;
        // Populate the real billing/shipping addresses from the Shopify order.
        // Shopify may omit the shipping address (e.g. digital/pickup orders) — fall back to billing.
        const shippingAddress = order.shippingAddress || order.billingAddress;
        if (colMap['Billing Address']) columnValues[colMap['Billing Address']] = order.billingAddress;
        if (colMap['Shipping Address']) columnValues[colMap['Shipping Address']] = shippingAddress;
        if (colMap['Date']) columnValues[colMap['Date']] = { date: order.createdAt.split('T')[0] };
        if (colMap['Customers']) columnValues[colMap['Customers']] = { item_ids: [parseInt(customerId)] };
        if (colMap['Order Type']) columnValues[colMap['Order Type']] = { label: 'Order' };
        if (colMap['COD'] !== undefined) columnValues[colMap['COD']] = order.cod;
        if (colMap['Source']) columnValues[colMap['Source']] = { label: 'Shopify' };

        const newOrder = await MondayService.createItem(
            token,
            ORDERS_BOARD_ID,
            orderName,
            columnValues
        );

        console.log(`✅ Created order: ${newOrder.id} as ${orderName}`);
        return newOrder.id;
    }

    private static async fetchProductsFromBoard(token: string): Promise<any[]> {
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
        const response: any = await this.withRetry(() => client.request(query, { boardId: PRODUCTS_BOARD_ID }));
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
            console.log(`✅ Found existing product: "${product.name}" (id: ${product.id})`);
            return product;
        }

        console.log(`📦 Product "${productName}" not found in Products board — creating...`);
        const productColumns = await MondayService.getBoardColumns(token, PRODUCTS_BOARD_ID);
        const findCol = (title: string) =>
            productColumns.find((c: any) => (c.title || '').trim().toLowerCase() === title.toLowerCase());
        const findColByKeyword = (kw: string) =>
            productColumns.find((c: any) => (c.title || '').toLowerCase().includes(kw));

        const productColumnValues: any = {};

        const skuCol = findCol('SKU');
        if (skuCol && sku) productColumnValues[skuCol.id] = sku;

        const priceCol = findCol('Selling Price(Per Unit)');
        if (priceCol && price) productColumnValues[priceCol.id] = price;

        const categoryCol = findCol('Category');
        if (categoryCol && category) productColumnValues[categoryCol.id] = this.formatColumnValue(categoryCol.type, category);

        // Weight column matched loosely (e.g. "Weight", "Weight (kg)").
        const weightCol = findColByKeyword('weight');
        if (weightCol && weight) productColumnValues[weightCol.id] = this.formatColumnValue(weightCol.type, weight);

        const newProduct = await MondayService.createItem(token, PRODUCTS_BOARD_ID, productName, productColumnValues);
        const created = { id: newProduct.id, name: productName, sku };
        existingProducts.push(created);
        console.log(`✅ Created product: "${productName}" (id: ${newProduct.id}) | Price: ${price} | Category: ${category} | Weight: ${weight}`);
        return created;
    }

    private static async createLineItems(lineItems: any[], orderId: string, token: string, cod: number, orderDate?: string): Promise<void> {
        if (!lineItems || lineItems.length === 0) return;

        const [lineItemColumns, existingProducts] = await Promise.all([
            MondayService.getBoardColumns(token, LINE_ITEMS_BOARD_ID),
            this.fetchProductsFromBoard(token)
        ]);
        const colMap = this.buildColumnMap(lineItemColumns);

        const dateValue = (orderDate || new Date().toISOString()).split('T')[0];

        console.log(`📋 Creating ${lineItems.length} line item(s) from Shopify order | Date: ${dateValue}`);

        for (const item of lineItems) {
            const productName = item.title || item.name || 'Unknown Product';
            const sku         = item.sku || '';
            const quantity    = item.quantity || 1;
            const price       = String(item.price || '0');
            // Shopify line_item.grams is the per-unit weight in grams; store it in kg.
            const weight      = item.grams ? String(item.grams / 1000) : '';

            console.log(`🔍 Processing line item: "${productName}" | SKU: ${sku} | Qty: ${quantity} | Price: ${price} | Weight: ${weight}kg`);

            // Category intentionally not populated (left for later) — passed as ''.
            const product = await this.findOrCreateProduct(token, productName, sku, existingProducts, price, '', weight);

            const columnValues: any = {};
            if (colMap['SKU'])       columnValues[colMap['SKU']]      = sku;
            if (colMap['Quantity'])  columnValues[colMap['Quantity']]  = quantity;
            if (colMap['Order'])     columnValues[colMap['Order']]     = { item_ids: [parseInt(orderId)] };
            if (colMap['Product'])   columnValues[colMap['Product']]   = { item_ids: [parseInt(product.id)] };
            if (colMap['Status'])    columnValues[colMap['Status']]    = { label: 'Ready for Supplier Selection' };
            if (colMap['Date'])      columnValues[colMap['Date']]      = { date: dateValue };
            if (colMap['COD (1/0)'] !== undefined) columnValues[colMap['COD (1/0)']] = cod;

            await MondayService.createItem(token, LINE_ITEMS_BOARD_ID, productName, columnValues);
            console.log(`✅ Created line item: "${productName}" | SKU: ${sku} | Qty: ${quantity} | Date: ${dateValue} | COD: ${cod}`);
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
