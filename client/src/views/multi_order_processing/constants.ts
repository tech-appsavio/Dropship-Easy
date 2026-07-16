// src/views/multi_order_processing/constants.ts
export const ORDER_BOARD_ID = 2023614902;
export const CHILDORDERS_BOARD_ID = 5029562615;
export const ORDER_ITEM_BOARD_ID = 2028904077;
export const PRODUCT_BOARD_ID = 2026780342;
export const SUPPLIER_BOARD_ID = 2026772810;
export const SUPPLIER_PRODUCT_BOARD_ID = 2026788711;
export const SUPPLIER_MANIFEST_BOARD_ID = 2031231767;
export const SHOPS_BOARD_ID = 2040921882;
export const SHIPMENTS_BOARD_ID=2040851662;
export const RETURN_ORDERS_BOARD_ID=5028937036;
export const CUSTOMER_BOARD_ID=2023614887;



export const ORDER_ALL_COLUMN_IDS_MAP = {
    ORDERID: "text_mkrmx2wg",
    STATUS: "status",
    TOTAL_PRICE: "numeric_mkrnbtwf",
    // NOTE: Add the real column IDs below once confirmed in the Monday board schema
    DISCOUNT: "numeric_mkrnpg8r",           // numeric discount column on Order board — fill in the column ID
    SHIPPING_ADDRESS: "long_text_mkrngwce",   // shipping/delivery address column on Order board — fill in the column ID
    BILLING_ADDRESS: "long_text_mkrnfk2r",
    DELIVERY_CODE: "text_mm365x5d",
    SUPPLIER_MANIFEST: "board_relation_mm36hqmm",
    CREATEDDATE: "date4",
    PARENTORDER: "board_relation_mkxdkae4",
    ASSIGNEE: "multiple_person_mm37ek4z",
    PAYMENTMETHOD: "color_mm3ba5yb",
    CUSTOMER: "board_relation_mkrwaecz",
    Shiprocket_Order_ID: "text_mm3fy8xt",
    Shiprocket_Shipment_ID: "text_mm3fvanv",
    Shiprocket_AWB_ID: "text_mm3y4kwz",
    Order_Type: "color_mm4vsy2t",
};
export const ORDER_COLUMN_LABELS_VISIBLE = ["Name", "Created Date", "OrderId", "Status", "Total Price", "Customer", "Billing Address", "Shiprocket Order ID", "Shiprocket Shipment ID", "Shiprocket AWB ID"];

export const ORDERLINEITEMS_ALL_COLUMN_IDS_MAP = {
    QUANTITY: "numeric_mks0z4t6",
    UNITPRICE: "lookup_mksevzq3",
    SKU: "text_mks0xvt8",
    LISTPRICE: "formula_mksents4",
    STATUS: "status",
    PRODUCTCODE: "lookup_mks1f46y",
    PRODUCTWEIGHT: "lookup_mktbxv6z",
    PRODUCT: "board_relation_mks0k89d",
    ORDER: "board_relation_mks0fnmz",
    Child_Orders: "board_relation_mm4tvsq8",
    SPLIT_ORDERS: "board_relation_mm4tnnax",
    SUPPLIER: "board_relation_mks3arpf",
    COURIERID: "text_mkw4jp1r",
    COURIERNAME: "text_mkw41y6y",
    SUPPLIERMANIFEST: "board_relation_mks3c0r1",
    COD_STATUS: "numeric_mm3adxqz",
    Shipped: "color_mm4mbc34",
    shiprocket_Shipment_response: "long_text_mm4fsgmm",
};
export const ORDERLINEITEMS_COLUMN_LABELS_VISIBLE = ["Name", "SKU", "Qty", "Weight", "COD", "Current Supplier", "Split Order", "Status"];


export const CHILDORDERS_COLUMN_IDS_MAP = {
    Parent_Orders: "board_relation_mm4txpdc",
    Customers: "board_relation_mm4tskm8",
    Shiprocket_AWB_ID: "text_mm4tb902",
    Shiprocket_Order_ID: "text_mm4tzjrb",
    Shiprocket_Shipment_ID: "text_mm4tf7dv",
    Billing_Address: "long_text_mm4t3e6r",
    Shipping_Address: "long_text_mm4tv5an",
    TotalPrice: "numeric_mm4tt6y",
    Discount: "text_mm4te91q",   
    Quantity: "numeric_mm4s7q3f",
}


export const SHIPMENTS_ALL_COLUMN_IDS_MAP = {

    Orders: "board_relation_mm3zqm5d",
    Assigned_Date: "text_mm3zt0b8",
    Courier_Company_Id: "text_mm3zm9rs",
    Courier_Name: "text_mm3zncdd",
    Shipper_Company_Name: "text_mm3zeta6",
    Shipper_Address: "long_text_mm3z53hc",
    Pickup_Scheduled_Date: "text_mm3zq70d",
    Pickup_Generated_Date: "text_mm3zq6jh",
    };


export const PRODUCT_ALL_COLUMN_IDS_MAP = {
    PRODUCTCODE: "text_mks0wx1y",
    UNITPRICE: "numeric_mks0mc41",
    SELLINGPRICE: "numeric_mkrvk05r",
    CATEGORY: "color_mks27yvh",
};

export const SUPPLIER_ALL_COLUMN_IDS_MAP = {
    EMAIL: "email_mkrv8ryp",
    PHONE: "phone_mkrvpr4q",
    POSTALCODE: "text_mm3adnnp",
    RATING: "text_mkrv6ppp",
    SELFOWNED: "boolean_mkxfqgtj",
    ADDRESS: "long_text_mkrvdvsx",
    City: "text_mkrv1a29",
    State: "text_mkrvv8rn",
    Country: "text_mkrvyc0m",
};

export const SUPPLIER_PRODUCT_COLUMN_IDS_MAP = {
    PRODUCT: "board_relation_mkrvmspy",
    SUPPLIER: "board_relation_mkrv4yqt",
    AVAILABLEQUANTITY: "numeric_mm35asyy",
    PRODUCT_WEIGHTAGE: "lookup_mktb4c84",
    SELF: "lookup_mkxjavpw",
    RatePer_Unit: "numeric_mm35asyy",
    MarginPer_Unit: "formula_mkrv25kg",
    ProductSelling_Price: "lookup_mkrv18re",
};

export const SUPPLIER_MANIFEST_COLUMN_IDS_MAP = {
    ORDER: "board_relation_mksn9avt",
    ORDER_LINE_ITEM: "board_relation_mkspz02y",
    SUPPLIER: "board_relation_mktqzxcn",
    LABEL_FILE: "file_mkv0thgs",
    MANIFEST_FILE: "file_mksncam",
    Supplier_Email: "email_mktk158p",
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

    First_Name: "text_mktkznra",
    Last_Name: "text_mktkw03k",
    PHONE: "phone_mm35nqte",
    EMAIL: "email_mkrtmgvw",
    POSTAL_CODE: "text_mkt939k3",
    Billing_Postal_Code: "text_mkth9gj3",
    Billing_Street: "long_text_mkthw48w",
    Billing_Country: "text_mkthmc2",
    Billing_State: "text_mkth7yxr",
    Billing_City: "text_mkths9ed",
};

export const RETURN_ORDERS_ALL_COLUMN_IDS_MAP = {
    Send_To_Supplier: "text_mkz0x3g6",
    Send_To_Customer: "board_relation_mkz0y7q4",
    Return_Reason: "text_mm4eq4jb",
    Orders: "board_relation_mkz0x3g4",
    Customers: "board_relation_mkz0y7q4",
};

export const RETURN_ORDER_COLUMN_LABELS_VISIBLE = ["Name", "Quantity", "Unit Price", "SKU", "Product Code", "Supplier", "Product", "Status"];