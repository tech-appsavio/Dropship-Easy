// src/views/multi_order_processing/hooks/useCourierSelectionData.ts
import { useState, useEffect, useMemo } from "react";
import mondaySdk from "monday-sdk-js";
import {
    ORDER_ITEM_BOARD_ID,
    ORDER_BOARD_ID,
    ORDER_ALL_COLUMN_IDS_MAP,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    SUPPLIER_ALL_COLUMN_IDS_MAP
} from "../constants";

const monday = mondaySdk();

export const useCourierSelectionData = (selectedOrderIds: string[]) => {
    const [loading, setLoading] = useState(true);
    const [ordersWithLineItems, setOrdersWithLineItems] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Query Orders to get Delivery Codes
                const orderRes: any = await monday.api(`query {
                    boards(ids: ${ORDER_BOARD_ID}) {
                        items_page(limit: 500) {
                            items {
                                id
                                name
                                column_values(ids: [
                                    "${ORDER_ALL_COLUMN_IDS_MAP.DELIVERY_CODE}",
                                    "${ORDER_ALL_COLUMN_IDS_MAP.ORDERID}"
                                ]) { id text }
                            }
                        }
                    }
                }`);

                // 2. Query Line Items to get Suppliers
                const liRes: any = await monday.api(`query {
                    boards(ids: ${ORDER_ITEM_BOARD_ID}) {
                        items_page(limit: 500) {
                            items {
                                id
                                name
                                column_values {
                                    id
                                    text
                                    ... on BoardRelationValue { linked_item_ids display_value }
                                }
                            }
                        }
                    }
                }`);

                const orders = orderRes.data.boards[0].items_page.items
                    .filter((o: any) => selectedOrderIds.includes(o.id))
                    .map((o: any) => {
                        const deliveryCode = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.DELIVERY_CODE)?.text || "";
                        const orderId = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.ORDERID)?.text || "";

                        const items = liRes.data.boards[0].items_page.items
                            .map((li: any) => {
                                const orderCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                                const supplierCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
                                const skuCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU);
                                const courierNameCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME);
                                const courierIdCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID);

                                return {
                                    id: li.id,
                                    name: li.name,
                                    linkedOrderId: orderCol?.linked_item_ids?.[0],
                                    supplierId: supplierCol?.linked_item_ids?.[0],
                                    supplierName: supplierCol?.display_value,
                                    orderId,
                                    sku: skuCol?.text || "",
                                    courierName: courierNameCol?.text || courierIdCol?.text || "",
                                    courierId: courierIdCol?.text || "",
                                };
                            })
                            .filter((li: any) => li.linkedOrderId === o.id);

                        return { ...o, deliveryCode, orderId, lineItems: items };
                    });

                setOrdersWithLineItems(orders);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetchData();
    }, [selectedOrderIds]);

    // Derived Variables
    const allSuppliers = useMemo(() => {
        const map = new Map();
        ordersWithLineItems.forEach(o => o.lineItems.forEach((li: any) => {
            if (li.supplierId) map.set(li.supplierId, li.supplierName);
        }));
        return Array.from(map.entries()).map(([id, name]) => ({ label: name, value: id }));
    }, [ordersWithLineItems]);

    return { loading, ordersWithLineItems, allSuppliers };
};