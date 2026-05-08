// src/views/multi_order_processing/constants.ts
export const ORDER_BOARD_ID = 2023614902;
export const ORDER_ITEM_BOARD_ID = 2028904077;
export const ORDER_ALL_COLUMN_IDS_MAP = {
    "ORDERID": "text_mkrmx2wg",
    "STATUS": "status",
    "TOTAL_PRICE": "numeric_mkrnbtwf",
    "BILLING_ADDRESS": "long_text_mkrnfk2r"
}
export const ORDER_COLUMN_LABELS_VISIBLE =  ["Name", "OrderId", "STATUS", "TOTAL_PRICE", "BILLING_ADDRESS"];

export const ORDERLINEITEMS_ALL_COLUMN_IDS_MAP = {
    "QUANTITY": "numeric_mks0z4t6",
    "UNITPRICE": "lookup_mksevzq3",
    "SKU": "text_mks0xvt8",
    "LISTPRICE": "formula_mksents4",
    "PRODUCTCODE": "lookup_mks1f46y"
}
export const ORDERLINEITEMS_COLUMN_LABELS_VISIBLE = ["Name", "Quantity", "UnitPrice", "SKU", "ListPrice", "Product Code"];


export const ORDER_COLUMNS = ["Name", "OrderId", "Status", "TotalPrice", "Billing Address"];
export const LINE_ITEM_COLUMNS = ["Name", "Quantity", "UnitPrice", "SKU", "ListPrice", "Product Code"];