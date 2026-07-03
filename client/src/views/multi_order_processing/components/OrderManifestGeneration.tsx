// src/views/multi_order_processing/components/OrderManifestGeneration.tsx
import React, { useState, useMemo } from "react";
import { Button, Loader, Toast, Dropdown } from "@vibe/core";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import { btn, TH, TD, filterBar, sectionTitle, paginationBtn, COLOR } from "../styles";
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

const thStyle = TH;
const tdStyle = TD;

export const OrderManifestGeneration = ({ selectedOrderIds, onPrev, onNext }: { selectedOrderIds: string[]; onPrev: () => void; onNext: () => void }) => {
    const { loading, lineItems: rawLineItems, refetch } = useCourierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();

    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isCreating, setIsCreating] = useState(false);
    const [isCreatingShipment, setIsCreatingShipment] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [groupErrors, setGroupErrors] = useState<{ group: string; step: string; error: string }[]>([]);
    const [shipmentErrors, setShipmentErrors] = useState<{ group: string; step: string; error: string }[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedOrderFilter, setSelectedOrderFilter] = useState<any>(null);
    const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<any>(null);
    const [selectedCourierFilter, setSelectedCourierFilter] = useState<any>(null);
    const [selectedSkuFilter, setSelectedSkuFilter] = useState<any>(null);

    // All line items — generated ones shown but disabled
    const allLineItems = useMemo(() => rawLineItems, [rawLineItems]);

    const isShipped = (item: any) => {
        const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.Shipped);
        return col?.text === "Yes";
    };

    const isManifested = (item: any) => {
        const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS);
        return col?.text === "Manifest Generated";
    };

    // Row is fully done (disabled) only when both shipment AND manifest are complete
    const isGenerated = (item: any) => isShipped(item) && isManifested(item);

    // Filter options
    const orderOptions = useMemo(() => {
        const map = new Map<string, string>();
        allLineItems.forEach((item) => {
            if (item.linkedOrderId && item.orderName) map.set(item.linkedOrderId, item.orderName);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
    }, [allLineItems]);

    const supplierOptions = useMemo(() => {
        const base = selectedOrderFilter
            ? allLineItems.filter((item) => item.linkedOrderId === selectedOrderFilter.value)
            : allLineItems;
        const map = new Map<string, string>();
        base.forEach((item) => {
            if (item.supplierId && item.supplierName) map.set(item.supplierId, item.supplierName);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
    }, [allLineItems, selectedOrderFilter]);

    const courierOptions = useMemo(() => {
        let base = allLineItems;
        if (selectedOrderFilter) base = base.filter((item) => item.linkedOrderId === selectedOrderFilter.value);
        if (selectedSupplierFilter) base = base.filter((item) => item.supplierId === selectedSupplierFilter.value);
        const map = new Map<string, string>();
        base.forEach((item) => {
            if (item.courierName) map.set(item.courierName, item.courierName);
        });
        return Array.from(map.entries()).map(([name, label]) => ({ value: name, label }));
    }, [allLineItems, selectedOrderFilter, selectedSupplierFilter]);

    const skuOptions = useMemo(() => {
        let base = allLineItems;
        if (selectedOrderFilter) base = base.filter((item) => item.linkedOrderId === selectedOrderFilter.value);
        if (selectedSupplierFilter) base = base.filter((item) => item.supplierId === selectedSupplierFilter.value);
        if (selectedCourierFilter) base = base.filter((item) => item.courierName === selectedCourierFilter.value);
        const skus = new Set<string>();
        base.forEach((item) => {
            const skuCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU);
            const sku = skuCol?.text?.trim();
            if (sku) skus.add(sku);
        });
        return Array.from(skus).map((s) => ({ value: s, label: s }));
    }, [allLineItems, selectedOrderFilter, selectedSupplierFilter, selectedCourierFilter]);

    // Filtered items
    const filteredLineItems = useMemo(() => {
        let items = allLineItems;
        if (selectedOrderFilter) items = items.filter((item) => item.linkedOrderId === selectedOrderFilter.value);
        if (selectedSupplierFilter) items = items.filter((item) => item.supplierId === selectedSupplierFilter.value);
        if (selectedCourierFilter) items = items.filter((item) => item.courierName === selectedCourierFilter.value);
        if (selectedSkuFilter) {
            items = items.filter((item) => {
                const skuCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU);
                return skuCol?.text?.trim() === selectedSkuFilter.value;
            });
        }
        return items;
    }, [allLineItems, selectedOrderFilter, selectedSupplierFilter, selectedCourierFilter, selectedSkuFilter]);

    const getSplitOrderId = (item: any): string => {
        const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
        return col?.linked_item_ids?.[0] || "";
    };

    const sortedFilteredLineItems = useMemo(() => [...filteredLineItems].sort((a: any, b: any) => {
        const oCmp = (a.orderName || a.linkedOrderId || "").localeCompare(b.orderName || b.linkedOrderId || "");
        if (oCmp !== 0) return oCmp;
        const aSplit = getSplitOrderId(a);
        const bSplit = getSplitOrderId(b);
        if (aSplit && !bSplit) return -1;
        if (!aSplit && bSplit) return 1;
        if (aSplit && bSplit) { const sCmp = aSplit.localeCompare(bSplit); if (sCmp !== 0) return sCmp; }
        return (a.name || "").localeCompare(b.name || "");
    }), [filteredLineItems]);

    const selectableItems = useMemo(() => sortedFilteredLineItems, [sortedFilteredLineItems]);
    const totalPages = Math.ceil(sortedFilteredLineItems.length / pageSize) || 1;
    const paginatedLineItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedFilteredLineItems.slice(start, start + pageSize);
    }, [sortedFilteredLineItems, currentPage, pageSize]);

    const orderColumn: { label: string; render: (li: any) => string } = {
        label: "Order",
        render: (li) => {
            const orderCol = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
            return orderCol?.display_value || orderCol?.text || li.orderId || "-";
        },
    };

    const otherColumns: { label: string; render: (li: any) => string }[] = [
        { label: "Supplier", render: (li) => li.supplierName || "-" },
        { label: "Courier", render: (li) => li.courierName || "-" },
        {
            label: "SKU",
            render: (li) => {
                const skuCol = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU);
                return skuCol?.text || "-";
            },
        },
        {
            label: "Weight",
            render: (li) => {
                const col = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCTWEIGHT);
                const raw = col?.display_value || col?.text || "";
                if (!raw) return "-";
                const n = parseFloat(raw);
                return !isNaN(n) ? String(n) : raw;
            },
        },
        {
            label: "COD",
            render: (li) => {
                const col = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COD_STATUS);
                return col?.text || "-";
            },
        },
        {
            label: "Shipped",
            render: (li) => {
                const col = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.Shipped);
                return col?.text || "No";
            },
        },
        {
            label: "Status",
            render: (li) => {
                const col = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS);
                return col?.text || "-";
            },
        },
        {
            label: "Shiprocket Response",
            render: (li) => {
                const col = li.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.shiprocket_Shipment_response);
                return col?.text || "-";
            },
        },
    ];

    const TABLE_COLS: { label: string; render: (li: any) => string }[] = [orderColumn, ...otherColumns];

    const { orderSpans, splitSpans } = useMemo(() => {
        const orderSpans: Record<string, number> = {};
        const splitSpans: Record<string, number> = {};
        let i = 0;
        while (i < paginatedLineItems.length) {
            const orderId = paginatedLineItems[i].linkedOrderId || orderColumn.render(paginatedLineItems[i]);
            let j = i;
            while (j < paginatedLineItems.length &&
                   (paginatedLineItems[j].linkedOrderId || orderColumn.render(paginatedLineItems[j])) === orderId) j++;
            orderSpans[paginatedLineItems[i].id] = j - i;
            for (let k = i + 1; k < j; k++) orderSpans[paginatedLineItems[k].id] = 0;
            let m = i;
            while (m < j) {
                const splitId = getSplitOrderId(paginatedLineItems[m]);
                if (splitId) {
                    let n = m;
                    while (n < j && getSplitOrderId(paginatedLineItems[n]) === splitId) n++;
                    splitSpans[paginatedLineItems[m].id] = n - m;
                    for (let k = m + 1; k < n; k++) splitSpans[paginatedLineItems[k].id] = 0;
                    m = n;
                } else {
                    splitSpans[paginatedLineItems[m].id] = 1;
                    m++;
                }
            }
            i = j;
        }
        return { orderSpans, splitSpans };
    }, [paginatedLineItems]);

    const shipmentValidation = useMemo(() => {
        if (selectedLineItemIds.size === 0) return { isValid: false, reason: "Select items to generate shipment." };
        const selectedItems = filteredLineItems.filter((item: any) => selectedLineItemIds.has(item.id));
        const alreadyShipped = selectedItems.filter((item: any) => isShipped(item));
        if (alreadyShipped.length > 0) return { isValid: false, reason: `${alreadyShipped.length} selected item(s) already have shipment generated.` };
        const missingCourier = selectedItems.filter((item: any) => {
            const namCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME);
            const idCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID);
            return !namCol?.text?.trim() && !idCol?.text?.trim();
        });
        if (missingCourier.length > 0) return { isValid: false, reason: `Courier missing for ${missingCourier.length} item(s)` };
        return { isValid: true, reason: `Ready to create shipment for ${selectedLineItemIds.size} item(s).` };
    }, [selectedLineItemIds, filteredLineItems]);

    const manifestValidation = useMemo(() => {
        if (selectedLineItemIds.size === 0) return { isValid: false, reason: "Select shipped items to generate manifest." };
        const selectedItems = filteredLineItems.filter((item: any) => selectedLineItemIds.has(item.id));
        const notShipped = selectedItems.filter((item: any) => !isShipped(item));
        if (notShipped.length > 0) return { isValid: false, reason: `${notShipped.length} item(s) not shipped yet — generate shipment first.` };
        const missingSupplier = selectedItems.filter((item: any) => {
            const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
            return !col?.display_value?.trim() && !col?.text?.trim();
        });
        if (missingSupplier.length > 0) return { isValid: false, reason: `Supplier not selected for ${missingSupplier.length} item(s)` };
        return { isValid: true, reason: `Ready to generate manifest for ${selectedLineItemIds.size} item(s).` };
    }, [selectedLineItemIds, filteredLineItems]);

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
        console.log("[SR] ── START runShiprocketFlow ──────────────────────────────");
        console.log("[SR] Inputs:", { shiprocketOrderId, shiprocketShipmentId, courierId, courierName, orderName, supplierName, parentOrderId });
        console.log("[SR] supplierData:", JSON.stringify(supplierData));

        if (!shiprocketOrderId || !shiprocketShipmentId) {
            throw new Error(`Shiprocket Order ID or Shipment ID missing for order "${orderName}".`);
        }

        // ── 1. Assign AWB ─────────────────────────────────────────────────
        console.log("[SR] STEP 1: Assigning AWB — shiprocketShipmentId:", shiprocketShipmentId, "courierId:", courierId);
        let awbRes: any;
        try {
            awbRes = await ShipRocketService.assignAWB(shiprocketShipmentId, courierId);
            console.log("[SR] STEP 1: assignAWB full response:", JSON.stringify(awbRes));
        } catch (e: any) {
            console.error("[SR] STEP 1 FAILED: assignAWB threw:", e?.message, e);
            throw new Error(`assignAWB failed: ${e?.message}`);
        }

        const awbCode: string = awbRes?.response?.data?.awb_code || awbRes?.data?.awb_code || awbRes?.awb_code || "";
        console.log("[SR] STEP 1: AWB code extracted:", awbCode || "EMPTY — check response paths above");

        // Check for AWB assignment error in response body
        const awbError =
            awbRes?.response?.data?.awb_assign_error ||
            awbRes?.data?.awb_assign_error ||
            awbRes?.awb_assign_error ||
            (!awbCode ? "AWB assignment failed — no awb_code in response" : null);
        if (awbError) {
            throw new Error(`assignAWB failed: ${awbError}`);
        }

        // ── 2. Write AWB code back to Monday order ─────────────────────────
        if (awbCode) {
            console.log("[SR] STEP 2: Writing AWB to Monday — item:", parentOrderId, "column:", ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID);
            try {
                const awbJsonValue = JSON.stringify(awbCode);
                const awbRes2: any = await monday.api(`mutation {
                    change_simple_column_value(
                        item_id: ${parentOrderId}, board_id: ${ORDER_BOARD_ID},
                        column_id: "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID}", value: ${awbJsonValue}
                    ) { id }
                }`);
                if (awbRes2?.errors) {
                    console.warn("[SR] STEP 2: AWB write GraphQL error:", JSON.stringify(awbRes2.errors));
                } else {
                    console.log("[SR] STEP 2: AWB written successfully to Monday.");
                }
            } catch (e: any) {
                console.warn("[SR] STEP 2: AWB write failed (non-fatal):", e?.message);
            }
        } else {
            console.warn("[SR] STEP 2: Skipping AWB write — awbCode is empty.");
        }

        // ── 3. Create Monday Shipment board item ──────────────────────────
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
        console.log("[SR] STEP 3: Creating Monday shipment item — board:", SHIPMENTS_BOARD_ID, "name:", `Shipment - ${orderName}`);
        console.log("[SR] STEP 3: Shipment column values:", JSON.stringify(shipCV));
        let newShipmentItemId: string | undefined;
        try {
            const createShipRes: any = await monday.api(`mutation {
                create_item(board_id: ${SHIPMENTS_BOARD_ID}, item_name: "Shipment - ${orderName}",
                    column_values: "${JSON.stringify(shipCV).replace(/"/g, '\\"')}") { id }
            }`);
            console.log("[SR] STEP 3: create_item response:", JSON.stringify(createShipRes));
            newShipmentItemId = createShipRes?.data?.create_item?.id;
            if (!newShipmentItemId) {
                console.error("[SR] STEP 3: create_item returned no ID — errors:", JSON.stringify(createShipRes?.errors));
            } else {
                console.log("[SR] STEP 3: Monday shipment item created — ID:", newShipmentItemId);
            }
        } catch (e: any) {
            console.error("[SR] STEP 3 FAILED: create shipment item threw:", e?.message, e);
            throw new Error(`Create Monday shipment item failed: ${e?.message}`);
        }

        // ── 4. Generate pickup on Shiprocket ──────────────────────────────
        console.log("[SR] STEP 4: Generating Shiprocket pickup — shiprocketShipmentId:", shiprocketShipmentId);
        let genRes: any;
        try {
            genRes = await ShipRocketService.generatePickup(shiprocketShipmentId);
            console.log("[SR] STEP 4: generatePickup full response:", JSON.stringify(genRes));
        } catch (e: any) {
            console.error("[SR] STEP 4 FAILED: generatePickup threw:", e?.message, e);
            throw new Error(`generatePickup failed: ${e?.message}`);
        }

        // ── 5. Update pickup dates on Monday shipment item ────────────────
        if (newShipmentItemId) {
            const srData = genRes?.response ?? genRes;
            const rawSched: string = srData?.pickup_scheduled_date || "";
            const rawGen: string = srData?.pickup_generated_date?.date || srData?.pickup_generated_date || "";
            console.log("[SR] STEP 5: Updating pickup dates — scheduled:", rawSched, "generated:", rawGen);
            try {
                const pickupColPayload = JSON.stringify({
                    [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Scheduled_Date]: rawSched ? formatDateTime(new Date(rawSched.replace(" ", "T"))) : nowFmt,
                    [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Generated_Date]: rawGen ? formatDateTime(new Date(rawGen.replace(" ", "T"))) : nowFmt,
                });
                const updateDatesRes: any = await monday.api(`mutation {
                    change_multiple_column_values(item_id: ${newShipmentItemId}, board_id: ${SHIPMENTS_BOARD_ID},
                        column_values: "${pickupColPayload.replace(/"/g, '\\"')}") { id }
                }`);
                if (updateDatesRes?.errors) {
                    console.warn("[SR] STEP 5: Pickup dates update GraphQL error:", JSON.stringify(updateDatesRes.errors));
                } else {
                    console.log("[SR] STEP 5: Pickup dates updated successfully.");
                }
            } catch (e: any) {
                console.warn("[SR] STEP 5: Pickup dates update failed (non-fatal):", e?.message);
            }
        } else {
            console.warn("[SR] STEP 5: Skipping pickup dates update — no shipment item ID.");
        }

        console.log("[SR] ── END runShiprocketFlow — SUCCESS ──────────────────────");
        return { awbCode };
    };

    const generateMergedLabelPDF = async (items: any[]): Promise<Blob> => {
        return generateLabelPDF(items);
    };

    const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9_(). \-]/g, "").trim();

    const handleGenerateShipment = async () => {
        if (!shipmentValidation.isValid) return;
        setIsCreatingShipment(true);
        setShipmentErrors([]);
        const collectedErrors: { group: string; step: string; error: string }[] = [];
        try {
            const selectedItems = filteredLineItems.filter((item: any) => selectedLineItemIds.has(item.id));
            const getVal = (item: any, id: string) => item.column_values?.find((cv: any) => cv.id === id);
            const getLinkedId = (col: any): string => {
                if (col?.linked_item_ids?.[0]) return String(col.linked_item_ids[0]);
                try { const p = JSON.parse(col?.value || "{}"); return String(p?.linkedPulseIds?.[0]?.linkedPulseId || ""); } catch { return ""; }
            };

            // Collect split order IDs
            const splitOrderIdMap: Record<string, string> = {};
            selectedItems.forEach((item: any) => {
                const id = getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS));
                if (id) splitOrderIdMap[item.id] = id;
            });
            const uniqueSplitIds = [...new Set(Object.keys(splitOrderIdMap).map((k) => splitOrderIdMap[k]))];

            // Fetch SR IDs for split orders
            const splitSRMap: Record<string, { srOrderId: string; srShipmentId: string }> = {};
            if (uniqueSplitIds.length > 0) {
                const res: any = await monday.api(`query {
                    items(ids: [${uniqueSplitIds.join(",")}]) {
                        id
                        column_values(ids: ["${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID}", "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}"]) { id text }
                    }
                }`);
                (res.data?.items || []).forEach((so: any) => {
                    splitSRMap[so.id] = {
                        srOrderId: so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "",
                        srShipmentId: so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "",
                    };
                });
            }

            // Fetch SR IDs for parent orders (non-split)
            const uniqueParentIds = [...new Set(selectedItems.map((i: any) => i.linkedOrderId).filter(Boolean))];
            const parentSRMap: Record<string, { srOrderId: string; srShipmentId: string; name: string }> = {};
            if (uniqueParentIds.length > 0) {
                const res: any = await monday.api(`query {
                    items(ids: [${uniqueParentIds.join(",")}]) {
                        id name
                        column_values(ids: ["${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID}", "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}"]) { id text }
                    }
                }`);
                (res.data?.items || []).forEach((o: any) => {
                    parentSRMap[o.id] = {
                        srOrderId: o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "",
                        srShipmentId: o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "",
                        name: o.name,
                    };
                });
            }

            // Fetch supplier data
            const supplierIds = [...new Set(selectedItems.map((i: any) => i.supplierId).filter(Boolean))];
            const supplierDataMap: Record<string, any> = {};
            if (supplierIds.length > 0) {
                const res: any = await monday.api(`query {
                    items(ids: [${supplierIds.join(",")}]) {
                        id column_values { id text value }
                    }
                }`);
                (res.data?.items || []).forEach((s: any) => {
                    const gc = (id: string) => s.column_values.find((cv: any) => cv.id === id);
                    supplierDataMap[s.id] = {
                        address: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.ADDRESS)?.text || "",
                        phone: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
                        email: gc(SUPPLIER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "",
                    };
                });
            }

            // Group by groupKey
            const groups: Record<string, any[]> = {};
            selectedItems.forEach((item: any) => {
                const splitOrderId = splitOrderIdMap[item.id] || "";
                const courierId = (getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID)?.text || "").trim();
                const courierName = getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME)?.text || "";
                const courierKey = courierId || courierName.trim();
                const groupKey = splitOrderId
                    ? `split__${splitOrderId}__${courierKey}`
                    : `order__${item.linkedOrderId}__${item.supplierId}__${courierKey}`;
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push({ ...item, splitOrderId, courierId, courierName });
            });

            // Run Shiprocket per group
            for (const groupItems of Object.keys(groups).map((k) => groups[k])) {
                const first = groupItems[0];
                const splitSR = first.splitOrderId ? splitSRMap[first.splitOrderId] : null;
                const parentSR = parentSRMap[first.linkedOrderId];
                const srOrderId = splitSR ? splitSR.srOrderId : (parentSR?.srOrderId || "");
                const srShipmentId = splitSR ? splitSR.srShipmentId : (parentSR?.srShipmentId || "");
                const supplierData = supplierDataMap[first.supplierId] || {};
                const groupLabel = `${first.supplierName || "-"} / ${first.courierName || "-"}`;
                const monitorId = first.splitOrderId || first.linkedOrderId;

                try {
                    const srResult = await runShiprocketFlow(srOrderId, srShipmentId, first.courierId, first.courierName,
                        first.orderName || first.linkedOrderId, supplierData, first.supplierName || "", monitorId);
                    const successMsg = srResult?.awbCode
                        ? `Shipment created successfully. AWB: ${srResult.awbCode}`
                        : "Shipment created successfully.";
                    // Mark line items shipped + write success response
                    await Promise.all(groupItems.map((item: any) => {
                        const cv = JSON.stringify({ [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.Shipped]: { label: "Yes" } }).replace(/"/g, '\\"');
                        return monday.api(`mutation { change_multiple_column_values(item_id: ${item.id}, board_id: ${ORDER_ITEM_BOARD_ID}, column_values: "${cv}") { id } }`);
                    }));
                    await Promise.all(groupItems.map((item: any) =>
                        monday.api(`mutation {
                            change_simple_column_value(item_id: ${item.id}, board_id: ${ORDER_ITEM_BOARD_ID},
                                column_id: "${ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.shiprocket_Shipment_response}",
                                value: ${JSON.stringify(JSON.stringify(successMsg))}) { id }
                        }`)
                    ));
                    // Update split order status to Shipped
                    if (first.splitOrderId) {
                        const splitCV = JSON.stringify({ [ORDER_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Shipped" } }).replace(/"/g, '\\"');
                        await monday.api(`mutation { change_multiple_column_values(item_id: ${first.splitOrderId}, board_id: ${ORDER_BOARD_ID}, column_values: "${splitCV}") { id } }`);
                    }
                } catch (e: any) {
                    collectedErrors.push({ group: groupLabel, step: "Shipment Creation (Shiprocket)", error: e.message });
                    await Promise.all(groupItems.map((item: any) => {
                        const cv = JSON.stringify({ [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.Shipped]: { label: "No" } }).replace(/"/g, '\\"');
                        return monday.api(`mutation { change_multiple_column_values(item_id: ${item.id}, board_id: ${ORDER_ITEM_BOARD_ID}, column_values: "${cv}") { id } }`);
                    }));
                    await Promise.all(groupItems.map((item: any) =>
                        monday.api(`mutation {
                            change_simple_column_value(item_id: ${item.id}, board_id: ${ORDER_ITEM_BOARD_ID},
                                column_id: "${ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.shiprocket_Shipment_response}",
                                value: ${JSON.stringify(JSON.stringify(e.message))}) { id }
                        }`)
                    ));
                }
            }

            await refetch();
            setShipmentErrors(collectedErrors);
            const total = Object.keys(groups).length;
            const failed = collectedErrors.length;
            if (failed === 0) {
                showToast(`Shipment created successfully for all ${total} group(s)!`, "positive");
            } else {
                showToast(`${total - failed} shipment(s) created, ${failed} failed. See details below.`, "negative");
            }
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            showToast("Shipment generation failed: " + e.message, "negative");
        } finally {
            setIsCreatingShipment(false);
        }
    };

    const handleGenerateManifest = async () => {
        if (selectedLineItemIds.size === 0) return;

        // Validate supplier and courier on every selected item before proceeding
        const selectedItems = filteredLineItems.filter((item: any) => selectedLineItemIds.has(item.id));
        const missingSupplier = selectedItems.filter((item: any) => {
            const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
            return !col?.display_value?.trim() && !col?.text?.trim();
        });
        const missingCourier = selectedItems.filter((item: any) => {
            const namCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME);
            const idCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID);
            return !namCol?.text?.trim() && !idCol?.text?.trim();
        });
        if (missingSupplier.length > 0 || missingCourier.length > 0) {
            const parts: string[] = [];
            if (missingSupplier.length > 0) parts.push(`Supplier not selected for: ${missingSupplier.map((i: any) => i.name).join(", ")}`);
            if (missingCourier.length > 0) parts.push(`Courier not selected for: ${missingCourier.map((i: any) => i.name).join(", ")}`);
            showToast(parts.join(" | "), "negative");
            return;
        }

        setIsCreating(true);
        setGroupErrors([]);
        const collectedErrors: { group: string; step: string; error: string }[] = [];
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

            // 2b. Collect split order IDs from line items and fetch their SR IDs
            const splitOrderIdMap: Record<string, string> = {};
            rawItems.forEach((item: any) => {
                const splitCol = getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
                const splitId = getLinkedId(splitCol);
                if (splitId) splitOrderIdMap[item.id] = splitId;
                console.log(`[Manifest] STEP 2b: Item "${item.name}" (${item.id}) -> splitOrderId: ${splitId || "NONE"}`);
            });
            const uniqueSplitOrderIds = [...new Set(Object.values(splitOrderIdMap).filter(Boolean))];
            console.log("[Manifest] STEP 2b: Unique split order IDs:", uniqueSplitOrderIds);

            const splitOrderSRMap: Record<string, { srOrderId: string; srShipmentId: string; srAwbId: string; name: string }> = {};
            if (uniqueSplitOrderIds.length > 0) {
                const splitOrderRes: any = await monday.api(`query {
                    items(ids: [${uniqueSplitOrderIds.join(",")}]) {
                        id name
                        column_values(ids: [
                            "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID}",
                            "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}",
                            "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID}"
                        ]) { id text }
                    }
                }`);
                (splitOrderRes.data?.items || []).forEach((so: any) => {
                    const srOrderId = so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "";
                    const srShipmentId = so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "";
                    const srAwbId = so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID)?.text || "";
                    splitOrderSRMap[so.id] = { srOrderId, srShipmentId, srAwbId, name: so.name };
                });
                console.log("[Manifest] STEP 2b: Split order SR map:", splitOrderSRMap);
            }

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

                const splitOrderId = splitOrderIdMap[item.id] || "";
                const splitSR = splitOrderId ? splitOrderSRMap[splitOrderId] : null;
                const srOrderId = splitSR ? splitSR.srOrderId : (getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "");
                const srShipmentId = splitSR ? splitSR.srShipmentId : (getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "");
                const awbCode = splitSR ? splitSR.srAwbId : (getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID)?.text || "");

                const courierKey = courierId || courierName.trim();
                // Split orders: one group per split order (same Shiprocket order/shipment).
                // Non-split: one group per parent order + supplier + courier.
                const groupKey = splitOrderId
                    ? `split__${splitOrderId}__${courierKey}`
                    : `order__${parentOrderId}__${supplierId}__${courierKey}`;

                console.log(`[Manifest] STEP 7: Item "${item.name}" parentOrderId=${parentOrderId} splitOrderId=${splitOrderId || "NONE"} supplierId=${supplierId} courierId=${courierId} groupKey=${groupKey} srOrderId=${srOrderId}`);

                return {
                    ...item,
                    parentOrderId,
                    splitOrderId,
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
                    shiprocketOrderId: srOrderId,
                    shiprocketShipmentId: srShipmentId,
                    awbCode,
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
            const ts = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;

            for (const [groupKey, groupItems] of Object.entries(groups)) {
                const first = groupItems[0];
                const supplierName = first.supplierName;
                const courierName = first.courierName;
                const groupLabel = `${supplierName} / ${courierName}`;
                const manifestName = sanitizeFilename(`${supplierName}_${courierName}_(${ts})`);

                let newManifestId: string | null = null;

                // ── Step A: Create manifest board item ──────────────────────
                try {
                    const supplierId = first.supplierId;
                    const groupParentOrderIds = [...new Set(groupItems.map((i) => i.parentOrderId).filter(Boolean))];
                    const manifestColValues: any = {
                        [SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER_LINE_ITEM]: { item_ids: groupItems.map((i) => String(i.id)) },
                    };
                    if (groupParentOrderIds.length > 0) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER] = { item_ids: groupParentOrderIds.map(String) };
                    if (supplierId) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.SUPPLIER] = { item_ids: [String(supplierId)] };
                    const supplierEmail = first.supplierEmail || "";
                    if (supplierEmail) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.Supplier_Email] = { email: supplierEmail, text: supplierEmail };
                    const createRes: any = await monday.api(`mutation {
                        create_item(board_id: ${SUPPLIER_MANIFEST_BOARD_ID}, item_name: "${manifestName}",
                            column_values: "${JSON.stringify(manifestColValues).replace(/"/g, '\\"')}") { id }
                    }`);
                    newManifestId = createRes.data.create_item.id;
                } catch (e: any) {
                    collectedErrors.push({ group: groupLabel, step: "Create Manifest Record", error: e.message });
                    continue; // can't proceed without manifest ID
                }

                // ── Step B: Generate & upload manifest PDF ───────────────────
                try {
                    const manifestBlob = await generateManifestPDF({ supplierName, courierName, lineItems: groupItems, shopDetails: { ...shopDetails, supplierAddress: first.supplierData?.address || "" }, manifestName });
                    const manifestFile = new File([manifestBlob], `${manifestName}_Manifest.pdf`, { type: "application/pdf" });
                    await monday.api(
                        `mutation ($file: File!) { add_file_to_column(item_id: ${newManifestId}, column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.MANIFEST_FILE}", file: $file) { id } }`,
                        { variables: { file: manifestFile } }
                    );
                } catch (e: any) {
                    collectedErrors.push({ group: groupLabel, step: "Manifest PDF Upload", error: e.message });
                }

                // ── Step C: Generate & upload label PDF ──────────────────────
                try {
                    const mergedLabelBlob = await generateMergedLabelPDF(groupItems);
                    const labelFile = new File([mergedLabelBlob], `${manifestName}_Label.pdf`, { type: "application/pdf" });
                    await monday.api(
                        `mutation ($file: File!) { add_file_to_column(item_id: ${newManifestId}, column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.LABEL_FILE}", file: $file) { id } }`,
                        { variables: { file: labelFile } }
                    );
                } catch (e: any) {
                    collectedErrors.push({ group: groupLabel, step: "Label PDF Upload", error: e.message });
                }

                // ── Step D: Update line item statuses ───────────────────────
                try {
                    await Promise.all(groupItems.map(async (item) => {
                        const oliCV: any = {
                            [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Manifest Generated" },
                            [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIERMANIFEST]: { item_ids: [String(newManifestId)] },
                        };
                        const escapedCV = JSON.stringify(oliCV).replace(/"/g, '\\"');
                        const updateRes: any = await monday.api(`mutation {
                            change_multiple_column_values(item_id: ${item.id}, board_id: ${ORDER_ITEM_BOARD_ID},
                                column_values: "${escapedCV}") { id }
                        }`);
                        if (updateRes?.errors) {
                            throw new Error(`Item "${item.name}": ${updateRes.errors.map((e: any) => e.message).join(", ")}`);
                        }
                    }));
                } catch (e: any) {
                    collectedErrors.push({ group: groupLabel, step: "Line Item Status Update", error: e.message });
                }

                // ── Step E: Update split order Order_Type in Orders board ────
                if (first.splitOrderId) {
                    try {
                        const splitStatusCV = JSON.stringify({
                            [ORDER_ALL_COLUMN_IDS_MAP.Order_Type]: { label: "Order" },
                        }).replace(/"/g, '\\"');
                        await monday.api(`mutation {
                            change_multiple_column_values(
                                item_id: ${first.splitOrderId},
                                board_id: ${ORDER_BOARD_ID},
                                column_values: "${splitStatusCV}"
                            ) { id }
                        }`);
                    } catch (e: any) {
                        collectedErrors.push({ group: groupLabel, step: "Split Order Type Update", error: e.message });
                    }
                }

                // ── Step F: Update parent order status if all siblings done ──
                try {
                    for (const parentId of [...new Set(groupItems.map((i) => i.parentOrderId))]) {
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
                        const allManifested = siblings.length > 0 && siblings.every((li: any) =>
                            li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS)?.text === "Manifest Generated"
                        );
                        const allShipped = siblings.length > 0 && siblings.every((li: any) =>
                            li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.Shipped)?.text === "Yes"
                        );
                        const newOrderStatus = allShipped ? "Shipped" : allManifested ? "Manifest Generated" : null;
                        if (newOrderStatus) {
                            await monday.api(`mutation {
                                change_multiple_column_values(item_id: ${parentId}, board_id: ${ORDER_BOARD_ID},
                                    column_values: "${JSON.stringify({ [ORDER_ALL_COLUMN_IDS_MAP.STATUS]: { label: newOrderStatus } }).replace(/"/g, '\\"')}") { id }
                            }`);
                        }
                    }
                } catch (e: any) {
                    collectedErrors.push({ group: groupLabel, step: "Parent Order Status Update", error: e.message });
                }
            }

            await refetch();
            setGroupErrors(collectedErrors);
            if (collectedErrors.length === 0) {
                showToast("Manifests and Labels generated successfully!", "positive");
            } else {
                showToast(`Completed with ${collectedErrors.length} error(s). See details below.`, "negative");
            }
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            showToast("Manifest Generation Failed: " + e.message, "negative");
        } finally {
            setIsCreating(false);
        }
    };

    if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}><Loader size={40} /></div>;

    return (
        <div style={{ padding: "24px" }}>
            <Toast open={toast.open} type={toast.type} onClose={hideToast} autoHideDuration={4000} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
                {toast.message}
            </Toast>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                <h3 style={sectionTitle}>Generate Supplier Manifests</h3>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    {/* Generate Shipment */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <Button
                            kind="secondary"
                            disabled={!shipmentValidation.isValid || isCreatingShipment || isCreating}
                            loading={isCreatingShipment}
                            onClick={handleGenerateShipment}
                        >
                            🚚 Generate Shipment ({selectedLineItemIds.size})
                        </Button>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: shipmentValidation.isValid ? COLOR.success : COLOR.danger }}>
                            {shipmentValidation.reason}
                        </p>
                    </div>
                    {/* Generate Manifest & Label */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <Button
                            disabled={!manifestValidation.isValid || isCreating || isCreatingShipment}
                            loading={isCreating}
                            onClick={handleGenerateManifest}
                        >
                            📄 Generate Manifest & Label ({selectedLineItemIds.size})
                        </Button>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: manifestValidation.isValid ? COLOR.success : COLOR.danger }}>
                            {manifestValidation.reason}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filter panel */}
            <div style={filterBar}>
                <div style={{ flex: "1 1 180px", minWidth: "160px" }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Order</label>
                    <Dropdown
                        placeholder="All Orders"
                        options={orderOptions}
                        value={selectedOrderFilter}
                        onChange={(val: any) => { 
                            setSelectedOrderFilter(val); 
                            setSelectedSupplierFilter(null); 
                            setSelectedCourierFilter(null); 
                            setSelectedSkuFilter(null); 
                            setSelectedLineItemIds(new Set()); 
                            setCurrentPage(1); 
                        }}
                    />
                </div>
                <div style={{ flex: "1 1 180px", minWidth: "160px" }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Supplier</label>
                    <Dropdown
                        placeholder="All Suppliers"
                        options={supplierOptions}
                        value={selectedSupplierFilter}
                        onChange={(val: any) => { 
                            setSelectedSupplierFilter(val); 
                            setSelectedCourierFilter(null); 
                            setSelectedSkuFilter(null); 
                            setSelectedLineItemIds(new Set()); 
                            setCurrentPage(1); 
                        }}
                    />
                </div>
                <div style={{ flex: "1 1 180px", minWidth: "160px" }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Courier</label>
                    <Dropdown
                        placeholder="All Couriers"
                        options={courierOptions}
                        value={selectedCourierFilter}
                        onChange={(val: any) => { 
                            setSelectedCourierFilter(val); 
                            setSelectedSkuFilter(null); 
                            setSelectedLineItemIds(new Set()); 
                            setCurrentPage(1); 
                        }}
                    />
                </div>
                <div style={{ flex: "1 1 160px", minWidth: "140px" }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>SKU</label>
                    <Dropdown
                        placeholder="All SKUs"
                        options={skuOptions}
                        value={selectedSkuFilter}
                        onChange={(val: any) => { 
                            setSelectedSkuFilter(val); 
                            setSelectedLineItemIds(new Set()); 
                            setCurrentPage(1); 
                        }}
                    />
                </div>
                {(selectedOrderFilter || selectedSupplierFilter || selectedCourierFilter || selectedSkuFilter) && (
                    <button
                        onClick={() => { 
                            setSelectedOrderFilter(null); 
                            setSelectedSupplierFilter(null); 
                            setSelectedCourierFilter(null); 
                            setSelectedSkuFilter(null); 
                            setSelectedLineItemIds(new Set()); 
                            setCurrentPage(1); 
                        }}
                        style={{ ...btn("ghost"), alignSelf: "flex-end", marginBottom: 2 }}
                    >
                        ✕ Clear
                    </button>
                )}
            </div>

            {/* Shipment Error Panel */}
            {shipmentErrors.length > 0 && (
                <div style={{ background: "#fffaf0", border: "1px solid #f0c040", borderRadius: 6, padding: "16px", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#b8860b" }}>🚚 {shipmentErrors.length} error(s) occurred during shipment creation</span>
                        <button onClick={() => setShipmentErrors([])} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#888", lineHeight: 1 }}>✕</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: "#fef9e7" }}>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #f0c040", fontWeight: 600, color: "#323338" }}>Group (Supplier / Courier)</th>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #f0c040", fontWeight: 600, color: "#323338" }}>Step</th>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #f0c040", fontWeight: 600, color: "#323338" }}>Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shipmentErrors.map((err, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fffaf0" }}>
                                    <td style={{ padding: "8px 12px", border: "1px solid #f0c040", color: "#323338" }}>{err.group}</td>
                                    <td style={{ padding: "8px 12px", border: "1px solid #f0c040", color: "#676879", whiteSpace: "nowrap" }}>{err.step}</td>
                                    <td style={{ padding: "8px 12px", border: "1px solid #f0c040", color: "#b8860b", wordBreak: "break-word", maxWidth: 400 }}>{err.error}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Manifest Error Panel */}
            {groupErrors.length > 0 && (
                <div style={{ background: "#fff8f8", border: "1px solid #f5c2c2", borderRadius: 6, padding: "16px", marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#c0392b" }}>📄 {groupErrors.length} error(s) occurred during manifest generation</span>
                        <button onClick={() => setGroupErrors([])} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#888", lineHeight: 1 }}>✕</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: "#fdecea" }}>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #f5c2c2", fontWeight: 600, color: "#323338" }}>Group (Supplier / Courier)</th>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #f5c2c2", fontWeight: 600, color: "#323338" }}>Step</th>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid #f5c2c2", fontWeight: 600, color: "#323338" }}>Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupErrors.map((err, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fff8f8" }}>
                                    <td style={{ padding: "8px 12px", border: "1px solid #f5c2c2", color: "#323338" }}>{err.group}</td>
                                    <td style={{ padding: "8px 12px", border: "1px solid #f5c2c2", color: "#676879", whiteSpace: "nowrap" }}>{err.step}</td>
                                    <td style={{ padding: "8px 12px", border: "1px solid #f5c2c2", color: "#c0392b", wordBreak: "break-word", maxWidth: 400 }}>{err.error}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Table */}
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: `1px solid ${COLOR.border}`, borderRadius: 10, marginBottom: 20 }}>
                <div>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                            <tr>
                                <th style={{ ...thStyle, width: 36, minWidth: 36, padding: "9px 4px" }}>
                                    <IndeterminateCheckbox
                                        checked={selectableItems.length > 0 && paginatedLineItems.every((i: any) => selectedLineItemIds.has(i.id))}
                                        indeterminate={paginatedLineItems.some((i: any) => selectedLineItemIds.has(i.id)) && !paginatedLineItems.every((i: any) => selectedLineItemIds.has(i.id))}
                                        onChange={() => {
                                            const selectable = selectableItems.map((i: any) => i.id);
                                            setSelectedLineItemIds(selectedLineItemIds.size === selectable.length ? new Set() : new Set(selectable));
                                        }}
                                    />
                                </th>
                                <th style={thStyle}>{orderColumn.label}</th>
                                <th style={thStyle}>Split Order</th>
                                <th style={thStyle}>Item Name</th>
                                {otherColumns.map((c) => <th key={c.label} style={thStyle}>{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {allLineItems.length > 0 ? paginatedLineItems.map((item: any, idx: number) => {
                                const orderSpan = orderSpans[item.id];
                                const splitSpan = splitSpans[item.id];
                                const splitId = getSplitOrderId(item);
                                const isSplit = !!splitId;
                                const splitName = isSplit
                                    ? (item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS)?.display_value || splitId)
                                    : "-";

                                const splitGroupItems = isSplit
                                    ? sortedFilteredLineItems.filter((i: any) => getSplitOrderId(i) === splitId && i.linkedOrderId === item.linkedOrderId)
                                    : [];
                                const splitGroupChecked = isSplit && splitGroupItems.length > 0 && splitGroupItems.every((i: any) => selectedLineItemIds.has(i.id));
                                const splitGroupIndeterminate = isSplit && splitGroupItems.some((i: any) => selectedLineItemIds.has(i.id)) && !splitGroupChecked;

                                // Border logic — same pattern as CourierSelection
                                const nextItem = idx < paginatedLineItems.length - 1 ? paginatedLineItems[idx + 1] : null;
                                const isLastInOrder = !nextItem || nextItem.linkedOrderId !== item.linkedOrderId;
                                const rowDivider: React.CSSProperties = isLastInOrder
                                    ? { borderBottom: "2px solid #5c6b8a" }
                                    : { borderBottom: "1px solid #b8bccb" };
                                const lastSpanRowIdx = splitSpan > 0 ? idx + splitSpan - 1 : idx;
                                const nextAfterSpan = lastSpanRowIdx + 1 < paginatedLineItems.length ? paginatedLineItems[lastSpanRowIdx + 1] : null;
                                const isSpanLastInOrder = !nextAfterSpan || nextAfterSpan.linkedOrderId !== item.linkedOrderId;
                                const spanDivider: React.CSSProperties = isSpanLastInOrder
                                    ? { borderBottom: "2px solid #5c6b8a" }
                                    : { borderBottom: "1px solid #b8bccb" };

                                return (
                                <tr key={item.id} style={{ backgroundColor: selectedLineItemIds.has(item.id) ? "#f0f7ff" : "#fff" }}>
                                    {splitSpan !== 0 && (
                                        <td style={{ ...tdStyle, ...spanDivider, width: 36, minWidth: 36, padding: "8px 4px", verticalAlign: "middle" }} rowSpan={splitSpan > 1 ? splitSpan : undefined}>
                                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                                {isSplit ? (
                                                    <IndeterminateCheckbox
                                                        checked={splitGroupChecked}
                                                        indeterminate={splitGroupIndeterminate}
                                                        onChange={() => {
                                                            const next = new Set(selectedLineItemIds);
                                                            splitGroupChecked
                                                                ? splitGroupItems.forEach((i: any) => next.delete(i.id))
                                                                : splitGroupItems.forEach((i: any) => next.add(i.id));
                                                            setSelectedLineItemIds(next);
                                                        }}
                                                    />
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLineItemIds.has(item.id)}
                                                        onChange={() => {
                                                            const next = new Set(selectedLineItemIds);
                                                            next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                                            setSelectedLineItemIds(next);
                                                        }}
                                                        style={{ width: 14, height: 14, cursor: "pointer", display: "block", margin: "0 auto", accentColor: "#0073ea" }}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    {orderSpan !== 0 && (
                                        <td style={{ ...tdStyle, borderBottom: "2px solid #5c6b8a", verticalAlign: "middle", fontWeight: 600 }} rowSpan={orderSpan > 1 ? orderSpan : undefined}>
                                            {orderColumn.render(item)}
                                        </td>
                                    )}
                                    {splitSpan !== 0 && (
                                        <td style={{ ...tdStyle, ...spanDivider, verticalAlign: "middle", fontWeight: isSplit ? 500 : undefined }} rowSpan={splitSpan > 1 ? splitSpan : undefined}>
                                            {splitName}
                                        </td>
                                    )}
                                    <td style={{ ...tdStyle, ...rowDivider }}>{item.name}</td>
                                    {splitSpan !== 0 && (
                                        <td style={{ ...tdStyle, ...spanDivider, verticalAlign: "middle" }} rowSpan={splitSpan > 1 ? splitSpan : undefined}>
                                            {item.supplierName || "-"}
                                        </td>
                                    )}
                                    {splitSpan !== 0 && (
                                        <td style={{ ...tdStyle, ...spanDivider, verticalAlign: "middle" }} rowSpan={splitSpan > 1 ? splitSpan : undefined}>
                                            {item.courierName || "-"}
                                        </td>
                                    )}
                                    {otherColumns.slice(2).map((c) => <td key={c.label} style={{ ...tdStyle, ...rowDivider }}>{c.render(item)}</td>)}
                                </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={TABLE_COLS.length + 3} style={{ padding: 40, textAlign: "center", color: COLOR.textMuted, fontSize: 13 }}>
                                        {selectedOrderFilter || selectedSupplierFilter || selectedCourierFilter || selectedSkuFilter
                                            ? "No line items match the selected filters."
                                            : "No line items to display."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} style={paginationBtn(currentPage === 1)}>← Prev</button>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", border: `1px solid ${COLOR.border}`, borderRadius: 6, background: COLOR.bg }}>{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={paginationBtn(currentPage === totalPages)}>Next →</button>
                    <span style={{ fontSize: 12, color: COLOR.textMuted }}>{sortedFilteredLineItems.length} record{sortedFilteredLineItems.length !== 1 ? "s" : ""}</span>
                </div>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${COLOR.border}`, fontSize: 13, color: COLOR.text }}>
                    {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
            </div>

            {/* Inline confirm dialog */}
            {showConfirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#fff", borderRadius: 8, padding: "32px", maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
                        <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>Finish &amp; Reset</h3>
                        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#676879" }}>Are you sure you want to finish and reset? This will clear all selected orders.</p>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <button onClick={() => setShowConfirm(false)} style={btn("secondary")}>Cancel</button>
                            <button onClick={() => { setShowConfirm(false); onNext(); }} style={btn("primary")}>Finish &amp; Reset</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom nav */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.borderLight}` }}>
                <button onClick={onPrev} style={btn("secondary")}>← Back to Couriers</button>
                <button onClick={() => setShowConfirm(true)} style={btn("primary")}>Finish &amp; Reset →</button>
            </div>
        </div>
    );
};