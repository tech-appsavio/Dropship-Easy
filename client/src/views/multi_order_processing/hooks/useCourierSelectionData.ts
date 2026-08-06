// src/views/multi_order_processing/hooks/useCourierSelectionData.ts
import { useState, useEffect } from "react";
import mondaySdk from "monday-sdk-js";
import {
    ORDER_ALL_COLUMN_IDS_MAP,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    CUSTOMER_ALL_COLUMN_IDS_MAP,
    SUPPLIER_ALL_COLUMN_IDS_MAP,
} from "../columns";
import {
    ORDER_ITEM_BOARD_ID,
    ORDER_BOARD_ID,
    SUPPLIER_BOARD_ID,
} from "../boardIds";
import { fetchAllBoardItems } from "../utils/fetchAllItems";

const monday = mondaySdk();

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

export const useCourierSelectionData = (selectedOrderIds: string[]) => {
    const [loading, setLoading] = useState(true);
    const [lineItems, setLineItems] = useState<any[]>([]);

    const fetchData = async () => {
        if (!selectedOrderIds || selectedOrderIds.length === 0) {
            console.log("[useCourierSelectionData] No order IDs provided, skipping fetch.");
            setLineItems([]);
            setLoading(false);
            return;
        }
        console.log("[useCourierSelectionData] ── Fetching courier data for orders:", selectedOrderIds);
        setLoading(true);
        try {
            // 1. Orders
            console.log("[useCourierSelectionData] STEP 1: Fetching orders from board:", ORDER_BOARD_ID);
            const allOrders = await fetchAllBoardItems(ORDER_BOARD_ID, `
                id name
                column_values(ids: [
                    "${ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER}",
                    "${ORDER_ALL_COLUMN_IDS_MAP.ORDERID}",
                    "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}"
                ]) {
                    id text value
                    ... on BoardRelationValue { linked_item_ids }
                }
            `);

            const filteredOrders = allOrders.filter(
                (o: any) => selectedOrderIds.includes(o.id)
            );
            console.log("[useCourierSelectionData] STEP 1: Matched orders:", filteredOrders.length);

            // Build parent-order → srShipmentId map
            const parentSRMap: Record<string, string> = {};
            filteredOrders.forEach((o: any) => {
                const col = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID);
                parentSRMap[o.id] = col?.text?.trim() || "";
            });

            // 2. Customer postal codes
            console.log("[useCourierSelectionData] STEP 2: Extracting customer IDs...");
            const customerIds: string[] = [];
            filteredOrders.forEach((o: any) => {
                const col = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER);
                const id = getLinkedItemId(col);
                if (id && !customerIds.includes(id)) customerIds.push(id);
            });
            console.log("[useCourierSelectionData] STEP 2: Customer IDs:", customerIds);

            const customerPostalMap: Record<string, string> = {};
            if (customerIds.length > 0) {
                const custRes: any = await monday.api(`query {
                    items(ids: [${customerIds.join(",")}]) {
                        id
                        column_values(ids: ["${CUSTOMER_ALL_COLUMN_IDS_MAP.Billing_Postal_Code}"]) { id text }
                    }
                }`);
                (custRes.data?.items || []).forEach((c: any) => {
                    const postal = c.column_values?.[0]?.text || "";
                    if (postal) customerPostalMap[c.id] = postal;
                });
                console.log("[useCourierSelectionData] STEP 2: Customer postal map:", customerPostalMap);
            }

            const orderPostalMap: Record<string, string> = {};
            filteredOrders.forEach((o: any) => {
                const col = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER);
                const customerId = getLinkedItemId(col);
                orderPostalMap[o.id] = customerId ? customerPostalMap[customerId] || "" : "";
            });

            // 3. Line items
            console.log("[useCourierSelectionData] STEP 3: Fetching line items from board:", ORDER_ITEM_BOARD_ID);
            const allLI = await fetchAllBoardItems(ORDER_ITEM_BOARD_ID, `
                id name
                column_values {
                    id text value
                    ... on BoardRelationValue { linked_item_ids display_value }
                    ... on MirrorValue { display_value }
                }
            `);
            console.log("[useCourierSelectionData] STEP 3: Total line items on board:", allLI.length);

            const enriched = allLI
                .map((li: any) => {
                    const orderCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                    const supplierCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
                    const courierNameCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME);
                    const linkedOrderId = getLinkedItemId(orderCol);
                    return {
                        id: li.id,
                        name: li.name,
                        linkedOrderId,
                        orderName: orderCol?.display_value || "",
                        supplierId: getLinkedItemId(supplierCol),
                        supplierName: supplierCol?.display_value || "",
                        courierName: courierNameCol?.text || "",
                        customerPostalCode: linkedOrderId ? orderPostalMap[linkedOrderId] || "" : "",
                        column_values: li.column_values,
                    };
                })
                .filter((li: any) => selectedOrderIds.includes(li.linkedOrderId));

            console.log("[useCourierSelectionData] STEP 3: Line items for selected orders:", enriched.length);

            // 4. Supplier postal codes
            console.log("[useCourierSelectionData] STEP 4: Fetching supplier postal codes...");
            const supplierIds = [...new Set(enriched.map((li: any) => li.supplierId).filter(Boolean))];
            console.log("[useCourierSelectionData] STEP 4: Unique supplier IDs:", supplierIds);
            const supplierPostalMap: Record<string, string> = {};
            if (supplierIds.length > 0) {
                const suppRes: any = await monday.api(`query {
                    items(ids: [${supplierIds.join(",")}]) {
                        id
                        column_values(ids: ["${SUPPLIER_ALL_COLUMN_IDS_MAP.POSTALCODE}"]) { id text value }
                    }
                }`);
                (suppRes.data?.items || []).forEach((s: any) => {
                    let postal = s.column_values?.[0]?.text || "";
                    if (!postal && s.column_values?.[0]?.value) {
                        try {
                            const p = JSON.parse(s.column_values[0].value);
                            postal = typeof p === "object" ? p.value || p.text : String(p);
                        } catch { postal = s.column_values[0].value; }
                    }
                    if (postal) supplierPostalMap[s.id] = postal;
                });
                console.log("[useCourierSelectionData] STEP 4: Supplier postal map:", supplierPostalMap);
            }

            // 5. Fetch split-order Shiprocket shipment IDs
            const splitOrderIds = [...new Set(
                enriched.flatMap((li: any) => {
                    const col = li.column_values.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
                    return col?.linked_item_ids || [];
                })
            )] as string[];
            const splitSRMap: Record<string, string> = {};
            if (splitOrderIds.length > 0) {
                const splitRes: any = await monday.api(`query {
                    items(ids: [${splitOrderIds.join(",")}]) {
                        id
                        column_values(ids: ["${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}"]) { id text }
                    }
                }`);
                (splitRes.data?.items || []).forEach((so: any) => {
                    splitSRMap[so.id] = so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text?.trim() || "";
                });
                console.log("[useCourierSelectionData] STEP 5: Split order SR shipment map:", splitSRMap);
            }

            const final = enriched
                .map((li: any) => {
                    const splitOrderId = li.column_values.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS)?.linked_item_ids?.[0] || "";
                    const srShipmentId = (splitOrderId ? splitSRMap[splitOrderId] : "") || parentSRMap[li.linkedOrderId] || "";
                    return {
                        ...li,
                        supplierPostalCode: li.supplierId ? supplierPostalMap[li.supplierId] || "" : "",
                        srShipmentId,
                    };
                })
                .sort((a: any, b: any) => {
                    const orderCmp = (a.orderName || "").localeCompare(b.orderName || "");
                    return orderCmp !== 0 ? orderCmp : (a.name || "").localeCompare(b.name || "");
                });

            console.log("[useCourierSelectionData] STEP 4: Final enriched line items:", final.length);
            final.forEach((li: any) => {
                console.log(`[useCourierSelectionData]   Item "${li.name}" supplier="${li.supplierName}" supplierPostal="${li.supplierPostalCode}" customerPostal="${li.customerPostalCode}" courier="${li.courierName}"`);
            });

            setLineItems(final);
            console.log("[useCourierSelectionData] ── Done");
        } catch (e) {
            console.error("[useCourierSelectionData] Fetch error:", e);
        }
        setLoading(false);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchData(); }, [selectedOrderIds]);

    return { loading, lineItems, refetch: fetchData };
};
