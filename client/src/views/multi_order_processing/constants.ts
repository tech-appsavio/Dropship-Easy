// src/views/multi_order_processing/constants.ts
export const ORDER_BOARD_ID = 2023614902;
export const ORDER_ITEM_BOARD_ID = 2028904077;
export const PRODUCT_BOARD_ID = 2026780342;
export const SUPPLIER_BOARD_ID = 2026772810;
export const SUPPLIER_PRODUCT_BOARD_ID = 2026788711;
export const SUPPLIER_MANIFEST_BOARD_ID = 2031231767;
export const SHOPS_BOARD_ID = 2040921882;
export const ORDER_ALL_COLUMN_IDS_MAP = {
    ORDERID: "text_mkrmx2wg",
    STATUS: "status",
    TOTAL_PRICE: "numeric_mkrnbtwf",
    BILLING_ADDRESS: "long_text_mkrnfk2r",
    DELIVERY_CODE: "text_mm365x5d",
    SUPPLIER_MANIFEST: "board_relation_mm36hqmm",
    CREATEDDATE: "date4",
    PARENTORDER: "board_relation_mkxdkae4",
    ASSIGNEE: "multiple_person_mm37ek4z",
    PAYMENTMETHOD: "color_mm3ba5yb",
};
export const ORDER_COLUMN_LABELS_VISIBLE = ["Name", "OrderId", "STATUS", "TOTAL_PRICE", "BILLING_ADDRESS", "CREATEDDATE", "PARENTORDER", "ASSIGNEE"];

export const ORDERLINEITEMS_ALL_COLUMN_IDS_MAP = {
    QUANTITY: "numeric_mks0z4t6",
    UNITPRICE: "lookup_mksevzq3",
    SKU: "text_mks0xvt8",
    LISTPRICE: "formula_mksents4",
    STATUS: "status",
    PRODUCTCODE: "lookup_mks1f46y",
    TOTALPRODUCTWEIGHT: "numeric_mm3abpby",
    PRODUCT: "board_relation_mks0k89d",
    ORDER: "board_relation_mks0fnmz",
    SUPPLIER: "board_relation_mks3arpf",
    COURIERID: "text_mkw4jp1r",
    COURIERNAME: "text_mkw41y6y",
    SUPPLIERMANIFEST: "board_relation_mks3c0r1",
    COD_STATUS: "numeric_mm3adxqz",
};
export const ORDERLINEITEMS_COLUMN_LABELS_VISIBLE = ["Name", "Quantity", "UnitPrice", "SKU", "Product Code", "SUPPLIER", "PRODUCT", "STATUS"];

export const PRODUCT_ALL_COLUMN_IDS_MAP = {
    PRODUCTCODE: "text_mks0wx1y",
    UNITPRICE: "numeric_mks0mc41",
    SELLINGPRICE: "numeric_mkrvk05r",
};

export const SUPPLIER_ALL_COLUMN_IDS_MAP = {
    EMAIL: "email_mkrv8ryp",
    PHONE: "phone_mkrvpr4q",
    POSTALCODE: "text_mm3adnnp",
    RATING: "text_mkrv6ppp",
    SELFOWNED: "boolean_mkxfqgtj",
};

export const SUPPLIER_PRODUCT_COLUMN_IDS_MAP = {
    PRODUCT: "board_relation_mkrvmspy",
    SUPPLIER: "board_relation_mkrv4yqt",
    AVAILABLEQUANTITY: "numeric_mm35asyy",
    PRODUCT_WEIGHTAGE: "lookup_mktb4c84",
};

export const SUPPLIER_MANIFEST_COLUMN_IDS_MAP = {
    ORDER: "board_relation_mksn9avt",
    ORDER_LINE_ITEM: "board_relation_mkspz02y",
    SUPPLIER: "board_relation_mktqzxcn",
    LABEL_FILE: "file_mkv0thgs",
    MANIFEST_FILE: "file_mksncam",
};

export const SHOPS_ALL_COLUMN_IDS_MAP = {
    COUNTRY: "text_mkt4ptjk",
    POSTAL_CODE: "text_mkt4ykvj",
    STREET: "text_mm364gpw",
    CITY: "text_mkt4vr30",
    STATE: "text_mkt427km",
    LOGO: "file_mm36fdnt",
    PRIMARY_CONTACT: "text_mm36hk00",
    PHONE: "text_mktbzkew",
    EMAIL: "email_mm36mf0p",
    WEBSITE: "link_mksq4360",
};

export const CUSTOMER_ALL_COLUMN_IDS_MAP = {
    PHONE: "phone_mm35nqte",
    EMAIL: "email_mkrtmgvw",
};

