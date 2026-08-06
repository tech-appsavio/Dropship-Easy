// src/views/multi_order_processing/boardIds.ts
//
// Board IDs are NOT hardcoded here — they come from the .env file, read server-side
// and served by the backend (GET /api/config/board-ids), then written in once at
// startup by utils/initBoardIds.ts (which calls setBoardIds). Kept separate from the
// column definitions (columns.ts) on purpose: this file holds only the runtime board
// ID bindings the frontend queries need.
//
// Declared with `let` so setBoardIds can populate them in place; ES module live
// bindings mean every `import { ORDER_BOARD_ID }` sees the resolved value once set.
import { BoardKey } from "./columns";

export let ORDER_BOARD_ID = '';
export let ORDER_ITEM_BOARD_ID = '';
export let PRODUCT_BOARD_ID = '';
export let SUPPLIER_BOARD_ID = '';
export let SUPPLIER_PRODUCT_BOARD_ID = '';
export let SUPPLIER_MANIFEST_BOARD_ID = '';
export let SHIPMENTS_BOARD_ID = '';
export let CUSTOMER_BOARD_ID = '';

export function setBoardIds(ids: Partial<Record<BoardKey, string>>): void {
    if (ids.orders) ORDER_BOARD_ID = ids.orders;
    if (ids.lineItems) ORDER_ITEM_BOARD_ID = ids.lineItems;
    if (ids.products) PRODUCT_BOARD_ID = ids.products;
    if (ids.suppliers) SUPPLIER_BOARD_ID = ids.suppliers;
    if (ids.supplierProducts) SUPPLIER_PRODUCT_BOARD_ID = ids.supplierProducts;
    if (ids.supplierManifests) SUPPLIER_MANIFEST_BOARD_ID = ids.supplierManifests;
    if (ids.shipments) SHIPMENTS_BOARD_ID = ids.shipments;
    if (ids.customers) CUSTOMER_BOARD_ID = ids.customers;
}

// Current board ID for a logical board key (reads the live binding at call time).
export function boardIdFor(key: BoardKey): string {
    switch (key) {
        case 'orders': return ORDER_BOARD_ID;
        case 'lineItems': return ORDER_ITEM_BOARD_ID;
        case 'products': return PRODUCT_BOARD_ID;
        case 'suppliers': return SUPPLIER_BOARD_ID;
        case 'supplierProducts': return SUPPLIER_PRODUCT_BOARD_ID;
        case 'supplierManifests': return SUPPLIER_MANIFEST_BOARD_ID;
        case 'shipments': return SHIPMENTS_BOARD_ID;
        case 'customers': return CUSTOMER_BOARD_ID;
    }
}
