
// Per column we store its `key` (the stable identifier used in code), its actual
// monday `title` (used to FETCH the column, populate dropdowns and save mappings),
// and — for columns shown in the app's order/line-item tables — a user-facing
// `label` and a `visible` flag. The label is just what the user sees; only `title`
// is the real monday column name. Each title is defined exactly ONCE here.
//
// Everything downstream is DERIVED from these definitions (no duplication):
//   - <BOARD>_ALL_COLUMN_IDS_MAP  — { key: columnId }, filled at runtime by
//     utils/initColumnIds.ts (resolved from `title`), read by components as MAP.KEY.
//   - <BOARD>_COLUMN_LABELS_VISIBLE / <BOARD>_LABEL_TO_KEY — table display config.
//   - COLUMN_REGISTRY / titleMapOf — used by utils/initColumnIds.ts to resolve IDs.
// Titles marked "unverified" are best-guess Title Case for real live-board columns
// that aren't part of the canonical provisioning schema — confirm against the board
// if a [initColumnIds] console warning appears.

export interface ColumnDef {
    key: string;        // stable identifier used throughout the code
    title?: string;     // actual monday column title (omit for pseudo-columns like the item Name)
    label?: string;     // user-facing label for tables/guide (defaults to title)
    visible?: boolean;  // shown in the MOP order / line-item tables (in array order)
}

export type BoardKey =
    | 'orders' | 'lineItems' | 'products' | 'suppliers'
    | 'supplierProducts' | 'supplierManifests' | 'shipments' | 'customers';

// ── Column definitions (visible columns listed first, in table display order) ──

export const ORDER_COLUMNS: ColumnDef[] = [
    { key: 'name',                   label: 'Name', visible: true },              // monday item name (no column)
    { key: 'CREATEDDATE',            title: 'Created Date', label: 'Created Date', visible: true },
    { key: 'ORDERID',                title: 'Shopify Order ID', label: 'OrderId', visible: true },
    { key: 'STATUS',                 title: 'Status', label: 'Status', visible: true },
    { key: 'TOTAL_PRICE',            title: 'Total Price', label: 'Total Price', visible: true },
    { key: 'CUSTOMER',               title: 'Customers', label: 'Customer', visible: true },
    { key: 'BILLING_ADDRESS',        title: 'Billing Address', label: 'Billing Address', visible: true },
    { key: 'Shiprocket_Order_ID',    title: 'Shiprocket Order ID', label: 'Shiprocket Order ID', visible: true },
    { key: 'Shiprocket_Shipment_ID', title: 'Shiprocket Shipment ID', label: 'Shiprocket Shipment ID', visible: true },
    { key: 'Shiprocket_AWB_ID',      title: 'Shiprocket AWB ID', label: 'Shiprocket AWB ID', visible: true },
    // not shown in the table:
    { key: 'DISCOUNT',               title: 'Discount' },
    { key: 'SHIPPING_ADDRESS',       title: 'Shipping Address' },
    { key: 'DELIVERY_CODE',          title: 'Delivery Code' },            // unverified
    { key: 'SUPPLIER_MANIFEST',      title: 'Supplier Manifests' },       // unverified (connect)
    { key: 'PARENTORDER',            title: 'Parent Orders' },
    { key: 'ASSIGNEE',               title: 'Assignee' },                 // unverified
    { key: 'PAYMENTMETHOD',          title: 'Payment Method' },           // unverified
    { key: 'Order_Type',             title: 'Order Type' },
    { key: 'SOURCE',                 title: 'Source' },
    { key: 'COD',                    title: 'COD' },
];

export const ORDERLINEITEMS_COLUMNS: ColumnDef[] = [
    { key: 'name',                        label: 'Name', visible: true },
    { key: 'SKU',                         title: 'SKU', label: 'SKU', visible: true },
    { key: 'QUANTITY',                    title: 'Quantity', label: 'Qty', visible: true },
    { key: 'PRODUCTWEIGHT',               title: 'Product Weight', label: 'Weight', visible: true },
    { key: 'COD_STATUS',                  title: 'COD (1/0)', label: 'COD', visible: true },
    { key: 'SUPPLIER',                    title: 'Suppliers', label: 'Current Supplier', visible: true },
    { key: 'SPLIT_ORDERS',                title: 'Split Orders', label: 'Split Order', visible: true },
    { key: 'STATUS',                      title: 'Status', label: 'Status', visible: true },
    // not shown in the table:
    { key: 'PRODUCT',                     title: 'Products' },
    { key: 'ORDER',                       title: 'Orders' },
    // "Customers" here is a MIRROR through the Orders connect (read-only) — there is
    // no direct Customer connect on this board, so it's never written, only read.
    { key: 'CUSTOMER',                    title: 'Customers' },
    { key: 'COURIERID',                   title: 'Courier ID' },
    { key: 'COURIERNAME',                 title: 'Courier Name' },
    { key: 'SUPPLIERMANIFEST',            title: 'Supplier Manifests' },
    { key: 'Shipped',                     title: 'Shipped' },
    { key: 'shiprocket_Shipment_response', title: 'Shiprocket Shipment Response' },
    { key: 'CREATEDDATE',                 title: 'Created Date' },
];

export const PRODUCT_COLUMNS: ColumnDef[] = [
    { key: 'SELLINGPRICE', title: 'Selling Price(Per Unit)' },
    { key: 'CATEGORY',     title: 'Category' },
    { key: 'STATUS',       title: 'Status' },
    { key: 'WEIGHT',       title: 'Weight' },
    { key: 'SKU',          title: 'SKU' },
];

export const SUPPLIER_COLUMNS: ColumnDef[] = [
    { key: 'EMAIL',      title: 'Email' },
    { key: 'PHONE',      title: 'Phone' },
    { key: 'POSTALCODE', title: 'Postal Code' },
    { key: 'RATING',     title: 'Market Rating' },
    { key: 'SELFOWNED',  title: 'Self Owned' },
    { key: 'ADDRESS',    title: 'Address' },
    { key: 'City',       title: 'City' },
    { key: 'State',      title: 'State' },
    { key: 'Country',    title: 'Country' },
    { key: 'STATUS',     title: 'Status' },
];

export const SUPPLIER_PRODUCT_COLUMNS: ColumnDef[] = [
    { key: 'PRODUCT',               title: 'Products' },
    { key: 'SUPPLIER',              title: 'Suppliers' },
    { key: 'Supplier Postal Code',  title: 'Supplier Postal Code' },
    { key: 'Supplier Phone',        title: 'Supplier Phone' },
    { key: 'Supplier Address',      title: 'Supplier Address' },
    { key: 'Supplier Market Rating',title: 'Supplier Market Rating' },
    { key: 'AVAILABLEQUANTITY',     title: 'Available Quantity' },
    { key: 'PRODUCT_WEIGHTAGE',     title: 'Product Weight' },
    { key: 'SELF',                  title: 'Self Owned' },
    { key: 'ProductSelling_Price',  title: 'Product Selling Price' },
];

export const SUPPLIER_MANIFEST_COLUMNS: ColumnDef[] = [
    { key: 'ORDER',                  title: 'Orders' },
    { key: 'SPLIT_ORDERS',           title: 'Split Orders' },
    { key: 'ORDER_LINE_ITEM',        title: 'Order Line Items' },
    { key: 'SUPPLIER',               title: 'Suppliers' },
    { key: 'LABEL_FILE',             title: 'Label File' },
    { key: 'MANIFEST_FILE',          title: 'Manifest File' },
    { key: 'Supplier_Email',         title: 'Supplier Email' },
    { key: 'CREATEDDATE',            title: 'Created Date' },
    { key: 'SEND_EMAIL_TO_SUPPLIER', title: 'Send Email To Supplier' },
];

export const SHIPMENTS_COLUMNS: ColumnDef[] = [
    { key: 'Orders',                title: 'Orders' },
    { key: 'Assigned_Date',         title: 'Assigned Date' },
    { key: 'Courier_Company_Id',    title: 'Courier Company ID' },
    { key: 'Courier_Name',          title: 'Courier Name' },
    { key: 'Shipper_Company_Name',  title: 'Shipper Company Name' },
    { key: 'Shipper_Address',       title: 'Shipper Address' },
    { key: 'Pickup_Scheduled_Date', title: 'Pickup Scheduled Date' },
    { key: 'Pickup_Generated_Date', title: 'Pickup Generated Date' },
    { key: 'CREATEDDATE',           title: 'Created Date' },
    { key: 'CANCEL_SHIPMENT',       title: 'Cancel Shipment' },
    { key: 'CANCELLATION_RESPONSE', title: 'Cancellation Response' },
    { key: 'Shiprocket_AWB_ID',     title: 'Shiprocket AWB ID' },   // mirror ← Orders
];

export const CUSTOMER_COLUMNS: ColumnDef[] = [
    { key: 'First_Name',          title: 'First Name' },
    { key: 'Last_Name',           title: 'Last Name' },
    { key: 'PHONE',               title: 'Phone' },
    { key: 'EMAIL',               title: 'Email' },
    { key: 'POSTAL_CODE',         title: 'Postal Code' },
    { key: 'Billing_Postal_Code', title: 'Billing Postal Code' },
    { key: 'Billing_Street',      title: 'Billing Street' },
    { key: 'Billing_Country',     title: 'Billing Country' },
    { key: 'Billing_State',       title: 'Billing State' },
    { key: 'Billing_City',        title: 'Billing City' },
    { key: 'EXTERNAL_ID',         title: 'External ID' },
    { key: 'CREATEDDATE',         title: 'Created Date' },
    { key: 'Default_Street',      title: 'Default Street' },
    { key: 'Default_City',        title: 'Default City' },
    { key: 'Default_Province',    title: 'Default Province' },
    { key: 'Default_Country',     title: 'Default Country' },
];

// ── Derivations (built once from the definitions above) ────────────────────────

// { key: title } for every column that has a real title — consumed by initColumnIds.
export function titleMapOf(defs: ColumnDef[]): Record<string, string> {
    const m: Record<string, string> = {};
    for (const d of defs) if (d.title) m[d.key] = d.title;
    return m;
}

// { key: "" } placeholder ID map — mutated in place at runtime by initColumnIds and
// read by components as MAP.KEY. Only columns with a real title get an ID slot.
function idMapOf(defs: ColumnDef[]): Record<string, string> {
    const m: Record<string, string> = {};
    for (const d of defs) if (d.title) m[d.key] = "";
    return m;
}

// Ordered display labels for the columns marked `visible`.
function visibleLabelsOf(defs: ColumnDef[]): string[] {
    return defs.filter(d => d.visible).map(d => d.label ?? d.title ?? d.key);
}

// { visibleLabel: key } — lets the tables map a displayed label back to its column key.
function labelToKeyOf(defs: ColumnDef[]): Record<string, string> {
    const m: Record<string, string> = {};
    for (const d of defs) if (d.visible) m[d.label ?? d.title ?? d.key] = d.key;
    return m;
}

export const ORDER_ALL_COLUMN_IDS_MAP = idMapOf(ORDER_COLUMNS);
export const ORDERLINEITEMS_ALL_COLUMN_IDS_MAP = idMapOf(ORDERLINEITEMS_COLUMNS);
export const PRODUCT_ALL_COLUMN_IDS_MAP = idMapOf(PRODUCT_COLUMNS);
export const SUPPLIER_ALL_COLUMN_IDS_MAP = idMapOf(SUPPLIER_COLUMNS);
export const SUPPLIER_PRODUCT_COLUMN_IDS_MAP = idMapOf(SUPPLIER_PRODUCT_COLUMNS);
export const SUPPLIER_MANIFEST_COLUMN_IDS_MAP = idMapOf(SUPPLIER_MANIFEST_COLUMNS);
export const SHIPMENTS_ALL_COLUMN_IDS_MAP = idMapOf(SHIPMENTS_COLUMNS);
export const CUSTOMER_ALL_COLUMN_IDS_MAP = idMapOf(CUSTOMER_COLUMNS);

export const ORDER_COLUMN_LABELS_VISIBLE = visibleLabelsOf(ORDER_COLUMNS);
export const ORDERLINEITEMS_COLUMN_LABELS_VISIBLE = visibleLabelsOf(ORDERLINEITEMS_COLUMNS);

export const ORDER_LABEL_TO_KEY = labelToKeyOf(ORDER_COLUMNS);
export const ORDERLINEITEMS_LABEL_TO_KEY = labelToKeyOf(ORDERLINEITEMS_COLUMNS);

// Board key → its definitions + runtime ID map. Iterated by utils/initColumnIds.ts.
export const COLUMN_REGISTRY: Record<BoardKey, { idMap: Record<string, string>; defs: ColumnDef[] }> = {
    orders:            { idMap: ORDER_ALL_COLUMN_IDS_MAP,            defs: ORDER_COLUMNS },
    lineItems:         { idMap: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,   defs: ORDERLINEITEMS_COLUMNS },
    products:          { idMap: PRODUCT_ALL_COLUMN_IDS_MAP,          defs: PRODUCT_COLUMNS },
    suppliers:         { idMap: SUPPLIER_ALL_COLUMN_IDS_MAP,         defs: SUPPLIER_COLUMNS },
    supplierProducts:  { idMap: SUPPLIER_PRODUCT_COLUMN_IDS_MAP,     defs: SUPPLIER_PRODUCT_COLUMNS },
    supplierManifests: { idMap: SUPPLIER_MANIFEST_COLUMN_IDS_MAP,    defs: SUPPLIER_MANIFEST_COLUMNS },
    shipments:         { idMap: SHIPMENTS_ALL_COLUMN_IDS_MAP,        defs: SHIPMENTS_COLUMNS },
    customers:         { idMap: CUSTOMER_ALL_COLUMN_IDS_MAP,         defs: CUSTOMER_COLUMNS },
};
