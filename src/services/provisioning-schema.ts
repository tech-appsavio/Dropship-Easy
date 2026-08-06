// Declarative schema for the boards the app auto-creates on install.
//
// Naming convention for ALL titles: Title Case, words separated by spaces, common
// acronyms uppercase (ID, SKU, COD, AWB). No snake_case / camelCase. Connect (board
// relation) columns are named as the PLURAL of the board they point to (e.g.
// "Suppliers" connects to the Suppliers board) — this makes the direction obvious.
//
// monday's API can now create ALL required column types, so the app provisions the
// full schema automatically (see board-provisioning.ts):
//   • `columns`        — standard columns (text/status/date/numbers/...), created first.
//   • `connectColumns` — board_relation columns, created after all boards exist so the
//                        target board IDs are known.
//   • `mirrorColumns`  — mirror columns, created last (a mirror pulls a source column
//                        THROUGH an existing connect column, so both must already exist).
// Everything resolves by title at runtime, so IDs never need to be hardcoded. The
// board/column titles here are the single source of truth (mirrored in SETUP_GUIDE.md
// as the manual fallback).

export interface ColumnDef {
    title: string;
    // monday ColumnType enum value (creatable subset)
    type: 'text' | 'long_text' | 'numbers' | 'status' | 'dropdown' | 'date' | 'email' | 'phone' | 'checkbox' | 'file';
    // For status columns: options to pre-seed (best effort; falls back to a plain column if rejected).
    labels?: string[];
    // For status columns: which label new items default to. monday's default slot is
    // index 5, so this label is placed there (see board-provisioning.ts). Omit to leave
    // the default blank (monday's recommended behavior).
    defaultLabel?: string;
}

// A Connect Boards (board_relation) column: links THIS board to another board.
export interface ConnectColumnDef {
    title: string;       // exact column title created on this board
    connectTo: string;   // board KEY (in this schema) the column links to
    description?: string;
}

// A Mirror column: shows a source column from a connected board, THROUGH an existing
// connect column on this board. All three references resolve by title from the mapping
// built after boards + connect columns exist — nothing is hardcoded.
export interface MirrorColumnDef {
    title: string;        // exact column title created on this board
    throughConnect: string; // title of the connect column ON THIS BOARD to mirror through
    sourceBoard: string;    // board KEY the connect column links to (where the source column lives)
    sourceColumn: string;   // title of the column ON THE SOURCE BOARD to display
    description?: string;
}

export interface BoardDef {
    key: string;   // stable logical key stored in account config
    name: string;  // board title created in monday
    columns: ColumnDef[];
    connectColumns?: ConnectColumnDef[];
    mirrorColumns?: MirrorColumnDef[];
}

export const PROVISIONING_SCHEMA: BoardDef[] = [
    {
        key: 'customers',
        name: 'Customers',
        columns: [
            { title: 'Status', type: 'status', labels: ['New', 'Active', 'Inactive'], defaultLabel: 'New' },
            { title: 'Created Date', type: 'date' },
            { title: 'External ID', type: 'text' },
            { title: 'First Name', type: 'text' },
            { title: 'Last Name', type: 'text' },
            { title: 'Phone', type: 'phone' },
            { title: 'Email', type: 'email' },
            { title: 'Postal Code', type: 'text' },
            { title: 'Billing Postal Code', type: 'text' },
            { title: 'Billing Street', type: 'long_text' },
            { title: 'Billing Country', type: 'text' },
            { title: 'Billing State', type: 'text' },
            { title: 'Billing City', type: 'text' },
            { title: 'Default Street', type: 'long_text' },
            { title: 'Default City', type: 'text' },
            { title: 'Default Province', type: 'text' },
            { title: 'Default Country', type: 'text' },
        ],
    },
    {
        key: 'products',
        name: 'Products',
        columns: [
            { title: 'Status', type: 'status', labels: ['Available for Sale', 'Onboarding In Progress', 'Discarded', 'In-Active for Sale'] },
            { title: 'SKU', type: 'text' },
            { title: 'Selling Price(Per Unit)', type: 'numbers' },
            { title: 'Weight', type: 'numbers' },
            { title: 'Category', type: 'text' },
        ],
    },
    {
        key: 'suppliers',
        name: 'Suppliers',
        columns: [
            { title: 'Status', type: 'status', labels: ['New', 'Active', 'Onboarding In-Progress', 'In-Active', 'Defaulter'] },
            { title: 'Email', type: 'email' },
            { title: 'Phone', type: 'phone' },
            { title: 'Postal Code', type: 'text' },
            { title: 'Market Rating', type: 'numbers' },
            { title: 'Self Owned', type: 'checkbox' },
            { title: 'Address', type: 'long_text' },
            { title: 'City', type: 'text' },
            { title: 'State', type: 'text' },
            { title: 'Country', type: 'text' },
        ],
    },
    {
        key: 'orders',
        name: 'Orders',
        columns: [
            { title: 'Shopify Order ID', type: 'text' },
            { title: 'Status', type: 'status', labels: ['New', 'Order Placed', 'Confirmed', 'Courier Selected', 'Ready for Supplier Selection', 'Ready for Manifest Generation', 'Manifest Generated', 'Cancelled', 'Shipped'], defaultLabel: 'New' },
            { title: 'Created Date', type: 'date' },
            { title: 'Order Type', type: 'status', labels: ['Header', 'Order'] },
            { title: 'Shiprocket Order ID', type: 'text' },
            { title: 'Shiprocket Shipment ID', type: 'text' },
            { title: 'Shiprocket AWB ID', type: 'text' },
            { title: 'COD', type: 'numbers' },
            { title: 'Billing Address', type: 'long_text' },
            { title: 'Shipping Address', type: 'long_text' },
            { title: 'Total Price', type: 'numbers' },
            { title: 'Discount', type: 'numbers' },
            { title: 'Source', type: 'text' },
            { title: 'Customer External ID', type: 'text' },
            { title: 'WhatsApp Send Message', type: 'long_text' },
            { title: 'WhatsApp WanId', type: 'text' },
            { title: 'WhatsApp Response', type: 'long_text' },
            { title: 'Description', type: 'long_text' },
            { title: 'Notes', type: 'long_text' },
        ],
        connectColumns: [
            { title: 'Parent Orders', connectTo: 'orders', description: 'Links a split order back to its parent order' },
            { title: 'Customers', connectTo: 'customers', description: 'Links this order to its customer' },
        ],
        mirrorColumns: [
            { title: 'Customer Phone', throughConnect: 'Customers', sourceBoard: 'customers', sourceColumn: 'Phone' },
            { title: 'Customer Postal Code', throughConnect: 'Customers', sourceBoard: 'customers', sourceColumn: 'Postal Code' },
        ],
    },
    {
        key: 'lineItems',
        name: 'Order Line Items',
        columns: [
            { title: 'Status', type: 'status', labels: ['Ready for Supplier Selection', 'Supplier Selected', 'Courier Selected', 'Ready for Manifest Generation', 'Manifest Generated'], defaultLabel: 'Ready for Supplier Selection' },
            { title: 'Shipped', type: 'status', labels: ['Yes', 'No'] },
            { title: 'Created Date', type: 'date' },
            { title: 'SKU', type: 'text' },
            { title: 'Quantity', type: 'numbers' },
            { title: 'Courier Name', type: 'text' },
            { title: 'Courier ID', type: 'numbers' },
            { title: 'COD (1/0)', type: 'numbers' },
            { title: 'Shiprocket Shipment Response', type: 'long_text' },
        ],
        connectColumns: [
            { title: 'Orders', connectTo: 'orders', description: 'Links this line item to its order' },
            { title: 'Split Orders', connectTo: 'orders', description: 'Links this line item to a split order' },
            { title: 'Suppliers', connectTo: 'suppliers' },
            { title: 'Supplier Manifests', connectTo: 'supplierManifests' },
            { title: 'Products', connectTo: 'products' },
        ],
        mirrorColumns: [
            { title: 'Shopify Order ID', throughConnect: 'Orders', sourceBoard: 'orders', sourceColumn: 'Shopify Order ID' },
            { title: 'Customers', throughConnect: 'Orders', sourceBoard: 'orders', sourceColumn: 'Customers' },
            { title: 'Supplier Postal Code', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Postal Code' },
            { title: 'Supplier Address', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Address' },
            { title: 'Supplier Phone', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Phone' },
            { title: 'Product Weight', throughConnect: 'Products', sourceBoard: 'products', sourceColumn: 'Weight' },
        ],
    },
    {
        key: 'supplierProducts',
        name: 'Supplier Products',
        columns: [
            { title: 'Available Quantity', type: 'numbers' },
        ],
        connectColumns: [
            { title: 'Products', connectTo: 'products' },
            { title: 'Suppliers', connectTo: 'suppliers' },
        ],
        mirrorColumns: [
            { title: 'Product Weight', throughConnect: 'Products', sourceBoard: 'products', sourceColumn: 'Weight' },
            { title: 'Product Selling Price', throughConnect: 'Products', sourceBoard: 'products', sourceColumn: 'Selling Price(Per Unit)' },
            { title: 'Supplier Postal Code', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Postal Code' },
            { title: 'Supplier Market Rating', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Market Rating' },
            { title: 'Supplier Address', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Address' },
            { title: 'Supplier Phone', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Phone' },
            { title: 'Self Owned', throughConnect: 'Suppliers', sourceBoard: 'suppliers', sourceColumn: 'Self Owned' },
        ],
    },
    {
        key: 'supplierManifests',
        name: 'Supplier Manifests',
        columns: [
            { title: 'Created Date', type: 'date' },
            { title: 'Supplier Email', type: 'email' },
            { title: 'Label File', type: 'file' },
            { title: 'Manifest File', type: 'file' },
            { title: 'Send Email To Supplier', type: 'status', labels: ['Ready To Send', 'Send', 'Resend'], defaultLabel: 'Ready To Send' },
        ],
        connectColumns: [
            { title: 'Orders', connectTo: 'orders' },
            { title: 'Split Orders', connectTo: 'orders' },
            { title: 'Order Line Items', connectTo: 'lineItems' },
            { title: 'Suppliers', connectTo: 'suppliers' },
        ],
    },
    {
        key: 'shipments',
        name: 'Shipments',
        columns: [
            { title: 'Created Date', type: 'date' },
            { title: 'Cancel Shipment', type: 'status', labels: ['New', 'Active', 'Cancel'], defaultLabel: 'New' },
            { title: 'Assigned Date', type: 'text' },
            { title: 'Courier Company ID', type: 'numbers' },
            { title: 'Courier Name', type: 'text' },
            { title: 'Shipper Company Name', type: 'text' },
            { title: 'Shipper Address', type: 'long_text' },
            { title: 'Pickup Scheduled Date', type: 'text' },
            { title: 'Pickup Generated Date', type: 'text' },
            { title: 'Cancellation Response', type: 'text' },
        ],
        connectColumns: [
            { title: 'Orders', connectTo: 'orders' },
        ],
        mirrorColumns: [
            { title: 'Shiprocket AWB ID', throughConnect: 'Orders', sourceBoard: 'orders', sourceColumn: 'Shiprocket AWB ID' },
        ],
    },
    {
        // Central log of errors from any stage. The record NAME is the Error ID (ERR-…).
        key: 'errorLogs',
        name: 'Error Logs',
        columns: [
            { title: 'Timestamp', type: 'date' },
            { title: 'Process Stage', type: 'status', labels: ['Order Selection', 'Supplier Selection', 'Courier Selection', 'Shipment Creation', 'Manifest Generation', 'WhatsApp', 'Shopify Sync', 'Settings'] },
            { title: 'Error Severity', type: 'status', labels: ['Info', 'Warning', 'Error', 'Critical'], defaultLabel: 'Error' },
            { title: 'Order ID', type: 'text' },
            { title: 'Split Order ID', type: 'text' },
            { title: 'Supplier', type: 'text' },
            { title: 'Courier', type: 'text' },
            { title: 'SKU / Product', type: 'text' },
            { title: 'Error Message', type: 'long_text' },
            { title: 'Technical Details', type: 'long_text' },
            { title: 'Suggested Solution', type: 'long_text' },
            { title: 'Status', type: 'status', labels: ['Open', 'In Progress', 'Resolved', 'Ignored'], defaultLabel: 'Open' },
            { title: 'Retry', type: 'checkbox' },
        ],
        connectColumns: [
            // Link an error to the exact Order / Split Order it came from (both live on the
            // Orders board), so you can jump straight from the error to the affected order.
            { title: 'Orders', connectTo: 'orders', description: 'The order this error relates to' },
            { title: 'Split Orders', connectTo: 'orders', description: 'The split order this error relates to' },
        ],
    },
];
