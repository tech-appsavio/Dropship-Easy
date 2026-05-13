// src/views/multi_order_processing/hooks/useCourierSelectionData.ts
import { useState, useEffect, useMemo } from "react";
import mondaySdk from "monday-sdk-js";
import { ORDER_ITEM_BOARD_ID, ORDER_BOARD_ID, ORDER_ALL_COLUMN_IDS_MAP, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";

const monday = mondaySdk();

export const useCourierSelectionData = (selectedOrderIds: string[]) => {
    const [loading, setLoading] = useState(true);
    const [ordersWithLineItems, setOrdersWithLineItems] = useState<any[]>([]);
    const [boardColumns, setBoardColumns] = useState<Record<string, string>>({});
    const getLinkedItemId = (col: any): string | undefined => {
        if (col?.linked_item_ids?.[0]) return col.linked_item_ids[0];
        if (col?.value) {
            try {
                const parsed = JSON.parse(col.value);
                const id = parsed?.linkedPulseIds?.[0]?.linkedPulseId;
                return id ? String(id) : undefined;
            } catch {}
        }
        return undefined;
    };

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

                // 2. Query Line Items board — columns at board level for label lookup
                const liRes: any = await monday.api(`query {
                    boards(ids: ${ORDER_ITEM_BOARD_ID}) {
                        columns { id title }
                        items_page(limit: 500) {
                            items {
                                id
                                name
                                column_values {
                                    id
                                    text
                                    ... on BoardRelationValue {
                                        linked_item_ids
                                        display_value
                                    }
                                }
                            }
                        }
                    }
                }`);

                // Build column id → title map from real board metadata
                const colMap: Record<string, string> = {};
                (liRes.data.boards[0].columns || []).forEach((col: any) => {
                    colMap[col.id] = col.title;
                });
                setBoardColumns(colMap);

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
                                    linkedOrderId: getLinkedItemId(orderCol),
                                    supplierId: getLinkedItemId(supplierCol),
                                    supplierName: supplierCol?.display_value,
                                    orderId,
                                    sku: skuCol?.text || "",
                                    courierName: courierNameCol?.text || courierIdCol?.text || "",
                                    courierId: courierIdCol?.text || "",
                                    column_values: li.column_values, // kept for dynamic column rendering
                                };
                            })
                            .filter((li: any) => li.linkedOrderId === o.id);

                        return { ...o, deliveryCode, orderId, lineItems: items };
                    });

                setOrdersWithLineItems(orders);
            } catch (e) {
                console.error(e);
            }
            setLoading(false);
        };
        fetchData();
    }, [selectedOrderIds]);

    // Derived: unique suppliers across all filtered orders
    const allSuppliers = useMemo(() => {
        const map = new Map();
        ordersWithLineItems.forEach((o) =>
            o.lineItems.forEach((li: any) => {
                if (li.supplierId) map.set(li.supplierId, li.supplierName);
            }),
        );
        return Array.from(map.entries()).map(([id, name]) => ({ label: name, value: id }));
    }, [ordersWithLineItems]);

    return { loading, ordersWithLineItems, allSuppliers, boardColumns };
};