// src/views/multi_order_processing/constants.ts
export const ORDER_BOARD_ID = 2023614902;
export const ORDER_ITEM_BOARD_ID = 2028904077;
export const PRODUCT_BOARD_ID = 2026780342;
export const SUPPLIER_BOARD_ID = 2026772810;
export const SUPPLIER_PRODUCT_BOARD_ID = 2026788711;
export const ORDER_ALL_COLUMN_IDS_MAP = {
    ORDERID: "text_mkrmx2wg",
    STATUS: "status",
    TOTAL_PRICE: "numeric_mkrnbtwf",
    BILLING_ADDRESS: "long_text_mkrnfk2r",
};
export const ORDER_COLUMN_LABELS_VISIBLE = ["Name", "OrderId", "STATUS", "TOTAL_PRICE", "BILLING_ADDRESS"];

export const ORDERLINEITEMS_ALL_COLUMN_IDS_MAP = {
    QUANTITY: "numeric_mks0z4t6",
    UNITPRICE: "lookup_mksevzq3",
    SKU: "text_mks0xvt8",
    LISTPRICE: "formula_mksents4",
    PRODUCTCODE: "lookup_mks1f46y",
    PRODUCT: "board_relation_mks0k89d",
    ORDER: "board_relation_mks0fnmz",
    SUPPLIER: "board_relation_mks3arpf",
};
export const ORDERLINEITEMS_COLUMN_LABELS_VISIBLE = ["Name", "Quantity", "UnitPrice", "SKU", "ListPrice", "Product Code"];

export const PRODUCT_ALL_COLUMN_IDS_MAP = {
    PRODUCTCODE: "text_mks0wx1y",
    UNITPRICE: "numeric_mks0mc41",
    SELLINGPRICE: "numeric_mkrvk05r",
};

export const SUPPLIER_ALL_COLUMN_IDS_MAP = {
    EMAIL: "email_mkrv8ryp",
    PHONE: "phone_mkrvpr4q",
    POSTALCODE: "numeric_mkrvqzqy",
};

export const SUPPLIER_PRODUCT_COLUMN_IDS_MAP = {
    PRODUCT: "board_relation_mkrvmspy",
    SUPPLIER: "board_relation_mkrv4yqt",
    AVAILABLEQUANTITY: "numeric_mm35asyy",
};





