// src/views/multi_order_processing/components/OrderManifestGeneration.tsx
import React, { useState, useMemo } from "react";
import { Button, Loader, Dropdown, Checkbox, Toast } from "@vibe/core";
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
} from "../constants";
import mondaySdk from "monday-sdk-js";

import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import { useToast } from "../hooks/useToast";
import { generateManifestPDF } from "../utils/pdfGenerator";
import { generateLabelPDF } from "../utils/labelPdfGenerator";
import ShipRocketService from "../../../services/shiprocketCourier";

// Dynamic columns configuration for easy extension
const MANIFEST_OLI_TABLE_COLUMNS = [
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIERMANIFEST,
];

const monday = mondaySdk();

export const OrderManifestGeneration = ({ selectedOrderIds }: { selectedOrderIds: string[] }) => {
    const { loading, ordersWithLineItems, boardColumns, refetch } = useCourierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();

    // Cascading filtering and selection states
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [selectedCourier, setSelectedCourier] = useState<any>(null);
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isCreating, setIsUpdating] = useState(false);

    // 1. Dropdown options for Orders selected in Stage 1
    const orderOptions = useMemo(() => {
        return ordersWithLineItems.map((o) => ({ label: o.name, value: o.id }));
    }, [ordersWithLineItems]);

    // 2. Cascading Dropdown options for Suppliers (scoped strictly to currently selected order line items)
    const supplierOptions = useMemo(() => {
        if (!selectedOrder) return [];
        const currentOrder = ordersWithLineItems.find((o) => o.id === selectedOrder.value);
        const suppliersMap = new Map();

        currentOrder?.lineItems.forEach((li: any) => {
            if (li.supplierId) {
                suppliersMap.set(li.supplierId, li.supplierName);
            }
        });

        const options = Array.from(suppliersMap.entries()).map(([id, name]) => ({
            label: name,
            value: id,
        }));

        // Handle case where line items are unassigned to include an empty option
        const hasBlankSupplier = currentOrder?.lineItems.some((li: any) => !li.supplierId);
        if (hasBlankSupplier) {
            options.unshift({ label: "No Supplier Assigned", value: "none" });
        }

        return options;
    }, [selectedOrder, ordersWithLineItems]);

    // 3. Cascading Dropdown options for Couriers (scoped strictly to currently selected order line items)
    const courierOptions = useMemo(() => {
        if (!selectedOrder) return [];
        const currentOrder = ordersWithLineItems.find((o) => o.id === selectedOrder.value);
        const couriersMap = new Map();

        currentOrder?.lineItems.forEach((li: any) => {
            // Filter by supplier first if one is chosen to maintain strict hierarchy
            if (selectedSupplier) {
                const supplierMatch = selectedSupplier.value === "none" ? !li.supplierId : li.supplierId === selectedSupplier.value;
                if (!supplierMatch) return;
            }

            const courierName = li.courierName || "Unknown Courier";
            const courierId = li.courierId || courierName;
            if (courierId) {
                couriersMap.set(courierId, courierName);
            }
        });

        return Array.from(couriersMap.entries()).map(([id, name]) => ({
            label: name,
            value: id,
        }));
    }, [selectedOrder, selectedSupplier, ordersWithLineItems]);

    // 4. Hierarchical evaluation of table items (Order -> Supplier -> Courier)
    const filteredLineItems = useMemo(() => {
        if (!selectedOrder) return [];
        const currentOrder = ordersWithLineItems.find((o) => o.id === selectedOrder.value);
        let items = currentOrder?.lineItems || [];

        // Supplier Layer Filter
        if (selectedSupplier) {
            items = items.filter((li: any) => {
                if (selectedSupplier.value === "none") return !li.supplierId;
                return li.supplierId === selectedSupplier.value;
            });
        }

        // Courier Layer Filter
        if (selectedCourier) {
            items = items.filter((li: any) => {
                const itemCourierId = li.courierId || li.courierName;
                return itemCourierId === selectedCourier.value;
            });
        }

        return items;
    }, [selectedOrder, selectedSupplier, selectedCourier, ordersWithLineItems]);

    const batchValidation = useMemo(() => {
        if (selectedLineItemIds.size === 0) {
            return { isValid: false, reason: "Please select at least one item." };
        }

        // Isolate the selected line items records from our data source
        const selectedItems = filteredLineItems.filter((li) => selectedLineItemIds.has(li.id));

        // Evaluate Supplier uniformity
        const firstSupplierId = selectedItems[0]?.supplierId || "";
        const allSuppliersMatch = selectedItems.every((li) => (li.supplierId || "") === firstSupplierId);

        // Evaluate Courier uniformity (normalizing fallback parameters)
        const firstCourierKey = selectedItems[0]?.courierId || selectedItems[0]?.courierName || "";
        const allCouriersMatch = selectedItems.every((li) => {
            const currentCourierKey = li.courierId || li.courierName || "";
            return currentCourierKey === firstCourierKey;
        });

        if (!allSuppliersMatch) {
            return { isValid: false, reason: "Selected items have mismatching Suppliers. They must match." };
        }
        if (!allCouriersMatch) {
            return { isValid: false, reason: "Selected items have mismatching Couriers. They must match." };
        }

        return { isValid: true, reason: `Ready to generate manifest for ${selectedLineItemIds.size} items.` };
    }, [selectedLineItemIds, filteredLineItems]);

    // ── Shiprocket post-manifest flow ─────────────────────────────────────────
    const runShiprocketFlow = async ({
        shiprocketOrderId,
        shiprocketShipmentId,
        courierId,
        supplierName,
        supplierAddress,
        supplierPhone,
        supplierEmail,
        supplierPostalCode,
    }: {
        shiprocketOrderId: string;
        shiprocketShipmentId: string;
        courierId: string;
        supplierName: string;
        supplierAddress: string;
        supplierPhone: string;
        supplierEmail: string;
        supplierPostalCode: string;
    }) => {
        console.log("[SR Flow] Starting Shiprocket flow with inputs:", {
            shiprocketOrderId,
            shiprocketShipmentId,
            courierId,
            supplierName,
            supplierAddress,
            supplierPhone,
            supplierEmail,
            supplierPostalCode,
        });

        if (!shiprocketOrderId || !shiprocketShipmentId) {
            console.warn("[SR Flow] Missing shiprocketOrderId or shiprocketShipmentId — aborting flow.", { shiprocketOrderId, shiprocketShipmentId });
            showToast("Shiprocket Order ID or Shipment ID missing on order board — skipping Shiprocket flow.", "negative");
            return;
        }

        // STEP 1 — Fetch all pickup locations
        console.log("[SR Flow] STEP 1: Fetching all pickup locations from Shiprocket...");
        const pickupRes = await ShipRocketService.getPickupLocations();
        console.log("[SR Flow] STEP 1 Response (pickup locations):", JSON.stringify(pickupRes, null, 2));
        const allPickups: any[] = pickupRes?.data?.shipping_address || [];
        console.log("[SR Flow] STEP 1: Total pickup locations found:", allPickups.length);

        // STEP 2 — Match supplier address against existing pickup locations
        console.log("[SR Flow] STEP 2: Matching supplier address against pickup locations...");
        console.log("[SR Flow] STEP 2: Supplier postal code:", supplierPostalCode);
        console.log("[SR Flow] STEP 2: Supplier address:", supplierAddress);

        const normalize = (s: string) => (s || "").toLowerCase().trim();
        const addrWords = normalize(supplierAddress).split(/\s+/).filter((w) => w.length > 3);
        console.log("[SR Flow] STEP 2: Address keywords for matching:", addrWords);

        const matched = allPickups.find((p: any) => {
            const pinMatch = normalize(p.pin_code) === normalize(supplierPostalCode);
            const cityMatch = normalize(p.city) === normalize(supplierAddress.split(",")[0]) || normalize(supplierAddress).includes(normalize(p.city));
            const stateMatch = normalize(supplierAddress).includes(normalize(p.state));
            const addrMatch = addrWords.some((w) => normalize(p.address + " " + (p.address_2 || "")).includes(w));
            console.log(`[SR Flow] STEP 2: Checking pickup "${p.pickup_location}" — pin:${pinMatch} city:${cityMatch} state:${stateMatch} addr:${addrMatch}`);
            return pinMatch && (cityMatch || stateMatch || addrMatch);
        });

        console.log("[SR Flow] STEP 2: Matched pickup location:", matched ? matched.pickup_location : "NO MATCH — will create new");

        let pickupLocationName: string;

        if (matched) {
            pickupLocationName = matched.pickup_location;
            console.log("[SR Flow] STEP 2: Using existing pickup location:", pickupLocationName);
        } else {
            // STEP 3 — No match: create new pickup address
            const parts = supplierAddress.split(",").map((s: string) => s.trim());
            const addPickupPayload = {
                pickup_location: supplierName,
                name: supplierName,
                email: supplierEmail || "noreply@example.com",
                phone: supplierPhone.replace(/\D/g, "").slice(-10),
                address: parts[0] || supplierAddress,
                address_2: parts[1] || "",
                city: parts[parts.length - 3] || "",
                state: parts[parts.length - 2] || "",
                country: "India",
                pin_code: supplierPostalCode,
                lat: "",
                long: "",
                vendor_name: supplierName,
                phone_verified: true,
            };
            console.log("[SR Flow] STEP 3: Creating new pickup address with payload:", JSON.stringify(addPickupPayload, null, 2));
            const addPickupRes = await ShipRocketService.addPickupAddress(addPickupPayload);
            console.log("[SR Flow] STEP 3 Response (add pickup):", JSON.stringify(addPickupRes, null, 2));
            pickupLocationName = supplierName;
        }

        // STEP 4 — Update pickup location on the Shiprocket order
        console.log("[SR Flow] STEP 4: Updating pickup location on Shiprocket order...", { shiprocketOrderId, pickupLocationName });
        const updatePickupRes = await ShipRocketService.updatePickupLocation(Number(shiprocketOrderId), pickupLocationName);
        console.log("[SR Flow] STEP 4 Response (update pickup location):", JSON.stringify(updatePickupRes, null, 2));

        // STEP 5 — Assign AWB
        console.log("[SR Flow] STEP 5: Assigning AWB...", { shiprocketShipmentId, courierId });
        const awbRes = await ShipRocketService.assignAWB(shiprocketShipmentId, courierId);
        console.log("[SR Flow] STEP 5 Response (assign AWB):", JSON.stringify(awbRes, null, 2));

        // STEP 6 — Generate pickup
        console.log("[SR Flow] STEP 6: Generating pickup...", { shiprocketShipmentId });
        const generatePickupRes = await ShipRocketService.generatePickup(shiprocketShipmentId);
        console.log("[SR Flow] STEP 6 Response (generate pickup):", JSON.stringify(generatePickupRes, null, 2));

        console.log("[SR Flow] ✅ Shiprocket flow completed successfully.");
    };

    const fetchShopDetails = async () => {
        const res: any = await monday.api(`query {
            boards(ids: ${SHOPS_BOARD_ID}) {
                items_page(limit: 1) {
                    items {
                        id
                        column_values {
                            id
                            text
                            value
                        }
                    }
                }
            }
        }`);

        if (res.errors) {
            throw new Error(`GraphQL: ${res.errors.map((e: any) => e.message).join(", ")}`);
        }

        if (!res.data?.boards?.[0]?.items_page?.items?.[0]) {
            throw new Error("Shop details not found.");
        }

        const shopItem = res.data.boards[0].items_page.items[0];
        const getCol = (id: string) => shopItem.column_values.find((cv: any) => cv.id === id);

        let logoUrl = "";
        const logoRawValue = getCol(SHOPS_ALL_COLUMN_IDS_MAP.LOGO)?.value;
        if (logoRawValue) {
            try {
                const parsed = JSON.parse(logoRawValue);
                const assetId = parsed?.files?.[0]?.assetId;
                if (assetId) {
                    const assetRes: any = await monday.api(`query {
                        assets(ids: [${assetId}]) {
                            public_url
                        }
                    }`);
                    logoUrl = assetRes.data?.assets?.[0]?.public_url || "";
                }
            } catch (e) {
                console.warn("Could not parse logo column — skipping logo:", e);
            }
        }

        const parseVal = (col: any) => {
            try {
                return col?.value ? JSON.parse(col.value) : null;
            } catch {
                return null;
            }
        };

        const emailCol = getCol(SHOPS_ALL_COLUMN_IDS_MAP.EMAIL);
        const emailParsed = parseVal(emailCol);
        const email = emailCol?.text || emailParsed?.email || emailParsed?.text || "";

        const websiteParsed = parseVal(getCol(SHOPS_ALL_COLUMN_IDS_MAP.WEBSITE));
        const website = websiteParsed?.url || websiteParsed?.text || "";
        const phone = getCol(SHOPS_ALL_COLUMN_IDS_MAP.PHONE)?.text || "";

        return {
            logo: logoUrl,
            contactName: getCol(SHOPS_ALL_COLUMN_IDS_MAP.PRIMARY_CONTACT)?.text || "",
            street: getCol(SHOPS_ALL_COLUMN_IDS_MAP.STREET)?.text || "",
            city: getCol(SHOPS_ALL_COLUMN_IDS_MAP.CITY)?.text || "",
            state: getCol(SHOPS_ALL_COLUMN_IDS_MAP.STATE)?.text || "",
            country: getCol(SHOPS_ALL_COLUMN_IDS_MAP.COUNTRY)?.text || "",
            postalCode: getCol(SHOPS_ALL_COLUMN_IDS_MAP.POSTAL_CODE)?.text || "",
            phone,
            email,
            website,
        };
    };

    const handleGenerateManifest = async () => {
        if (selectedLineItemIds.size === 0) return;
        setIsUpdating(true);

        try {
            const selectedIdsArray = Array.from(selectedLineItemIds);

            // 1. Fetch deep records for ALL selected Line Items simultaneously
            const itemsDataRes: any = await monday.api(`query {
                items(ids: [${selectedIdsArray.join(",")}]) {
                    id
                    name
                    column_values {
                        id
                        text
                        ... on BoardRelationValue { linked_item_ids display_value }
                    }
                }
            }`);

            if (!itemsDataRes.data?.items || itemsDataRes.data.items.length === 0) {
                throw new Error("Failed to retrieve line item data from board.");
            }

            const rawFetchedItems = itemsDataRes.data.items;

            // Establish our base header profile from the first selected item in line
            const firstItemRaw = rawFetchedItems[0];
            const getFirstVal = (id: string) => firstItemRaw.column_values.find((cv: any) => cv.id === id);

            const parentOrderId = getFirstVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER)?.linked_item_ids?.[0];
            const baseSupplierId = getFirstVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.linked_item_ids?.[0];
            const baseSupplierName = getFirstVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.display_value || "N/A";
            const baseCourierName = getFirstVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME)?.text || "N/A";

            console.log("[Manifest] Line items fetched:", rawFetchedItems.length);
            console.log("[Manifest] parentOrderId:", parentOrderId, "| baseSupplierId:", baseSupplierId, "| baseSupplierName:", baseSupplierName, "| baseCourierName:", baseCourierName);

            if (!parentOrderId) throw new Error("Order link missing on the primary selected line item.");

            // 2. Query Parent Order details (Address, Prices, Relations)
            const orderRes: any = await monday.api(`query {
                items(ids: [${parentOrderId}]) {
                    column_values {
                        id
                        text
                        ... on BoardRelationValue { linked_item_ids }
                    }
                }
            }`);

            const order = orderRes.data.items[0];
            const getOrderVal = (id: string) => order.column_values.find((cv: any) => cv.id === id);

            const billingAddress = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.BILLING_ADDRESS)?.text || "[Address]";
            const totalPrice = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.TOTAL_PRICE)?.text || "0";
            const paymentMethod = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.PAYMENTMETHOD)?.text || "To be paid";
            const customerId = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER)?.linked_item_ids?.[0];
            const shiprocketOrderId = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "";
            const shiprocketShipmentId = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "";

            console.log("[Manifest] Order data fetched:", { billingAddress, totalPrice, paymentMethod, customerId, shiprocketOrderId, shiprocketShipmentId });

            // 3. Query Customer Info
            let customerData = { name: "", phone: "", email: "" };
            if (customerId) {
                const custRes: any = await monday.api(`query {
                    items(ids: [${customerId}]) {
                        name
                        column_values { id text }
                    }
                }`);
                const cust = custRes.data?.items?.[0];
                if (cust) {
                    customerData = {
                        name: cust.name || "",
                        phone: cust.column_values.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
                        email: cust.column_values.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "",
                    };
                }
            }

            // NEW: Fetch details for Supplier directly from the Supplier board
            let supplierData = { address: "", phone: "", email: "", postalCode: "" };
            if (baseSupplierId) {
                const suppRes: any = await monday.api(`query {
                    items(ids: [${baseSupplierId}]) {
                        column_values {
                            id
                            text
                            value
                        }
                    }
                }`);
                const suppItem = suppRes.data?.items?.[0];
                if (suppItem) {
                    const getSuppCol = (id: string) => suppItem.column_values.find((cv: any) => cv.id === id);
                    supplierData = {
                        address: getSuppCol(SUPPLIER_ALL_COLUMN_IDS_MAP.ADDRESS)?.text || "",
                        phone: getSuppCol(SUPPLIER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
                        email: getSuppCol(SUPPLIER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "",
                        postalCode: getSuppCol(SUPPLIER_ALL_COLUMN_IDS_MAP.POSTALCODE)?.text || "",
                    };
                    console.log("[Manifest] Supplier data fetched:", supplierData);
                }
            }

            const productIdsToQuery = rawFetchedItems
                .map((item: any) => item.column_values.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT)?.linked_item_ids?.[0])
                .filter(Boolean);

            let productPriceMap: Record<string, number> = {};

            if (productIdsToQuery.length > 0) {
                // Batch query the Product Board directly using the isolated IDs
                const productRes: any = await monday.api(`query {
                    items(ids: [${Array.from(new Set(productIdsToQuery)).join(",")}]) {
                        id
                        column_values(ids: ["${PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE}"]) {
                            id
                            text
                        }
                    }
                }`);

                const productItems = productRes.data?.items || [];
                productItems.forEach((pItem: any) => {
                    const priceCol = pItem.column_values.find((cv: any) => cv.id === PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE);
                    const priceValue = parseFloat(priceCol?.text?.replace(/[^0-9.]/g, "") || "0");
                    productPriceMap[String(pItem.id)] = priceValue;
                    console.log("products " + productRes);
                });
            }
            console.log("products " + productPriceMap);
            // 4. Map and complement structural info across ALL selected items for the PDF Table
            const compiledFullLineItems = rawFetchedItems.map((item: any) => {
                const getItemVal = (id: string) => item.column_values.find((cv: any) => cv.id === id);

                // Match raw selling price from source product board using linked relation key
                const linkedProdId = getItemVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT)?.linked_item_ids?.[0];
                const cleanUnitPrice = productPriceMap[String(linkedProdId)] || 0;

                const rawQty = getItemVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY)?.text || "1";
                const parsedQty = parseInt(rawQty, 10) || 1;
                const itemCalculatedTotal = cleanUnitPrice * parsedQty;

                return {
                    ...item,
                    sku: getItemVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU)?.text || item.name,
                    supplierName: baseSupplierName,
                    supplierAddress: supplierData.address,
                    supplierPhone: supplierData.phone,
                    supplierEmail: supplierData.email,
                    courierName: baseCourierName,
                    orderId: getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.ORDERID)?.text || item.name,
                    billingAddress,

                    // Override pricing strings with direct board variables
                    unitPrice: cleanUnitPrice,
                    totalPrice: totalPrice !== "0" && totalPrice !== "" ? totalPrice : itemCalculatedTotal.toFixed(2),

                    paymentMethod,
                    customerName: customerData.name,
                    customerPhone: customerData.phone,
                    customerEmail: customerData.email,
                };
            });

            const now = new Date();
            const timestamp = `${now.getDate()}${now.getMonth() + 1}${now.getFullYear()}_${now.getHours()}${now.getMinutes()}`;
            const manifestName = `${baseSupplierName.replace(/\s/g, "")}_${baseCourierName.replace(/\s/g, "")}_Batch_${timestamp}`;

            // 5. Safely prepare mutation variables
            const columnValues: any = {};
            if (parentOrderId) {
                columnValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER] = { item_ids: [String(parentOrderId)] };
            }

            columnValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER_LINE_ITEM] = { item_ids: selectedIdsArray.map((id) => String(id)) };
            if (baseSupplierId) {
                columnValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.SUPPLIER] = { item_ids: [String(baseSupplierId)] };
            }

            const shopDetails = await fetchShopDetails();

            const createRes: any = await monday.api(`mutation {
                create_item (
                    board_id: ${SUPPLIER_MANIFEST_BOARD_ID},
                    item_name: "${manifestName}",
                    column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                ) { id }
            }`);

            const newManifestId = createRes.data.create_item.id;

            // 6. Generate Manifest Document using the array containing ALL compiled items
            const manifestBlob = await generateManifestPDF({
                supplierName: baseSupplierName,
                courierName: baseCourierName,
                lineItems: compiledFullLineItems, // Passing entire list down to pdfGenerator
                shopDetails,
                manifestName,
            });

            const manifestFile = new File([manifestBlob], `${manifestName}_manifest.pdf`, { type: "application/pdf" });
            const labelBlob = await generateLabelPDF(compiledFullLineItems);

            const labelFile = new File([labelBlob], `${manifestName}_label.pdf`, { type: "application/pdf" });

            // 7. Upload binaries sequentially to respective board column mappings
            await monday.api(
                `mutation ($file: File!) {
                add_file_to_column (
                    item_id: ${newManifestId},
                    column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.MANIFEST_FILE}",
                    file: $file
                ) { id }
            }`,
                { variables: { file: manifestFile } },
            );

            await monday.api(
                `mutation ($file: File!) {
                add_file_to_column (
                    item_id: ${newManifestId},
                    column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.LABEL_FILE}",
                    file: $file
                ) { id }
            }`,
                { variables: { file: labelFile } },
            );

            // ── Shiprocket post-manifest flow ─────────────────────────────────────────
            const firstLineItem = filteredLineItems.find((li) => selectedLineItemIds.has(li.id));
            const courierId = firstLineItem?.courierId || "";
            console.log("[Manifest] Resolved courierId for SR flow:", courierId, "| from line item:", firstLineItem?.id);

            await runShiprocketFlow({
                shiprocketOrderId,
                shiprocketShipmentId,
                courierId,
                supplierName: baseSupplierName,
                supplierAddress: supplierData.address,
                supplierPhone: supplierData.phone,
                supplierEmail: supplierData.email,
                supplierPostalCode: supplierData.postalCode,
            });

            // ==========================================================
            // NEW STATUS & INTERBOARD RELATION UPDATES
            // ==========================================================

            // 1. Update status and link the created Manifest item on ALL selected Order Line Items
            const itemUpdatePromises = selectedIdsArray.map((itemId) => {
                const oliColumnValues = {
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Manifest Generated" },
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIERMANIFEST]: { item_ids: [String(newManifestId)] },
                };

                return monday.api(`mutation {
                    change_multiple_column_values(
                        item_id: ${itemId},
                        board_id: ${ORDER_ITEM_BOARD_ID},
                        column_values: "${JSON.stringify(oliColumnValues).replace(/"/g, '\\"')}"
                    ) { id }
                }`);
            });

            await Promise.all(itemUpdatePromises);

            // 2. Query all sibling line items under the parent Order to check if the complete batch is processed
            const parentOrderAuditRes: any = await monday.api(`query {
                boards(ids: ${ORDER_ITEM_BOARD_ID}) {
                    items_page(limit: 500) {
                        items {
                            id
                            column_values {
                                id
                                text
                                ... on BoardRelationValue { linked_item_ids }
                            }
                        }
                    }
                }
            }`);

            const allOliItems = parentOrderAuditRes.data?.boards?.[0]?.items_page?.items || [];

            // Filter down to elements explicitly linked to this specific parent Order
            const siblingLineItems = allOliItems.filter((li: any) => {
                const orderCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                const linkedId = orderCol?.linked_item_ids?.[0] || (orderCol?.value ? JSON.parse(orderCol.value)?.linkedPulseIds?.[0]?.linkedPulseId : null);
                return String(linkedId) === String(parentOrderId);
            });

            // Evaluate if all records have been marked as generated
            const areAllLineItemsGenerated = siblingLineItems.every((li: any) => {
                const statusCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS);
                return statusCol?.text === "Manifest Generated";
            });

            // 3. Conditionally promote the parent Order status if no unmanifested items remain
            if (areAllLineItemsGenerated && siblingLineItems.length > 0) {
                const orderColumnValues = {
                    [ORDER_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Manifest Generated" },
                };

                await monday.api(`mutation {
                    change_multiple_column_values(
                        item_id: ${parentOrderId},
                        board_id: ${ORDER_BOARD_ID},
                        column_values: "${JSON.stringify(orderColumnValues).replace(/"/g, '\\"')}"
                    ) { id }
                }`);
            }

            await refetch();

            showToast("Manifest and Label Uploaded Successfully!", "positive");
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            showToast("Manifest Generation Failed: " + e.message, "negative");
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return <Loader size={40} />;

    return (
        <div style={{ padding: "24px" }}>
            <Toast
                open={toast.open}
                type={toast.type}
                onClose={hideToast}
                autoHideDuration={4000}
                style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}
            >
                {toast.message}
            </Toast>
            {/* 1. TOP ROW: Heading and Action Button aligned perfectly */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                }}
            >
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Generate Supplier Manifests</h3>

                {/* Button Wrapper with Validation Text under the button */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                    <Button disabled={!batchValidation.isValid || isCreating} loading={isCreating} onClick={handleGenerateManifest}>
                        Generate Supplier Manifest ({selectedLineItemIds.size})
                    </Button>
                    <p
                        style={{
                            margin: 0,
                            fontSize: "12px",
                            fontWeight: 500,
                            color: batchValidation.isValid ? "#137333" : "#c5221f",
                            transition: "color 0.2s ease",
                        }}
                    >
                        {batchValidation.reason}
                    </p>
                </div>
            </div>

            {/* 2. DROPDOWN MENUS: Responsive Filter Layer */}
            <div
                style={{
                    display: "flex",
                    gap: "20px",
                    marginBottom: "25px",
                    position: "relative",
                    zIndex: 3,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ flex: "1 1 250px", minWidth: "200px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>Select Order:</label>
                    <Dropdown
                        options={orderOptions}
                        value={selectedOrder}
                        onChange={(val: any) => {
                            setSelectedOrder(val);
                            setSelectedSupplier(null);
                            setSelectedCourier(null);
                            setSelectedLineItemIds(new Set());
                        }}
                    />
                </div>
                <div style={{ flex: "1 1 250px", minWidth: "200px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>Select Supplier:</label>
                    <Dropdown
                        disabled={!selectedOrder}
                        options={supplierOptions}
                        value={selectedSupplier}
                        onChange={(val: any) => {
                            setSelectedSupplier(val);
                            setSelectedCourier(null);
                            setSelectedLineItemIds(new Set());
                        }}
                    />
                </div>
                <div style={{ flex: "1 1 250px", minWidth: "200px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>Select Courier:</label>
                    <Dropdown
                        disabled={!selectedOrder}
                        options={courierOptions}
                        value={selectedCourier}
                        onChange={(val: any) => {
                            setSelectedCourier(val);
                            setSelectedLineItemIds(new Set());
                        }}
                    />
                </div>
            </div>

            {/* 3. TABLE LAYER: OLI Table Container supporting dynamic horizontal scrolling */}
            <div
                style={{
                    overflowX: "auto",
                    overflowY: "auto", // FIX: Enables independent inner vertical scrolling
                    maxHeight: "380px", // FIX: Constrains the viewport size of your table rows
                    border: "1px solid #eee",
                    borderRadius: "4px",
                    marginBottom: "20px",
                }}
            >
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1000px" }}>
                    <thead style={{ backgroundColor: "#f1f3f5", position: "sticky", top: 0, zIndex: 2 }}>
                        <tr>
                            <th style={{ padding: "10px", width: "50px", textAlign: "center" }}>
                                <IndeterminateCheckbox
                                    checked={filteredLineItems.length > 0 && selectedLineItemIds.size === filteredLineItems.length}
                                    indeterminate={selectedLineItemIds.size > 0 && selectedLineItemIds.size < filteredLineItems.length}
                                    onChange={() => {
                                        if (selectedLineItemIds.size === filteredLineItems.length) {
                                            setSelectedLineItemIds(new Set());
                                        } else {
                                            setSelectedLineItemIds(new Set(filteredLineItems.map((i) => i.id)));
                                        }
                                    }}
                                />
                            </th>
                            <th style={{ padding: "10px", textAlign: "left", fontWeight: 600 }}>Item Name</th>
                            {MANIFEST_OLI_TABLE_COLUMNS.map((colId) => (
                                <th key={colId} style={{ padding: "10px", textAlign: "left", fontWeight: 600 }}>
                                    {boardColumns[colId] || colId}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLineItems.map((item: any) => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                                <td style={{ padding: "10px", textAlign: "center" }}>
                                    <Checkbox
                                        checked={selectedLineItemIds.has(item.id)}
                                        onChange={() => {
                                            const next = new Set(selectedLineItemIds);
                                            if (next.has(item.id)) next.delete(item.id);
                                            else next.add(item.id);
                                            setSelectedLineItemIds(next);
                                        }}
                                    />
                                </td>
                                <td style={{ padding: "10px", fontWeight: 500 }}>{item.name}</td>
                                {MANIFEST_OLI_TABLE_COLUMNS.map((colId) => {
                                    const col = item.column_values?.find((cv: any) => cv.id === colId);
                                    return (
                                        <td key={colId} style={{ padding: "10px" }}>
                                            {col?.display_value || col?.text || "-"}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {selectedOrder && filteredLineItems.length === 0 && (
                    <p style={{ padding: "20px", textAlign: "center", color: "#666" }}>No line items match the selected supplier filters.</p>
                )}
            </div>
        </div>
    );
};