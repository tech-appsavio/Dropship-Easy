// src/views/multi_order_processing/components/OrderManifestGeneration.tsx
import React, { useState, useMemo } from "react";
import { Button, Loader, Checkbox, Toast } from "@vibe/core";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import {
    SUPPLIER_MANIFEST_BOARD_ID,
    SUPPLIER_MANIFEST_COLUMN_IDS_MAP,
    SHOPS_BOARD_ID,
    SHOPS_ALL_COLUMN_IDS_MAP,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    ORDER_ALL_COLUMN_IDS_MAP,
    CUSTOMER_ALL_COLUMN_IDS_MAP,
    SUPPLIER_ALL_COLUMN_IDS_MAP,
    ORDER_BOARD_ID,
    ORDER_ITEM_BOARD_ID,
    PRODUCT_ALL_COLUMN_IDS_MAP,
    SHIPMENTS_BOARD_ID,
    SHIPMENTS_ALL_COLUMN_IDS_MAP,
} from "../constants";
import mondaySdk from "monday-sdk-js";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import { useToast } from "../hooks/useToast";
import { generateManifestPDF } from "../utils/pdfGenerator";
import { generateLabelPDF } from "../utils/labelPdfGenerator";
import ShipRocketService from "../../../services/shiprocketCourier";

const monday = mondaySdk();

const thStyle: React.CSSProperties = {
    padding: "11px 14px",
    textAlign: "center",
    fontSize: 13,
    fontWeight: 600,
    color: "#323338",
    border: "1px solid #d0d4e0",
    whiteSpace: "nowrap",
    minWidth: 120,
    backgroundColor: "#f1f3f5",
};
const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "center",
    border: "1px solid #d0d4e0",
    fontSize: 13,
    whiteSpace: "nowrap",
    minWidth: 120,
};

export const OrderManifestGeneration = ({ selectedOrderIds, onPrev, onNext }: { selectedOrderIds: string[]; onPrev: () => void; onNext: () => void }) => {
    const { loading, ordersWithLineItems, boardColumns, refetch } = useCourierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();

    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isCreating, setIsCreating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Flat list of ALL line items across all selected orders
    const allLineItems = useMemo(() => {
        return ordersWithLineItems.flatMap((o) => o.lineItems);
    }, [ordersWithLineItems]);

    const TABLE_COLS: { label: string; render: (li: any) => string }[] = [
        {
            label: "Order",
            render: (li) => {
                // Show display_value of the ORDER board-relation column (connected board field)
                const orderCol = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                return orderCol?.display_value || orderCol?.text || li.orderId || "-";
            },
        },
        { label: "Supplier", render: (li) => li.supplierName || "-" },
        { label: "Courier", render: (li) => li.courierName || "-" },
        { label: "SKU", render: (li) => li.sku || "-" },
        {
            label: "Status",
            render: (li) => {
                const col = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS);
                return col?.text || "-";
            },
        },
    ];

    const batchValidation = useMemo(() => {
        if (selectedLineItemIds.size === 0) return { isValid: false, reason: "Please select at least one item." };
        return { isValid: true, reason: `Ready to generate manifest for ${selectedLineItemIds.size} item(s).` };
    }, [selectedLineItemIds]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const formatDateTime = (date: Date): string => {
        const day = date.getDate();
        const month = date.toLocaleString("en-US", { month: "long" });
        const year = date.getFullYear();
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        return `${day} ${month} ${year} ${hours % 12 || 12}:${minutes} ${ampm}`;
    };

    const fetchShopDetails = async () => {
        const res: any = await monday.api(`query {
            boards(ids: ${SHOPS_BOARD_ID}) {
                items_page(limit: 1) { items { id column_values { id text value } } }
            }
        }`);
        if (res.errors) throw new Error(`GraphQL: ${res.errors.map((e: any) => e.message).join(", ")}`);
        const shopItem = res.data?.boards?.[0]?.items_page?.items?.[0];
        if (!shopItem) throw new Error("Shop details not found.");
        const getCol = (id: string) => shopItem.column_values.find((cv: any) => cv.id === id);
        const parseVal = (col: any) => { try { return col?.value ? JSON.parse(col.value) : null; } catch { return null; } };

        let logoUrl = "";
        const logoRaw = getCol(SHOPS_ALL_COLUMN_IDS_MAP.LOGO)?.value;
        if (logoRaw) {
            try {
                const assetId = JSON.parse(logoRaw)?.files?.[0]?.assetId;
                if (assetId) {
                    const ar: any = await monday.api(`query { assets(ids: [${assetId}]) { public_url } }`);
                    logoUrl = ar.data?.assets?.[0]?.public_url || "";
                }
            } catch {}
        }
        const emailCol = getCol(SHOPS_ALL_COLUMN_IDS_MAP.EMAIL);
        const emailP = parseVal(emailCol);
        const websiteP = parseVal(getCol(SHOPS_ALL_COLUMN_IDS_MAP.WEBSITE));
        return {
            logo: logoUrl,
            contactName: getCol(SHOPS_ALL_COLUMN_IDS_MAP.PRIMARY_CONTACT)?.text || "",
            street: getCol(SHOPS_ALL_COLUMN_IDS_MAP.STREET)?.text || "",
            city: getCol(SHOPS_ALL_COLUMN_IDS_MAP.CITY)?.text || "",
            state: getCol(SHOPS_ALL_COLUMN_IDS_MAP.STATE)?.text || "",
            country: getCol(SHOPS_ALL_COLUMN_IDS_MAP.COUNTRY)?.text || "",
            postalCode: getCol(SHOPS_ALL_COLUMN_IDS_MAP.POSTAL_CODE)?.text || "",
            phone: getCol(SHOPS_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
            email: emailCol?.text || emailP?.email || "",
            website: websiteP?.url || websiteP?.text || "",
        };
    };

    const runShiprocketFlow = async (shiprocketOrderId: string, shiprocketShipmentId: string, courierId: string, courierName: string, orderName: string, supplierData: any, supplierName: string, parentOrderId: string) => {
        if (!shiprocketOrderId || !shiprocketShipmentId) {
            showToast("Shiprocket Order ID or Shipment ID missing — skipping Shiprocket flow.", "negative");
            return;
        }
        const pickupRes = await ShipRocketService.getPickupLocations();
        const allPickups: any[] = pickupRes?.data?.shipping_address || [];
        const normalize = (s: string) => (s || "").toLowerCase().trim();
        const matched = allPickups.find((p: any) =>
            normalize(p.pin_code) === normalize(supplierData.postalCode) &&
            normalize(p.city) === normalize(supplierData.city) &&
            normalize(p.state) === normalize(supplierData.state)
        );
        let pickupLocationName: string;
        if (matched) {
            pickupLocationName = matched.pickup_location;
        } else {
            const rawAddr = supplierData.address || "";
            await ShipRocketService.addPickupAddress({
                pickup_location: supplierName, name: supplierName,
                email: supplierData.email || "noreply@example.com",
                phone: supplierData.phone.replace(/\D/g, "").slice(-10),
                address: rawAddr.length >= 10 ? rawAddr : rawAddr.padEnd(10, " "),
                address_2: "", city: supplierData.city, state: supplierData.state,
                country: supplierData.country || "India", pin_code: supplierData.postalCode,
            });
            pickupLocationName = supplierName;
        }
        await ShipRocketService.updatePickupLocation(Number(shiprocketOrderId), pickupLocationName);
        const awbRes = await ShipRocketService.assignAWB(shiprocketShipmentId, courierId);
        const awbCode: string = awbRes?.response?.data?.awb_code || awbRes?.data?.awb_code || awbRes?.awb_code || "";
        console.log("[SR Flow] AWB code extracted:", awbCode);
        if (awbCode) {
            try {
                // Text columns require the value as a JSON-encoded quoted string
                const awbJsonValue = JSON.stringify(awbCode);
                console.log("[SR Flow] Writing AWB code — column:", ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID, "value:", awbJsonValue);
                const awbRes2: any = await monday.api(`mutation {
                    change_simple_column_value(
                        item_id: ${parentOrderId}, board_id: ${ORDER_BOARD_ID},
                        column_id: "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID}", value: ${awbJsonValue}
                    ) { id }
                }`);
                if (awbRes2?.errors) {
                    console.warn("[SR Flow] AWB write GraphQL error:", JSON.stringify(awbRes2.errors));
                } else {
                    console.log("[SR Flow] AWB code written successfully.");
                }
            } catch (awbErr: any) {
                console.warn("[SR Flow] AWB column write failed (non-fatal):", awbErr?.message);
            }
        }
        const now = new Date();
        const nowFmt = formatDateTime(now);
        const shipCV: any = {
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Orders]: { item_ids: [String(parentOrderId)] },
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Assigned_Date]: nowFmt,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Courier_Company_Id]: courierId,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Courier_Name]: courierName,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Shipper_Company_Name]: supplierName,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Shipper_Address]: supplierData.address,
        };
        const createShipRes: any = await monday.api(`mutation {
            create_item(board_id: ${SHIPMENTS_BOARD_ID}, item_name: "Shipment - ${orderName}",
                column_values: "${JSON.stringify(shipCV).replace(/"/g, '\\"')}") { id }
        }`);
        const newShipmentItemId = createShipRes?.data?.create_item?.id;
        const genRes = await ShipRocketService.generatePickup(shiprocketShipmentId);
        if (newShipmentItemId) {
            const srData = genRes?.response ?? genRes;
            const rawSched: string = srData?.pickup_scheduled_date || "";
            const rawGen: string = srData?.pickup_generated_date?.date || srData?.pickup_generated_date || "";
            const pickupColPayload = JSON.stringify({
                [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Scheduled_Date]: rawSched ? formatDateTime(new Date(rawSched.replace(" ", "T"))) : nowFmt,
                [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Generated_Date]: rawGen ? formatDateTime(new Date(rawGen.replace(" ", "T"))) : nowFmt,
            });
            await monday.api(`mutation {
                change_multiple_column_values(item_id: ${newShipmentItemId}, board_id: ${SHIPMENTS_BOARD_ID},
                    column_values: "${pickupColPayload.replace(/"/g, '\\"')}") { id }
            }`);
        }
    };

    // Merge multiple label Blobs (each a valid PDF) into one multi-page PDF blob using byte concat trick
    // jsPDF doesn't support merging natively, so we generate one doc with all items
    const generateMergedLabelPDF = async (items: any[]): Promise<Blob> => {
        return generateLabelPDF(items); // labelPdfGenerator already does addPage() per item
    };

    const handleGenerateManifest = async () => {
        if (selectedLineItemIds.size === 0) return;
        setIsCreating(true);
        try {
            const selectedIds = Array.from(selectedLineItemIds);
            console.log("[Manifest] ── START ──────────────────────────────────────");
            console.log("[Manifest] Selected item IDs:", selectedIds);

            // 1. Fetch deep data for selected line items
            const itemsRes: any = await monday.api(`query {
                items(ids: [${selectedIds.join(",")}]) {
                    id name
                    column_values {
                        id text value
                        ... on BoardRelationValue { linked_item_ids display_value }
                    }
                }
            }`);
            if (!itemsRes.data?.items?.length) throw new Error("Failed to retrieve line item data.");
            const rawItems = itemsRes.data.items;
            console.log("[Manifest] STEP 1: Fetched", rawItems.length, "raw line items");

            // 2. For each item, extract the parent Order ID from the connected board relation field
            const getVal = (item: any, id: string) => item.column_values.find((cv: any) => cv.id === id);
            const getLinkedId = (col: any): string => {
                if (col?.linked_item_ids?.[0]) return String(col.linked_item_ids[0]);
                try {
                    const p = JSON.parse(col?.value || "{}");
                    return String(p?.linkedPulseIds?.[0]?.linkedPulseId || "");
                } catch { return ""; }
            };

            // Collect unique parent order IDs from the ORDER relation column on each line item
            const parentOrderIdMap: Record<string, string> = {};
            rawItems.forEach((item: any) => {
                const orderCol = getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                const pid = getLinkedId(orderCol);
                parentOrderIdMap[item.id] = pid;
                console.log(`[Manifest] STEP 2: Item "${item.name}" (${item.id}) → parentOrderId: ${pid || "NOT FOUND"}`);
            });
            const uniqueParentOrderIds = [...new Set(Object.values(parentOrderIdMap).filter(Boolean))];
            console.log("[Manifest] STEP 2: Unique parent order IDs:", uniqueParentOrderIds);

            // 3. Fetch parent order details for all unique orders
            const orderRes: any = await monday.api(`query {
                items(ids: [${uniqueParentOrderIds.join(",")}]) {
                    id name
                    column_values {
                        id text value
                        ... on BoardRelationValue { linked_item_ids }
                    }
                }
            }`);
            const orderMap: Record<string, any> = {};
            (orderRes.data?.items || []).forEach((o: any) => { orderMap[o.id] = o; });
            console.log("[Manifest] STEP 3: Fetched order details for IDs:", Object.keys(orderMap));

            // 4. Fetch customer data
            const customerIds: string[] = [];
            Object.values(orderMap).forEach((o: any) => {
                const custCol = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER);
                const custId = getLinkedId(custCol);
                if (custId && !customerIds.includes(custId)) customerIds.push(custId);
            });
            const customerMap: Record<string, any> = {};
            if (customerIds.length > 0) {
                const custRes: any = await monday.api(`query {
                    items(ids: [${customerIds.join(",")}]) {
                        id name
                        column_values { id text }
                    }
                }`);
                (custRes.data?.items || []).forEach((c: any) => { customerMap[c.id] = c; });
            }
            console.log("[Manifest] STEP 4: Customer IDs fetched:", customerIds);

            // 5. Fetch supplier details for each unique supplier
            const supplierIds = [...new Set(rawItems.map((item: any) => getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER))).filter(Boolean))];
            const supplierDataMap: Record<string, any> = {};
            if (supplierIds.length > 0) {
                const suppRes: any = await monday.api(`query {
                    items(ids: [${supplierIds.join(",")}]) {
                        id column_values { id text value }
                    }
                }`);
                (suppRes.data?.items || []).forEach((s: any) => {
                    const gc = (id: string) => s.column_values.find((cv: any) => cv.id === id);
                    supplierDataMap[s.id] = {
                        address: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.ADDRESS)?.text || "",
                        phone: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
                        email: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "",
                        postalCode: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.POSTALCODE)?.text || "",
                        city: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.City)?.text || "",
                        state: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.State)?.text || "",
                        country: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.Country)?.text || "India",
                    };
                });
            }
            console.log("[Manifest] STEP 5: Supplier IDs fetched:", Object.keys(supplierDataMap));

            // 6. Fetch product prices
            const productIds = [...new Set(rawItems.map((item: any) => getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT))).filter(Boolean))];
            const productPriceMap: Record<string, number> = {};
            if (productIds.length > 0) {
                const prodRes: any = await monday.api(`query {
                    items(ids: [${productIds.join(",")}]) {
                        id column_values(ids: ["${PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE}"]) { id text }
                    }
                }`);
                (prodRes.data?.items || []).forEach((p: any) => {
                    const priceCol = p.column_values.find((cv: any) => cv.id === PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE);
                    productPriceMap[p.id] = parseFloat(priceCol?.text?.replace(/[^0-9.]/g, "") || "0");
                });
            }
            console.log("[Manifest] STEP 6: Product price map:", productPriceMap);

            const shopDetails = await fetchShopDetails();

            // 7. Build compiled items
            const compiledItems = rawItems.map((item: any) => {
                const parentOrderId = parentOrderIdMap[item.id];
                const order = orderMap[parentOrderId] || {};
                const getOrderCol = (id: string) => order.column_values?.find((cv: any) => cv.id === id);

                const supplierId = getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER));
                const supplierName = getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.display_value || "";
                const courierName = getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME)?.text || "";
                // Use courierId text; normalise empty string so grouping is consistent
                const courierId = (getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID)?.text || "").trim();
                const linkedProdId = getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT));
                const unitPrice = productPriceMap[linkedProdId] || 0;
                const qty = parseInt(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY)?.text || "1") || 1;

                const customerId = getLinkedId(getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER));
                const customer = customerMap[customerId];
                const totalPrice = getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.TOTAL_PRICE)?.text || (unitPrice * qty).toFixed(2);

                // Grouping key: always prefer courierId; fall back to normalised courierName
                const courierKey = courierId || courierName.trim();
                const groupKey = `${supplierId}__${courierKey}`;

                console.log(`[Manifest] STEP 7: Item "${item.name}" supplierId=${supplierId} supplierName=${supplierName} courierId=${courierId} courierName=${courierName} courierKey=${courierKey} groupKey=${groupKey} parentOrderId=${parentOrderId}`);

                return {
                    ...item,
                    parentOrderId,
                    orderId: getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.ORDERID)?.text || order.name || parentOrderId,
                    orderName: order.name || parentOrderId,
                    supplierId,
                    supplierName,
                    supplierData: supplierDataMap[supplierId] || {},
                    courierName,
                    courierId,
                    courierKey,
                    groupKey,
                    sku: getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU)?.text || item.name,
                    unitPrice,
                    totalPrice,
                    paymentMethod: getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.PAYMENTMETHOD)?.text || "To be paid",
                    billingAddress: getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.BILLING_ADDRESS)?.text || "",
                    shiprocketOrderId: getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "",
                    shiprocketShipmentId: getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "",
                    customerName: customer?.name || "",
                    customerPhone: customer?.column_values?.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
                    customerEmail: customer?.column_values?.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "",
                    supplierAddress: supplierDataMap[supplierId]?.address || "",
                    supplierPhone: supplierDataMap[supplierId]?.phone || "",
                    supplierEmail: supplierDataMap[supplierId]?.email || "",
                };
            });

            // 8. Group by pre-computed groupKey (supplierId + courierKey)
            const groups: Record<string, typeof compiledItems> = {};
            compiledItems.forEach((item) => {
                if (!groups[item.groupKey]) groups[item.groupKey] = [];
                groups[item.groupKey].push(item);
            });
            console.log("[Manifest] STEP 8: Groups formed:", Object.keys(groups).length);
            Object.entries(groups).forEach(([key, items]) => {
                console.log(`[Manifest] STEP 8:   Group "${key}" → ${items.length} item(s):`, items.map((i) => i.name));
            });

            const now = new Date();
            const ts = `${now.getDate()}${now.getMonth() + 1}${now.getFullYear()}_${now.getHours()}${now.getMinutes()}`;

            for (const [groupKey, groupItems] of Object.entries(groups)) {
                const first = groupItems[0];
                const supplierName = first.supplierName;
                const courierName = first.courierName;
                const manifestName = `${supplierName.replace(/[^a-zA-Z0-9]/g, "")}_${courierName.replace(/[^a-zA-Z0-9]/g, "")}_Batch_${ts}`;
                console.log(`[Manifest] STEP 9: Processing group "${groupKey}" → manifestName: ${manifestName}, items: ${groupItems.length}`);

                // Build column values for manifest board item
                // Collect ALL unique parent order IDs across all items in this group
                const supplierId = first.supplierId;
                const groupParentOrderIds = [...new Set(groupItems.map((i) => i.parentOrderId).filter(Boolean))];
                console.log(`[Manifest] STEP 9: Group parent order IDs:`, groupParentOrderIds);
                const manifestColValues: any = {
                    [SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER_LINE_ITEM]: { item_ids: groupItems.map((i) => String(i.id)) },
                };
                if (groupParentOrderIds.length > 0) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER] = { item_ids: groupParentOrderIds.map(String) };
                if (supplierId) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.SUPPLIER] = { item_ids: [String(supplierId)] };

                const createRes: any = await monday.api(`mutation {
                    create_item(board_id: ${SUPPLIER_MANIFEST_BOARD_ID}, item_name: "${manifestName}",
                        column_values: "${JSON.stringify(manifestColValues).replace(/"/g, '\\"')}") { id }
                }`);
                const newManifestId = createRes.data.create_item.id;
                console.log(`[Manifest] STEP 9: Created manifest board item ID: ${newManifestId}`);

                // Manifest PDF — one per group
                console.log(`[Manifest] STEP 9: Generating manifest PDF for group "${groupKey}"...`);
                const manifestBlob = await generateManifestPDF({
                    supplierName, courierName, lineItems: groupItems, shopDetails, manifestName,
                });
                const manifestFile = new File([manifestBlob], `${manifestName}_manifest.pdf`, { type: "application/pdf" });
                await monday.api(
                    `mutation ($file: File!) { add_file_to_column(item_id: ${newManifestId}, column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.MANIFEST_FILE}", file: $file) { id } }`,
                    { variables: { file: manifestFile } }
                );
                console.log(`[Manifest] STEP 9: Manifest PDF uploaded for group "${groupKey}"`);

                // Label PDF — all items in group merged into one PDF
                console.log(`[Manifest] STEP 9: Generating merged label PDF for ${groupItems.length} item(s) in group "${groupKey}"...`);
                const mergedLabelBlob = await generateMergedLabelPDF(groupItems);
                const labelFile = new File([mergedLabelBlob], `${manifestName}_labels.pdf`, { type: "application/pdf" });
                await monday.api(
                    `mutation ($file: File!) { add_file_to_column(item_id: ${newManifestId}, column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.LABEL_FILE}", file: $file) { id } }`,
                    { variables: { file: labelFile } }
                );
                console.log(`[Manifest] STEP 9: Label PDF uploaded for group "${groupKey}"`);

                // Shiprocket flow — once per group
                console.log(`[Manifest] STEP 9: Running Shiprocket flow for group "${groupKey}"`, { shiprocketOrderId: first.shiprocketOrderId, shiprocketShipmentId: first.shiprocketShipmentId, courierId: first.courierId });
                await runShiprocketFlow(
                    first.shiprocketOrderId, first.shiprocketShipmentId,
                    first.courierId, courierName, first.orderName,
                    first.supplierData, supplierName, first.parentOrderId
                );
                console.log(`[Manifest] STEP 9: Shiprocket flow done for group "${groupKey}"`);

                // Update status on all line items in this group
                console.log(`[Manifest] STEP 9: Updating line item statuses for group "${groupKey}"...`);
                await Promise.all(groupItems.map(async (item) => {
                    const oliCV = {
                        [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Manifest Generated" },
                        [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIERMANIFEST]: { item_ids: [String(newManifestId)] },
                    };
                    const escapedCV = JSON.stringify(oliCV).replace(/"/g, '\\"');
                    console.log(`[Manifest] STEP 9: Updating item ${item.id} ("${item.name}") with CV:`, JSON.stringify(oliCV));
                    const updateRes: any = await monday.api(`mutation {
                        change_multiple_column_values(item_id: ${item.id}, board_id: ${ORDER_ITEM_BOARD_ID},
                            column_values: "${escapedCV}") { id }
                    }`);
                    if (updateRes?.errors) {
                        console.error(`[Manifest] STEP 9: Status update FAILED for item ${item.id}:`, JSON.stringify(updateRes.errors));
                    } else {
                        console.log(`[Manifest] STEP 9: Status updated OK for item ${item.id}`);
                    }
                }));
                console.log(`[Manifest] STEP 9: Line item statuses updated for group "${groupKey}"`);

                // Check if all siblings are done → update parent order status
                for (const parentId of [...new Set(groupItems.map((i) => i.parentOrderId))]) {
                    console.log(`[Manifest] STEP 9: Checking sibling completion for parentOrderId: ${parentId}`);
                    const auditRes: any = await monday.api(`query {
                        boards(ids: ${ORDER_ITEM_BOARD_ID}) {
                            items_page(limit: 500) {
                                items { id column_values { id text ... on BoardRelationValue { linked_item_ids } } }
                            }
                        }
                    }`);
                    const allOli = auditRes.data?.boards?.[0]?.items_page?.items || [];
                    const siblings = allOli.filter((li: any) => {
                        const oc = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                        const lid = oc?.linked_item_ids?.[0] || (() => { try { return String(JSON.parse(oc?.value || "{}").linkedPulseIds?.[0]?.linkedPulseId || ""); } catch { return ""; } })();
                        return String(lid) === String(parentId);
                    });
                    const allDone = siblings.length > 0 && siblings.every((li: any) =>
                        li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS)?.text === "Manifest Generated"
                    );
                    console.log(`[Manifest] STEP 9: parentId ${parentId} → siblings: ${siblings.length}, allDone: ${allDone}`);
                    if (allDone) {
                        await monday.api(`mutation {
                            change_multiple_column_values(item_id: ${parentId}, board_id: ${ORDER_BOARD_ID},
                                column_values: "${JSON.stringify({ [ORDER_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Manifest Generated" } }).replace(/"/g, '\\"')}") { id }
                        }`);
                        console.log(`[Manifest] STEP 9: Parent order ${parentId} status updated to "Manifest Generated"`);
                    }
                }
            }

            console.log("[Manifest] ✔ ALL GROUPS PROCESSED SUCCESSFULLY");

            await refetch();
            showToast("Manifests and Labels generated successfully!", "positive");
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            showToast("Manifest Generation Failed: " + e.message, "negative");
        } finally {
            setIsCreating(false);
        }
    };

    if (loading) return <Loader size={40} />;

    return (
        <div style={{ padding: "24px" }}>
            <Toast open={toast.open} type={toast.type} onClose={hideToast} autoHideDuration={4000} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
                {toast.message}
            </Toast>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Generate Supplier Manifests</h3>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <Button disabled={!batchValidation.isValid || isCreating} loading={isCreating} onClick={handleGenerateManifest}>
                        Generate Manifest ({selectedLineItemIds.size})
                    </Button>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: batchValidation.isValid ? "#137333" : "#c5221f" }}>
                        {batchValidation.reason}
                    </p>
                </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto", border: "1px solid #d0d4e0", borderRadius: 6, marginBottom: 20 }}>
                <div style={{ overflowY: "auto", maxHeight: 420 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                            <tr>
                                <th style={{ ...thStyle, width: 44, minWidth: 44, padding: "11px 6px" }}>
                                    <IndeterminateCheckbox
                                        checked={allLineItems.length > 0 && selectedLineItemIds.size === allLineItems.length}
                                        indeterminate={selectedLineItemIds.size > 0 && selectedLineItemIds.size < allLineItems.length}
                                        onChange={() => setSelectedLineItemIds(
                                            selectedLineItemIds.size === allLineItems.length ? new Set() : new Set(allLineItems.map((i: any) => i.id))
                                        )}
                                    />
                                </th>
                                <th style={thStyle}>Item Name</th>
                                {TABLE_COLS.map((c) => <th key={c.label} style={thStyle}>{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {allLineItems.length > 0 ? allLineItems.map((item: any) => (
                                <tr key={item.id} style={{ backgroundColor: "#fff" }}>
                                    <td style={{ ...tdStyle, width: 44, minWidth: 44, padding: "10px 6px", verticalAlign: "middle" }}>
                                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                            <Checkbox
                                                checked={selectedLineItemIds.has(item.id)}
                                                onChange={() => {
                                                    const next = new Set(selectedLineItemIds);
                                                    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                                    setSelectedLineItemIds(next);
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td style={tdStyle}>{item.name}</td>
                                    {TABLE_COLS.map((c) => <td key={c.label} style={tdStyle}>{c.render(item)}</td>)}
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={TABLE_COLS.length + 2} style={{ padding: "32px", textAlign: "center", color: "#676879", fontSize: 13, border: "1px solid #d0d4e0" }}>
                                        No line items to display.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Inline confirm dialog */}
            {showConfirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#fff", borderRadius: 8, padding: "32px", maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
                        <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>Finish &amp; Reset</h3>
                        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#676879" }}>Are you sure you want to finish and reset? This will clear all selected orders.</p>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                            <button onClick={() => setShowConfirm(false)} style={{ padding: "9px 20px", borderRadius: 6, border: "1px solid #d0d4e0", background: "#fff", color: "#323338", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                                Cancel
                            </button>
                            <button onClick={() => { setShowConfirm(false); onNext(); }} style={{ padding: "9px 20px", borderRadius: 6, background: "#0073ea", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                                Finish &amp; Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom nav */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, paddingBottom: 24, borderTop: "1px solid #eee" }}>
                <button onClick={onPrev} style={{ padding: "10px 22px", borderRadius: 6, border: "1px solid #d0d4e0", background: "#fff", color: "#323338", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                    ← Back to Couriers
                </button>
                <button onClick={() => setShowConfirm(true)} style={{ padding: "10px 22px", borderRadius: 6, background: "#0073ea", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, boxShadow: "0 2px 8px rgba(0,115,234,0.3)" }}>
                    Finish &amp; Reset →
                </button>
            </div>
        </div>
    );
};
