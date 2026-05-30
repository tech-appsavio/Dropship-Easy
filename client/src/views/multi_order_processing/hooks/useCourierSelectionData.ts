// src/views/multi_order_processing/hooks/useCourierSelectionData.ts
import { useState, useEffect, useMemo } from "react";
import mondaySdk from "monday-sdk-js";
import { ORDER_ITEM_BOARD_ID, ORDER_BOARD_ID, ORDER_ALL_COLUMN_IDS_MAP, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, CUSTOMER_ALL_COLUMN_IDS_MAP } from "../constants";

const monday = mondaySdk();

export const useCourierSelectionData = (selectedOrderIds: string[]) => {
    const [loading, setLoading] = useState(true);
    const [ordersWithLineItems, setOrdersWithLineItems] = useState<any[]>([]);
    const [boardColumns, setBoardColumns] = useState<Record<string, string>>({});

    // Helper to extract IDs from connect board columns
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

    const fetchData = async () => {
        if (!selectedOrderIds || selectedOrderIds.length === 0) {
            setOrdersWithLineItems([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // 1. Query Orders
            const orderRes: any = await monday.api(`query {
                boards(ids: ${ORDER_BOARD_ID}) {
                    items_page(limit: 500) {
                        items {
                            id
                            name
                            column_values(ids: [
                                "${ORDER_ALL_COLUMN_IDS_MAP.DELIVERY_CODE}",
                                "${ORDER_ALL_COLUMN_IDS_MAP.ORDERID}",
                                "${ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER}",
                                "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID}",
                                "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}"
                            ]) {
                                id text value
                                ... on BoardRelationValue { linked_item_ids }
                            }
                        }
                    }
                }
            }`);

            // 2. Query Line Items
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
                                value
                                ... on BoardRelationValue { linked_item_ids display_value }
                            }
                        }
                    }
                }
            }`);

            // Build column map
            const colMap: Record<string, string> = {};
            (liRes.data.boards[0].columns || []).forEach((col: any) => {
                colMap[col.id] = col.title;
            });
            setBoardColumns(colMap);

            // 3. Fetch customer postal codes
            const filteredOrders = orderRes.data.boards[0].items_page.items.filter((o: any) => selectedOrderIds.includes(o.id));
            const customerIds = filteredOrders.reduce((acc: string[], o: any) => {
                const customerCol = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER);
                const customerId = getLinkedItemId(customerCol);
                if (customerId && !acc.includes(customerId)) acc.push(customerId);
                return acc;
            }, []);

            const customerPostalMap: Record<string, string> = {};
            if (customerIds.length > 0) {
                const customerRes: any = await monday.api(`query {
                    items(ids: [${customerIds.join(",")}]) {
                        id
                        column_values(ids: ["${CUSTOMER_ALL_COLUMN_IDS_MAP.POSTAL_CODE}"]) { id text }
                    }
                }`);
                (customerRes.data?.items || []).forEach((c: any) => {
                    const postal = c.column_values?.[0]?.text || "";
                    if (postal) customerPostalMap[c.id] = postal;
                });
            }

            // 4. Filter and Map Data
            const allLineItems = liRes.data.boards[0].items_page.items;
            const orders = filteredOrders
                .map((o: any) => {
                    const deliveryCode = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.DELIVERY_CODE)?.text || "";
                    const orderId = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.ORDERID)?.text || "";
                    const shiprocketOrderId = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "";
                    const shiprocketShipmentId = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "";
                    const customerCol = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER);
                    const customerId = getLinkedItemId(customerCol);
                    const customerPostalCode = customerId ? customerPostalMap[customerId] || "" : "";

                    const items = allLineItems
                        .map((li: any) => {
                            const orderCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                            const supplierCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
                            const skuCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU);
                            const courierNameCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME);
                            const courierIdCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID);

                            return {
                                id: li.id,
                                name: li.name,
                                linkedOrderId: getLinkedItemId(orderCol), // Crucial for filtering
                                supplierId: getLinkedItemId(supplierCol),
                                supplierName: supplierCol?.display_value,
                                orderId,
                                sku: skuCol?.text || "",
                                courierName: courierNameCol?.text || courierIdCol?.text || "",
                                courierId: courierIdCol?.text || "",
                                column_values: li.column_values,
                            };
                        })
                        .filter((li: any) => li.linkedOrderId === o.id);

                    return { ...o, deliveryCode, orderId, shiprocketOrderId, shiprocketShipmentId, customerPostalCode, lineItems: items };
                });

            setOrdersWithLineItems(orders);
        } catch (e) {
            console.error("Fetch Error:", e);
        }
        setLoading(false);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        fetchData();
    }, [selectedOrderIds]);

    const allSuppliers = useMemo(() => {
        const map = new Map();
        ordersWithLineItems.forEach((o) =>
            o.lineItems.forEach((li: any) => {
                if (li.supplierId) map.set(li.supplierId, li.supplierName);
            }),
        );
        return Array.from(map.entries()).map(([id, name]) => ({ label: name, value: id }));
    }, [ordersWithLineItems]);

    return { loading, ordersWithLineItems, allSuppliers, boardColumns, refetch: fetchData };
};;