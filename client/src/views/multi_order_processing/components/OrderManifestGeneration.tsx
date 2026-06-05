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
    SHIPMENTS_BOARD_ID,
    SHIPMENTS_ALL_COLUMN_IDS_MAP,
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

const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    textAlign: "center",
    fontWeight: 600,
    fontSize: 13,
    border: "1px solid #d0d4e0",
    whiteSpace: "nowrap",
    minWidth: 140,
    backgroundColor: "#f1f3f5",
    color: "#323338",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 16px",
    textAlign: "center",
    border: "1px solid #d0d4e0",
    whiteSpace: "nowrap",
    minWidth: 140,
    fontSize: 13,
};

export const OrderManifestGeneration = ({ selectedOrderIds, onPrev, onNext }: { selectedOrderIds: string[]; onPrev: () => void; onNext: () => void }) => {
    const { loading, ordersWithLineItems, boardColumns, refetch } = useCourierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();

    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [selectedCourier, setSelectedCourier] = useState<any>(null);
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isCreating, setIsUpdating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

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

        if (selectedSupplier) {
            items = items.filter((li: any) => {
                if (selectedSupplier.value === "none") return !li.supplierId;
                return li.supplierId === selectedSupplier.value;
            });
        }

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

        const selectedItems = filteredLineItems.filter((li) => selectedLineItemIds.has(li.id));

        const firstSupplierId = selectedItems[0]?.supplierId || "";
        const allSuppliersMatch = selectedItems.every((li) => (li.supplierId || "") === firstSupplierId);

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
    const formatDateTime = (date: Date): string => {
        const day = date.getDate();
        const month = date.toLocaleString("en-US", { month: "long" });
        const year = date.getFullYear();
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        const displayHour = hours % 12 || 12;
        return `${day} ${month} ${year} ${displayHour}:${minutes} ${ampm}`;
    };

    const runShiprocketFlow = async ({
        shiprocketOrderId,
        shiprocketShipmentId,
        courierId,
        courierName,
        orderName,
        supplierName,
        supplierAddress,
        supplierPhone,
        supplierEmail,
        supplierPostalCode,
        supplierCity,
        supplierState,
        supplierCountry,
        parentOrderId,
        orderItemId,
    }: {
        shiprocketOrderId: string;
        shiprocketShipmentId: string;
        courierId: string;
        courierName: string;
        orderName: string;
        supplierName: string;
        supplierAddress: string;
        supplierPhone: string;
        supplierEmail: string;
        supplierPostalCode: string;
        supplierCity: string;
        supplierState: string;
        supplierCountry: string;
        parentOrderId: string;
        orderItemId: string;
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
            supplierCity,
            supplierState,
            supplierCountry,
        });

        if (!shiprocketOrderId || !shiprocketShipmentId) {
            console.warn("[SR Flow] Missing shiprocketOrderId or shiprocketShipmentId — aborting flow.", { shiprocketOrderId, shiprocketShipmentId });
            showToast("Shiprocket Order ID or Shipment ID missing on order board — skipping Shiprocket flow.", "negative");
            return;
        }

        console.log("[SR Flow] STEP 1: Fetching all pickup locations from Shiprocket...");
        const pickupRes = await ShipRocketService.getPickupLocations();
        console.log("[SR Flow] STEP 1 Response (pickup locations):", JSON.stringify(pickupRes, null, 2));
        const allPickups: any[] = pickupRes?.data?.shipping_address || [];
        console.log("[SR Flow] STEP 1: Total pickup locations found:", allPickups.length);

        console.log("[SR Flow] STEP 2: Matching supplier address against pickup locations...");
        console.log("[SR Flow] STEP 2: Supplier:", { supplierPostalCode, supplierCity, supplierState, supplierCountry, supplierAddress });

        const normalize = (s: string) => (s || "").toLowerCase().trim();

        const matched = allPickups.find((p: any) => {
            const pinMatch = normalize(p.pin_code) === normalize(supplierPostalCode);
            const cityMatch = normalize(p.city) === normalize(supplierCity);
            const stateMatch = normalize(p.state) === normalize(supplierState);
            console.log(`[SR Flow] STEP 2: Checking "${p.pickup_location}" — pin:${pinMatch} city:${cityMatch} state:${stateMatch}`);
            return pinMatch && cityMatch && stateMatch;
        });

        console.log("[SR Flow] STEP 2: Matched pickup location:", matched ? matched.pickup_location : "NO MATCH — will create new");

        let pickupLocationName: string;

        if (matched) {
            pickupLocationName = matched.pickup_location;
            console.log("[SR Flow] STEP 2: Using existing pickup location:", pickupLocationName);
        } else {
            const rawAddr = supplierAddress || "";
            const address1 = rawAddr.length >= 10 ? rawAddr : rawAddr.padEnd(10, " ");
            const addPickupPayload = {
                pickup_location: supplierName,
                name: supplierName,
                email: supplierEmail || "noreply@example.com",
                phone: supplierPhone.replace(/\D/g, "").slice(-10),
                address: address1,
                address_2: "",
                city: supplierCity,
                state: supplierState,
                country: supplierCountry || "India",
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

        console.log("[SR Flow] STEP 4: Updating pickup location on Shiprocket order...", { shiprocketOrderId, pickupLocationName });
        const updatePickupRes = await ShipRocketService.updatePickupLocation(Number(shiprocketOrderId), pickupLocationName);
        console.log("[SR Flow] STEP 4 Response (update pickup location):", JSON.stringify(updatePickupRes, null, 2));

        console.log("[SR Flow] STEP 5: Assigning AWB...", { shiprocketShipmentId, courierId });
        const awbRes = await ShipRocketService.assignAWB(shiprocketShipmentId, courierId);
        console.log("[SR Flow] STEP 5 Response (assign AWB):", JSON.stringify(awbRes, null, 2));

        const awbCode: string = awbRes?.response?.data?.awb_code || awbRes?.data?.awb_code || awbRes?.awb_code || "";
        console.log("[AWB] STEP 5: Full awbRes:", JSON.stringify(awbRes, null, 2));
        console.log("[AWB] STEP 5: Extracted awbCode:", awbCode);
        console.log("[AWB] STEP 5: parentOrderId:", parentOrderId, "| ORDER_BOARD_ID:", ORDER_BOARD_ID);
        console.log("[AWB] STEP 5: AWB column ID:", ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID);

        if (awbCode) {
            try {
                const awbMutationResult: any = await monday.api(
                    `mutation {
                        change_simple_column_value(
                            item_id: ${parentOrderId},
                            board_id: ${ORDER_BOARD_ID},
                            column_id: "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID}",
                            value: "${awbCode}"
                        ) { id }
                    }`
                );
                console.log("[AWB] STEP 5a: mutation result:", JSON.stringify(awbMutationResult, null, 2));
                if (awbMutationResult?.errors) {
                    console.error("[AWB] STEP 5a: GraphQL errors:", JSON.stringify(awbMutationResult.errors, null, 2));
                }
            } catch (awbErr: any) {
                console.error("[AWB] STEP 5a: Exception during AWB update:", awbErr?.message, awbErr);
            }
        } else {
            console.warn("[AWB] STEP 5a: awbCode is empty — skipping AWB column update.");
        }

        const now = new Date();
        const nowFormatted = formatDateTime(now);
        const shipmentColumnValues: any = {
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Orders]: { item_ids: [String(parentOrderId)] },
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Assigned_Date]: nowFormatted,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Courier_Company_Id]: courierId,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Courier_Name]: courierName,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Shipper_Company_Name]: supplierName,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Shipper_Address]: supplierAddress,
        };
        const shipmentItemName = `Shipment - ${orderName}`;
        const createShipmentRes: any = await monday.api(`mutation {
            create_item(
                board_id: ${SHIPMENTS_BOARD_ID},
                item_name: "${shipmentItemName}",
                column_values: "${JSON.stringify(shipmentColumnValues).replace(/"/g, '\\"')}"
            ) { id }
        }`);
        const newShipmentItemId = createShipmentRes?.data?.create_item?.id;
        console.log("[SR Flow] STEP 5b: Shipment record created:", newShipmentItemId);

        console.log("[SR Flow] STEP 6: Generating pickup...", { shiprocketShipmentId });
        const generatePickupRes = await ShipRocketService.generatePickup(shiprocketShipmentId);
        console.log("[SR Flow] STEP 6 Response (generate pickup):", JSON.stringify(generatePickupRes, null, 2));

        if (newShipmentItemId) {
            const srData = generatePickupRes?.response ?? generatePickupRes;
            const rawScheduled: string = srData?.pickup_scheduled_date || "";
            const rawGenerated: string = srData?.pickup_generated_date?.date || srData?.pickup_generated_date || "";

            const pickupScheduledFormatted = rawScheduled ? formatDateTime(new Date(rawScheduled.replace(" ", "T"))) : nowFormatted;
            const pickupGeneratedFormatted = rawGenerated ? formatDateTime(new Date(rawGenerated.replace(" ", "T"))) : nowFormatted;

            console.log("[SR Flow] STEP 6a: Dates — scheduled:", pickupScheduledFormatted, "| generated:", pickupGeneratedFormatted);

            const pickupColPayload = JSON.stringify({
                [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Scheduled_Date]: pickupScheduledFormatted,
                [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Generated_Date]: pickupGeneratedFormatted,
            });
            await monday.api(`mutation {
                change_multiple_column_values(
                    item_id: ${newShipmentItemId},
                    board_id: ${SHIPMENTS_BOARD_ID},
                    column_values: "${pickupColPayload.replace(/"/g, '\\"')}"
                ) { id }
            }`);
            console.log("[SR Flow] STEP 6a: Pickup dates updated on shipment record.");
        }

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

            const parentOrderId: string = selectedOrder.value;

            const firstItemRaw = rawFetchedItems[0];
            const getFirstVal = (id: string) => firstItemRaw.column_values.find((cv: any) => cv.id === id);

            const baseSupplierId = getFirstVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.linked_item_ids?.[0];
            const baseSupplierName = getFirstVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.display_value || "N/A";
            const baseCourierName = getFirstVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME)?.text || "N/A";

            console.log("[Manifest] Line items fetched:", rawFetchedItems.length);
            console.log("[Manifest] parentOrderId (from dropdown):", parentOrderId, "| baseSupplierId:", baseSupplierId, "| baseSupplierName:", baseSupplierName, "| baseCourierName:", baseCourierName);

            const orderRes: any = await monday.api(`query {
                items(ids: [${parentOrderId}]) {
                    name
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

            let supplierData = { address: "", phone: "", email: "", postalCode: "", city: "", state: "", country: "India" };
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
                        city: getSuppCol(SUPPLIER_ALL_COLUMN_IDS_MAP.City)?.text || "",
                        state: getSuppCol(SUPPLIER_ALL_COLUMN_IDS_MAP.State)?.text || "",
                        country: getSuppCol(SUPPLIER_ALL_COLUMN_IDS_MAP.Country)?.text || "India",
                    };
                    console.log("[Manifest] Supplier data fetched:", supplierData);
                }
            }

            const productIdsToQuery = rawFetchedItems
                .map((item: any) => item.column_values.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT)?.linked_item_ids?.[0])
                .filter(Boolean);

            let productPriceMap: Record<string, number> = {};

            if (productIdsToQuery.length > 0) {
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

            const compiledFullLineItems = rawFetchedItems.map((item: any) => {
                const getItemVal = (id: string) => item.column_values.find((cv: any) => cv.id === id);

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

            const manifestBlob = await generateManifestPDF({
                supplierName: baseSupplierName,
                courierName: baseCourierName,
                lineItems: compiledFullLineItems,
                shopDetails,
                manifestName,
            });

            const manifestFile = new File([manifestBlob], `${manifestName}_manifest.pdf`, { type: "application/pdf" });
            const labelBlob = await generateLabelPDF(compiledFullLineItems);

            const labelFile = new File([labelBlob], `${manifestName}_label.pdf`, { type: "application/pdf" });

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

            const firstLineItem = filteredLineItems.find((li) => selectedLineItemIds.has(li.id));
            const courierId = firstLineItem?.courierId || "";
            console.log("[Manifest] Resolved courierId for SR flow:", courierId, "| from line item:", firstLineItem?.id);

            const orderName = order.name || String(parentOrderId);

            await runShiprocketFlow({
                shiprocketOrderId,
                shiprocketShipmentId,
                courierId,
                courierName: baseCourierName,
                orderName,
                supplierName: baseSupplierName,
                supplierAddress: supplierData.address,
                supplierPhone: supplierData.phone,
                supplierEmail: supplierData.email,
                supplierPostalCode: supplierData.postalCode,
                supplierCity: supplierData.city,
                supplierState: supplierData.state,
                supplierCountry: supplierData.country,
                parentOrderId: String(parentOrderId),
                orderItemId: String(firstLineItem?.id || selectedIdsArray[0]),
            });

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

            const siblingLineItems = allOliItems.filter((li: any) => {
                const orderCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                const linkedId = orderCol?.linked_item_ids?.[0] || (orderCol?.value ? JSON.parse(orderCol.value)?.linkedPulseIds?.[0]?.linkedPulseId : null);
                return String(linkedId) === String(parentOrderId);
            });

            const areAllLineItemsGenerated = siblingLineItems.every((li: any) => {
                const statusCol = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS);
                return statusCol?.text === "Manifest Generated";
            });

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
        <div>
            <Toast
                open={toast.open}
                type={toast.type}
                onClose={hideToast}
                autoHideDuration={4000}
                style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}
            >
                {toast.message}
            </Toast>

            {/* Header row — matches OrderSelection layout */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                }}
            >
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Generate Supplier Manifests</h3>

                {/* Button + validation text — right-aligned block */}
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

            {/* Dropdowns — matches OrderSelection toolbar style */}
            <div style={{ display: "flex", gap: 10, marginBottom: "16px", alignItems: "flex-end", flexWrap: "wrap", position: "relative", zIndex: 10 }}>
                <div style={{ flex: "1 1 200px", minWidth: "180px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Select Order:</label>
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
                <div style={{ flex: "1 1 200px", minWidth: "180px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Select Supplier:</label>
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
                <div style={{ flex: "1 1 200px", minWidth: "180px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Select Courier:</label>
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

            {/* Table — matches OrderSelection table structure */}
            <div style={{ overflowX: "auto", border: "1px solid #d0d4e0", borderRadius: 6 }}>
                <div style={{ overflowY: "auto", maxHeight: 420 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                        <thead style={{ backgroundColor: "#f1f3f5", position: "sticky", top: 0, zIndex: 5 }}>
                            <tr>
                                <th style={{ padding: "12px 16px", width: 50, border: "1px solid #d0d4e0", textAlign: "center", backgroundColor: "#f1f3f5" }}>
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
                                <th style={thStyle}>Item Name</th>
                                {MANIFEST_OLI_TABLE_COLUMNS.map((colId) => (
                                    <th key={colId} style={thStyle}>
                                        {boardColumns[colId] || colId}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody style={{ display: "table-row-group" }}>
                            {filteredLineItems.length > 0 ? filteredLineItems.map((item: any) => (
                                <tr key={item.id} style={{ backgroundColor: "#fff" }}>
                                    <td style={{ padding: "12px 16px", width: 50, textAlign: "center", border: "1px solid #d0d4e0", verticalAlign: "middle" }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedLineItemIds.has(item.id)}
                                            onChange={() => {
                                                const next = new Set(selectedLineItemIds);
                                                if (next.has(item.id)) next.delete(item.id);
                                                else next.add(item.id);
                                                setSelectedLineItemIds(next);
                                            }}
                                        />
                                    </td>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>{item.name}</td>
                                    {MANIFEST_OLI_TABLE_COLUMNS.map((colId) => {
                                        const col = item.column_values?.find((cv: any) => cv.id === colId);
                                        return (
                                            <td key={colId} style={tdStyle}>
                                                {col?.display_value || col?.text || "-"}
                                            </td>
                                        );
                                    })}
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={MANIFEST_OLI_TABLE_COLUMNS.length + 2} style={{ padding: "32px", textAlign: "center", color: "#676879", fontSize: 13, border: "1px solid #d0d4e0" }}>
                                        {selectedOrder ? "No line items match the selected filters." : "No items to display. Please select an order."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Inline confirm dialog for Finish & Reset */}
            {showConfirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#fff", borderRadius: 8, padding: "32px", maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
                        <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600, color: "#323338" }}>Finish &amp; Reset</h3>
                        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#676879" }}>Are you sure you want to finish and reset? This will clear all selected orders and return to the start.</p>
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

            {/* Bottom nav — matches OrderSelection bottom bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, paddingBottom: 24, borderTop: "1px solid #eee" }}>
                <button
                    onClick={onPrev}
                    style={{ padding: "10px 22px", borderRadius: 6, border: "1px solid #d0d4e0", background: "#fff", color: "#323338", cursor: "pointer", fontSize: 14, fontWeight: 500 }}
                >
                    ← Back to Couriers
                </button>
                <button
                    onClick={() => setShowConfirm(true)}
                    style={{ padding: "10px 22px", borderRadius: 6, background: "#0073ea", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, boxShadow: "0 2px 8px rgba(0,115,234,0.3)" }}
                >
                    Finish &amp; Reset →
                </button>
            </div>
        </div>
    );
};