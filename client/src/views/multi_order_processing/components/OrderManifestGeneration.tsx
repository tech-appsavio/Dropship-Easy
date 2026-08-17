// src/views/multi_order_processing/components/OrderManifestGeneration.tsx
import React, { useState, useMemo } from "react";
import { Button, Loader, Toast, Dropdown } from "@vibe/core";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import { btn, TH, TD, filterBar, sectionTitle, paginationBtn, COLOR, badge } from "../styles";
import { Btn } from "./Btn";
import {
    SUPPLIER_MANIFEST_COLUMN_IDS_MAP,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    ORDER_ALL_COLUMN_IDS_MAP,
    CUSTOMER_ALL_COLUMN_IDS_MAP,
    SUPPLIER_ALL_COLUMN_IDS_MAP,
    PRODUCT_ALL_COLUMN_IDS_MAP,
    SHIPMENTS_ALL_COLUMN_IDS_MAP,
} from "../columns";
import {
    SUPPLIER_MANIFEST_BOARD_ID,
    ORDER_BOARD_ID,
    ORDER_ITEM_BOARD_ID,
    SHIPMENTS_BOARD_ID,
} from "../boardIds";
import mondaySdk from "monday-sdk-js";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import { useToast } from "../hooks/useToast";
import { generateManifestPDF } from "../utils/pdfGenerator";
import { generateLabelPDF } from "../utils/labelPdfGenerator";
import { fetchAllBoardItems } from "../utils/fetchAllItems";
import { logError } from "../utils/logError";
import ShipRocketService from "../../../services/shiprocketCourier";
import { resolveColumnIdByTitle } from "../utils/mondayColumns";

const monday = mondaySdk();

const thStyle = TH;
const tdStyle = TD;

const COURIER_TAG_STYLES: Record<string, React.CSSProperties> = {
    Best:    { background: "var(--ds-success-light)", color: "var(--ds-success)", border: "1px solid var(--ds-success-bd)" },
    Good:    { background: "var(--ds-primary-light)", color: "var(--ds-primary)", border: "1px solid var(--ds-info-bd)" },
    Average: { background: "var(--ds-warning-light)", color: "var(--ds-warning)", border: "1px solid var(--ds-warning-bd)" },
    Poor:    { background: "var(--ds-danger-light)",  color: "var(--ds-danger)",  border: "1px solid var(--ds-danger-bd)" },
};

const CourierOptionInline = ({ label, tag, freight_charge }: { label: string; tag?: string; freight_charge?: number }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
        <span style={{ fontSize: 13, color: "var(--ds-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {freight_charge !== undefined && <span style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>₹{freight_charge}</span>}
            {tag && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, ...COURIER_TAG_STYLES[tag] }}>{tag}</span>}
        </div>
    </div>
);

export const OrderManifestGeneration = ({ selectedOrderIds, onPrev, onNext }: { selectedOrderIds: string[]; onPrev: () => void; onNext: () => void }) => {
    const { loading, lineItems: rawLineItems, refetch } = useCourierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();

    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isProcessing, setIsProcessing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [processErrors, setProcessErrors] = useState<{ group: string; step: string; error: string }[]>([]);
    type SuccessGroup = {
        groupKey: string; items: any[]; awbCode: string; srShipmentId: string;
        courierId: string; courierName: string; orderName: string; splitOrderName: string;
        supplierData: { address: string; phone: string; email: string };
        supplierName: string; splitOrderId: string; monitorId: string;
        allSiblingIds: string[];
    };
    type FailedGroup = { groupLabel: string; groupKey: string; orderName: string; splitOrderName: string; error: string; srShipmentId: string; items: any[]; supplierName: string; splitOrderId: string; monitorId: string; allSiblingIds: string[]; supplierData: { address: string; phone: string; email: string } };

    const [awbFailModal, setAwbFailModal] = useState<{
        successGroups: SuccessGroup[];
        failedGroups: FailedGroup[];
    } | null>(null);

    // ── Reassign courier modal state ─────────────────────────────────────────
    type ReassignRowState = { options: any[]; loading: boolean; error: string | null; selected: any };
    const [reassignModal, setReassignModal] = useState<{
        successGroups: SuccessGroup[];
        failedGroups: FailedGroup[];
        rowMap: Record<string, ReassignRowState>; // keyed by monitorId
        isSubmitting: boolean;
    } | null>(null);
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
    // Human split name (e.g. "ORD-0001-S2") — used to order splits S1, S2, S3… correctly.
    const getSplitOrderName = (item: any): string => {
        const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
        return col?.display_value || "";
    };

    const sortedFilteredLineItems = useMemo(() => [...filteredLineItems].sort((a: any, b: any) => {
        const oCmp = (a.orderName || a.linkedOrderId || "").localeCompare(b.orderName || b.linkedOrderId || "", undefined, { numeric: true });
        if (oCmp !== 0) return oCmp;
        const aHasSplit = !!getSplitOrderId(a);
        const bHasSplit = !!getSplitOrderId(b);
        if (aHasSplit && !bHasSplit) return -1;
        if (!aHasSplit && bHasSplit) return 1;
        if (aHasSplit && bHasSplit) {
            // Order splits by their name (ORD-0001-S1, -S2, …) numerically, not by item id.
            const aName = getSplitOrderName(a) || getSplitOrderId(a);
            const bName = getSplitOrderName(b) || getSplitOrderId(b);
            const sCmp = aName.localeCompare(bName, undefined, { numeric: true });
            if (sCmp !== 0) return sCmp;
        }
        return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true });
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

    // Per line-item columns (different values per row within a split group)
    const itemColumns: { label: string; render: (li: any) => string }[] = [
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
    ];

    // Per split-group columns (same value for all items in a split group — will be rowspanned)
    const groupColumns: { label: string; render: (li: any) => string }[] = [
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

    const { orderSpans, splitSpans, sharedSpans } = useMemo(() => {
        const orderSpans: Record<string, number> = {};
        const splitSpans: Record<string, number> = {};
        // sharedSpans: like splitSpans but groups ALL consecutive non-split items within the
        // same order together so shared columns (Supplier, Courier, COD, Status…) render once.
        const sharedSpans: Record<string, number> = {};
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
                    sharedSpans[paginatedLineItems[m].id] = n - m;
                    for (let k = m + 1; k < n; k++) {
                        splitSpans[paginatedLineItems[k].id] = 0;
                        sharedSpans[paginatedLineItems[k].id] = 0;
                    }
                    m = n;
                } else {
                    // Non-split: each item keeps its own checkbox (splitSpan = 1)
                    // but all consecutive non-split items in this order share group columns
                    let n = m;
                    while (n < j && !getSplitOrderId(paginatedLineItems[n])) n++;
                    sharedSpans[paginatedLineItems[m].id] = n - m;
                    for (let k = m; k < n; k++) splitSpans[paginatedLineItems[k].id] = 1;
                    for (let k = m + 1; k < n; k++) sharedSpans[paginatedLineItems[k].id] = 0;
                    m = n;
                }
            }
            i = j;
        }
        return { orderSpans, splitSpans, sharedSpans };
    }, [paginatedLineItems]);

    const processValidation = useMemo(() => {
        if (selectedLineItemIds.size === 0) return { isValid: false, reason: "Select items to process." };
        const selectedItems = filteredLineItems.filter((item: any) => selectedLineItemIds.has(item.id));
        const alreadyShipped = selectedItems.filter((item: any) => isShipped(item));
        if (alreadyShipped.length > 0) return { isValid: false, reason: `${alreadyShipped.length} selected item(s) already processed.` };
        const missingCourier = selectedItems.filter((item: any) => {
            const namCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME);
            const idCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID);
            return !namCol?.text?.trim() && !idCol?.text?.trim();
        });
        if (missingCourier.length > 0) return { isValid: false, reason: `Courier not assigned for ${missingCourier.length} item(s)` };
        const missingSupplier = selectedItems.filter((item: any) => {
            const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
            return !col?.display_value?.trim() && !col?.text?.trim();
        });
        if (missingSupplier.length > 0) return { isValid: false, reason: `Supplier not assigned for ${missingSupplier.length} item(s)` };
        const orderCount = new Set(
            selectedItems.map((item: any) => getSplitOrderId(item) || item.linkedOrderId).filter(Boolean)
        ).size;
        return { isValid: true, reason: `Ready to process ${orderCount} order(s).` };
    }, [selectedLineItemIds, filteredLineItems]);

    const selectedOrderCount = useMemo(() => {
        if (selectedLineItemIds.size === 0) return 0;
        const selectedItems = filteredLineItems.filter((item: any) => selectedLineItemIds.has(item.id));
        return new Set(
            selectedItems.map((item: any) => getSplitOrderId(item) || item.linkedOrderId).filter(Boolean)
        ).size;
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

    // ── Phase 1: Assign AWB only (called concurrently per group) ──────────────
    const assignAwbForGroup = async (srShipmentId: string, courierId: string, orderName: string) => {
        if (!srShipmentId) throw new Error(`Shiprocket Shipment ID missing for "${orderName}"`);

        const extractResult = (awbRes: any): { awbCode: string; error: string } => {
            const awbCode: string =
                awbRes?.response?.data?.awb_code ||
                awbRes?.data?.awb_code ||
                awbRes?.awb_code || "";
            const error: string =
                awbRes?.response?.data?.awb_assign_error ||
                awbRes?.data?.awb_assign_error ||
                awbRes?.awb_assign_error ||
                awbRes?.message ||
                (awbRes?.errors ? JSON.stringify(awbRes.errors) : "") ||
                `Unexpected response: ${JSON.stringify(awbRes).slice(0, 200)}`;
            return { awbCode, error };
        };

        // Try the selected courier first
        const primaryRes: any = await ShipRocketService.assignAWB(srShipmentId, courierId);
        console.log(`[assignAWB] "${orderName}" courier=${courierId}:`, JSON.stringify(primaryRes));
        const primary = extractResult(primaryRes);
        if (primary.awbCode) return primary.awbCode;

        const isAlreadyAssigned =
            primary.error.toLowerCase().includes("awb is already assigned") ||
            primary.error.toLowerCase().includes("awb assigned");
        if (isAlreadyAssigned) {
            // Extract the AWB code from the error message e.g. "awb - 1319460475952"
            const match = primary.error.match(/awb\s*[-:]\s*(\w+)/i);
            if (match?.[1]) return match[1];
            // Fallback: fetch the AWB from the shipment details
            try {
                const detailRes: any = await ShipRocketService.checkCourierServiceability("", "", 0.5, 0, srShipmentId);
                const existingAwb = detailRes?.data?.awb_code || detailRes?.awb_code || "";
                if (existingAwb) return existingAwb;
            } catch { /* ignore */ }
            throw new Error(primary.error);
        }

        // If it looks like a serviceability error, re-check and auto-fallback to another courier
        const isServiceabilityError =
            primary.error.toLowerCase().includes("serviceable") ||
            primary.error.toLowerCase().includes("not available") ||
            primary.error.toLowerCase().includes("courier");
        if (isServiceabilityError) {
            try {
                const serviceRes = await ShipRocketService.checkCourierServiceability("", "", 0.5, 0, srShipmentId);
                const companies: any[] = serviceRes?.data?.available_courier_companies || [];
                for (const company of companies) {
                    const altId = String(company.courier_company_id);
                    if (altId === courierId) continue;
                    const altRes: any = await ShipRocketService.assignAWB(srShipmentId, altId);
                    console.log(`[assignAWB] "${orderName}" fallback courier=${altId} (${company.courier_name}):`, JSON.stringify(altRes));
                    const alt = extractResult(altRes);
                    if (alt.awbCode) return alt.awbCode;
                }
            } catch (retryErr: any) {
                console.warn(`[assignAWB] "${orderName}" serviceability re-check failed:`, retryErr.message);
            }
        }

        throw new Error(primary.error);
    };

    // ── Phase 2: Post-AWB steps per group (Steps 2-8) ───────────────────────
    const runPostAwbSteps = async (group: { awbCode: string; srShipmentId: string; courierId: string; courierName: string; orderName: string; splitOrderName?: string; supplierData: any; supplierName: string; splitOrderId: string; monitorId: string; items: any[]; allSiblingIds: string[] }) => {
        const { awbCode, srShipmentId, courierId, courierName, orderName, splitOrderName, supplierData, supplierName, splitOrderId, monitorId, items, allSiblingIds } = group;
        // Use the split order's own name if this group is a split; otherwise the main order name.
        const shipmentOrderName = splitOrderName || orderName;
        // For non-split orders all line items belong to the same Shiprocket shipment,
        // so we update every sibling; for split orders we only touch this split group.
        const updateItemIds = allSiblingIds.length > 0 ? allSiblingIds : items.map((i: any) => i.id);

        // Step 2: Write AWB to Monday order
        if (awbCode) {
            try {
                await monday.api(`mutation {
                    change_simple_column_value(item_id: ${monitorId}, board_id: ${ORDER_BOARD_ID},
                        column_id: "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID}", value: ${JSON.stringify(awbCode)}) { id }
                }`);
            } catch (e: any) { console.warn("[Phase2] AWB write failed (non-fatal):", e?.message); }
        }

        // Step 2b: Write the (possibly reassigned) courier back to Monday line items
        try {
            const courierCV = JSON.stringify({
                [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME]: courierName,
                [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID]: courierId,
            }).replace(/"/g, '\\"');
            await Promise.all(updateItemIds.map((id: string) =>
                monday.api(`mutation { change_multiple_column_values(item_id: ${id}, board_id: ${ORDER_ITEM_BOARD_ID}, column_values: "${courierCV}") { id } }`)
            ));
        } catch (e: any) { console.warn("[Phase2] Courier write-back failed (non-fatal):", e?.message); }

        // Step 3: Create Monday shipment item
        const now = new Date();
        const nowFmt = formatDateTime(now);
        const shipCV: any = {
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Orders]: { item_ids: [String(monitorId)] },
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Assigned_Date]: nowFmt,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Courier_Company_Id]: courierId,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Courier_Name]: courierName,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Shipper_Company_Name]: supplierName,
            [SHIPMENTS_ALL_COLUMN_IDS_MAP.Shipper_Address]: supplierData.address,
        };
        // A newly created shipment starts as "Active" (Cancel Shipment status column).
        if (SHIPMENTS_ALL_COLUMN_IDS_MAP.CANCEL_SHIPMENT) {
            shipCV[SHIPMENTS_ALL_COLUMN_IDS_MAP.CANCEL_SHIPMENT] = { label: "Active" };
        }
        // Populate the "Created Date" date column (resolved by title, not hardcoded ID,
        // since the Shipments board previously had no real date-typed column captured).
        const shipCreatedDateColId = await resolveColumnIdByTitle(SHIPMENTS_BOARD_ID, "Created Date");
        if (shipCreatedDateColId) shipCV[shipCreatedDateColId] = { date: now.toISOString().slice(0, 10) };

        const createShipRes: any = await monday.api(`mutation {
            create_item(board_id: ${SHIPMENTS_BOARD_ID}, item_name: "Shipment - ${shipmentOrderName}",
                column_values: "${JSON.stringify(shipCV).replace(/"/g, '\\"')}", create_labels_if_missing: true) { id }
        }`);
        const newShipmentItemId: string | undefined = createShipRes?.data?.create_item?.id;
        if (!newShipmentItemId) throw new Error("Failed to create monday shipment item");

        // Step 4: Generate Shiprocket pickup
        const genRes: any = await ShipRocketService.generatePickup(srShipmentId);

        // Step 5: Update pickup dates on Monday (non-fatal)
        try {
            const srData = genRes?.response ?? genRes;
            const rawSched: string = srData?.pickup_scheduled_date || "";
            const rawGen: string = srData?.pickup_generated_date?.date || srData?.pickup_generated_date || "";
            const pickupPayload = JSON.stringify({
                [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Scheduled_Date]: rawSched ? formatDateTime(new Date(rawSched.replace(" ", "T"))) : nowFmt,
                [SHIPMENTS_ALL_COLUMN_IDS_MAP.Pickup_Generated_Date]: rawGen ? formatDateTime(new Date(rawGen.replace(" ", "T"))) : nowFmt,
            });
            await monday.api(`mutation {
                change_multiple_column_values(item_id: ${newShipmentItemId}, board_id: ${SHIPMENTS_BOARD_ID},
                    column_values: "${pickupPayload.replace(/"/g, '\\"')}") { id }
            }`);
        } catch (e: any) { console.warn("[Phase2] Pickup dates update failed (non-fatal):", e?.message); }

        // Step 6: Mark ALL related line items Shipped="Yes"
        const successMsg = awbCode ? `Shipment created successfully. AWB: ${awbCode}` : "Shipment created successfully.";
        await Promise.all(updateItemIds.map((id: string) => {
            const cv = JSON.stringify({ [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.Shipped]: { label: "Yes" } }).replace(/"/g, '\\"');
            return monday.api(`mutation { change_multiple_column_values(item_id: ${id}, board_id: ${ORDER_ITEM_BOARD_ID}, column_values: "${cv}") { id } }`);
        }));

        // Step 7: Write success response on ALL related line items
        await Promise.all(updateItemIds.map((id: string) =>
            monday.api(`mutation {
                change_simple_column_value(item_id: ${id}, board_id: ${ORDER_ITEM_BOARD_ID},
                    column_id: "${ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.shiprocket_Shipment_response}",
                    value: ${JSON.stringify(JSON.stringify(successMsg))}) { id }
            }`)
        ));

        // Step 8: Update split order status
        if (splitOrderId) {
            const splitCV = JSON.stringify({ [ORDER_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Shipped" } }).replace(/"/g, '\\"');
            await monday.api(`mutation { change_multiple_column_values(item_id: ${splitOrderId}, board_id: ${ORDER_BOARD_ID}, column_values: "${splitCV}") { id } }`);
        }
    };

    // ── Phase 3: Manifest generation for given item IDs ──────────────────────
    const runManifestPhase = async (
        itemIds: string[],
        awbOverrides: Record<string, string> = {},
        courierOverrides: Record<string, { courierId: string; courierName: string }> = {}
    ): Promise<{ group: string; step: string; error: string }[]> => {
        const errors: { group: string; step: string; error: string }[] = [];
        try {
            const itemsRes: any = await monday.api(`query {
                items(ids: [${itemIds.join(",")}]) {
                    id name
                    column_values {
                        id text value
                        ... on BoardRelationValue { linked_item_ids display_value }
                    }
                }
            }`);
            if (!itemsRes.data?.items?.length) throw new Error("Failed to retrieve line item data.");
            const rawItems = itemsRes.data.items;

            const getVal = (item: any, id: string) => item.column_values.find((cv: any) => cv.id === id);
            const getLinkedId = (col: any): string => {
                if (col?.linked_item_ids?.[0]) return String(col.linked_item_ids[0]);
                try { const p = JSON.parse(col?.value || "{}"); return String(p?.linkedPulseIds?.[0]?.linkedPulseId || ""); } catch { return ""; }
            };

            const parentOrderIdMap: Record<string, string> = {};
            rawItems.forEach((item: any) => {
                const pid = getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER));
                parentOrderIdMap[item.id] = pid;
            });
            const uniqueParentOrderIds = [...new Set(Object.values(parentOrderIdMap).filter(Boolean))];

            const splitOrderIdMap: Record<string, string> = {};
            rawItems.forEach((item: any) => {
                const splitId = getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS));
                if (splitId) splitOrderIdMap[item.id] = splitId;
            });
            const uniqueSplitOrderIds = [...new Set(Object.values(splitOrderIdMap).filter(Boolean))];

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
                    splitOrderSRMap[so.id] = {
                        srOrderId: so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "",
                        srShipmentId: so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "",
                        srAwbId: awbOverrides[so.id] || so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID)?.text || "",
                        name: so.name,
                    };
                });
            }

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

            const customerIds: string[] = [];
            Object.values(orderMap).forEach((o: any) => {
                const custId = getLinkedId(o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER));
                if (custId && !customerIds.includes(custId)) customerIds.push(custId);
            });
            const customerMap: Record<string, any> = {};
            if (customerIds.length > 0) {
                const custRes: any = await monday.api(`query { items(ids: [${customerIds.join(",")}]) { id name column_values { id text } } }`);
                (custRes.data?.items || []).forEach((c: any) => { customerMap[c.id] = c; });
            }

            const supplierIds = [...new Set(rawItems.map((item: any) => getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER))).filter(Boolean))];
            const supplierDataMap: Record<string, any> = {};
            if (supplierIds.length > 0) {
                const suppRes: any = await monday.api(`query { items(ids: [${supplierIds.join(",")}]) { id column_values { id text value } } }`);
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

            const productIds = [...new Set(rawItems.map((item: any) => getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT))).filter(Boolean))];
            const productPriceMap: Record<string, number> = {};
            if (productIds.length > 0) {
                const prodRes: any = await monday.api(`query { items(ids: [${productIds.join(",")}]) { id column_values(ids: ["${PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE}"]) { id text } } }`);
                (prodRes.data?.items || []).forEach((p: any) => {
                    const priceCol = p.column_values.find((cv: any) => cv.id === PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE);
                    productPriceMap[p.id] = parseFloat(priceCol?.text?.replace(/[^0-9.]/g, "") || "0");
                });
            }

            const compiledItems = rawItems.map((item: any) => {
                const parentOrderId = parentOrderIdMap[item.id];
                const order = orderMap[parentOrderId] || {};
                const getOrderCol = (id: string) => order.column_values?.find((cv: any) => cv.id === id);
                const supplierId = getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER));
                const supplierName = getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.display_value || "";
                const storedCourierName = getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME)?.text || "";
                const storedCourierId = (getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID)?.text || "").trim();
                const splitOrderId = splitOrderIdMap[item.id] || "";
                // Apply courier overrides for reassigned orders (keyed by splitOrderId or parentOrderId)
                const courierOverride = courierOverrides[splitOrderId || parentOrderId];
                const courierName = courierOverride?.courierName || storedCourierName;
                const courierId = courierOverride?.courierId || storedCourierId;
                const linkedProdId = getLinkedId(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT));
                const unitPrice = productPriceMap[linkedProdId] || 0;
                const qty = parseInt(getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY)?.text || "1") || 1;
                const customerId = getLinkedId(getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER));
                const customer = customerMap[customerId];
                const totalPrice = getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.TOTAL_PRICE)?.text || (unitPrice * qty).toFixed(2);
                const splitSR = splitOrderId ? splitOrderSRMap[splitOrderId] : null;
                const awbCode = awbOverrides[splitOrderId || parentOrderId] || (splitSR ? splitSR.srAwbId : (getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID)?.text || ""));
                const courierKey = courierId || courierName.trim();
                const groupKey = splitOrderId
                    ? `split__${splitOrderId}__${courierKey}`
                    : `order__${parentOrderId}__${supplierId}__${courierKey}`;
                // For split orders use the split order name/id in the manifest; for normal orders use parent
                const displayOrderId = splitSR?.name || getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.ORDERID)?.text || order.name || parentOrderId;
                const displayOrderName = splitSR?.name || order.name || parentOrderId;
                return {
                    ...item, parentOrderId, splitOrderId,
                    orderId: displayOrderId,
                    orderName: displayOrderName, supplierId, supplierName,
                    supplierData: supplierDataMap[supplierId] || {},
                    courierName, courierId, courierKey, groupKey,
                    sku: getVal(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU)?.text || item.name,
                    unitPrice, totalPrice,
                    paymentMethod: getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.PAYMENTMETHOD)?.text || "To be paid",
                    billingAddress: getOrderCol(ORDER_ALL_COLUMN_IDS_MAP.BILLING_ADDRESS)?.text || "",
                    awbCode,
                    customerName: customer?.name || "",
                    customerPhone: customer?.column_values?.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
                    customerEmail: customer?.column_values?.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "",
                    supplierAddress: supplierDataMap[supplierId]?.address || "",
                    supplierPhone: supplierDataMap[supplierId]?.phone || "",
                    supplierEmail: supplierDataMap[supplierId]?.email || "",
                };
            });

            const groups: Record<string, typeof compiledItems> = {};
            compiledItems.forEach((item) => {
                if (!groups[item.groupKey]) groups[item.groupKey] = [];
                groups[item.groupKey].push(item);
            });

            // ── Manifest grouping: one manifest per Supplier + Courier ──────────
            // Re-group compiled items by supplierId+courierKey so all orders sharing
            // the same supplier and courier are combined into a single manifest.
            // Label generation still uses the original per-shipment groupKey below.
            const manifestGroups: Record<string, typeof compiledItems> = {};
            compiledItems.forEach((item) => {
                const manifestKey = `${item.supplierId}__${item.courierKey}`;
                if (!manifestGroups[manifestKey]) manifestGroups[manifestKey] = [];
                manifestGroups[manifestKey].push(item);
            });

            const now = new Date();
            const ts = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
            const nowIso = now.toISOString().slice(0, 10);

            // Resolved once (by title, not hardcoded ID) and reused across every manifest
            // group created below — the Supplier Manifests board had no date column at all.
            const manifestCreatedDateColId = await resolveColumnIdByTitle(SUPPLIER_MANIFEST_BOARD_ID, "Created Date");

            for (const [, groupItems] of Object.entries(manifestGroups)) {
                const first = groupItems[0];
                const groupLabel = `${first.supplierName} / ${first.courierName}`;
                const manifestName = sanitizeFilename(`${first.supplierName}_${first.courierName}_(${ts})`);
                let newManifestId: string | null = null;

                try {
                    const groupParentOrderIds = [...new Set(groupItems.map((i) => i.parentOrderId).filter(Boolean))];
                    const groupSplitOrderIds = [...new Set(groupItems.map((i) => i.splitOrderId).filter(Boolean))];
                    const manifestColValues: any = {
                        [SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER_LINE_ITEM]: { item_ids: groupItems.map((i) => String(i.id)) },
                    };
                    if (groupParentOrderIds.length > 0) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER] = { item_ids: groupParentOrderIds.map(String) };
                    if (groupSplitOrderIds.length > 0) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.SPLIT_ORDERS] = { item_ids: groupSplitOrderIds.map(String) };
                    if (first.supplierId) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.SUPPLIER] = { item_ids: [String(first.supplierId)] };
                    if (first.supplierEmail) manifestColValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.Supplier_Email] = { email: first.supplierEmail, text: first.supplierEmail };
                    if (manifestCreatedDateColId) manifestColValues[manifestCreatedDateColId] = { date: nowIso };
                    const createRes: any = await monday.api(`mutation {
                        create_item(board_id: ${SUPPLIER_MANIFEST_BOARD_ID}, item_name: "${manifestName}",
                            column_values: "${JSON.stringify(manifestColValues).replace(/"/g, '\\"')}") { id }
                    }`);
                    newManifestId = createRes.data.create_item.id;
                } catch (e: any) {
                    errors.push({ group: groupLabel, step: "Create Manifest Record", error: e.message });
                    continue;
                }

                try {
                    const manifestBlob = await generateManifestPDF({ supplierName: first.supplierName, courierName: first.courierName, lineItems: groupItems, manifestName, supplierAddress: first.supplierAddress || first.supplierData?.address || "", supplierPhone: first.supplierPhone || first.supplierData?.phone || "" });
                    const manifestFile = new File([manifestBlob], `${manifestName}_Manifest.pdf`, { type: "application/pdf" });
                    await monday.api(`mutation ($file: File!) { add_file_to_column(item_id: ${newManifestId}, column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.MANIFEST_FILE}", file: $file) { id } }`, { variables: { file: manifestFile } });
                } catch (e: any) { errors.push({ group: groupLabel, step: "Manifest PDF Upload", error: e.message }); }

                try {
                    // Labels: one page per item across all shipments in this manifest group
                    const labelItems = groupItems; // generateLabelPDF renders one page per item
                    const mergedLabelBlob = await generateMergedLabelPDF(labelItems);
                    const labelFile = new File([mergedLabelBlob], `${manifestName}_Label.pdf`, { type: "application/pdf" });
                    await monday.api(`mutation ($file: File!) { add_file_to_column(item_id: ${newManifestId}, column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.LABEL_FILE}", file: $file) { id } }`, { variables: { file: labelFile } });
                } catch (e: any) { errors.push({ group: groupLabel, step: "Label PDF Upload", error: e.message }); }

                try {
                    // A Supplier+Courier manifest group can now contain items from several
                    // different orders — a mix of split orders and normal orders. Bucket
                    // items by the order they actually belong to (not just "first") so we
                    // mark exactly the right set of items for each order, and no others.
                    const splitBuckets: Record<string, any[]> = {};
                    const nonSplitBuckets: Record<string, any[]> = {};
                    groupItems.forEach((item) => {
                        if (item.splitOrderId) {
                            (splitBuckets[item.splitOrderId] ||= []).push(item);
                        } else {
                            (nonSplitBuckets[item.parentOrderId] ||= []).push(item);
                        }
                    });

                    const markItems = async (ids: string[]) => {
                        await Promise.all(ids.map(async (id) => {
                            const oliCV: any = {
                                [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Manifest Generated" },
                                [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIERMANIFEST]: { item_ids: [String(newManifestId)] },
                            };
                            await monday.api(`mutation { change_multiple_column_values(item_id: ${id}, board_id: ${ORDER_ITEM_BOARD_ID}, column_values: "${JSON.stringify(oliCV).replace(/"/g, '\\"')}") { id } }`);
                        }));
                    };

                    // Split orders: mark only the items that belong to that specific split group
                    for (const items of Object.values(splitBuckets)) {
                        await markItems(items.map((item) => String(item.id)));
                    }

                    // Non-split orders: mark ALL line items of each parent order (its own
                    // siblings only) so every sibling shows "Manifest Generated".
                    const nonSplitParentIds = Object.keys(nonSplitBuckets);
                    if (nonSplitParentIds.length > 0) {
                        const allOli = await fetchAllBoardItems(ORDER_ITEM_BOARD_ID, `
                            id
                            column_values(ids: ["${ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER}"]) {
                                id text value ... on BoardRelationValue { linked_item_ids }
                            }
                        `);
                        for (const parentId of nonSplitParentIds) {
                            const siblingIds = allOli
                                .filter((li: any) => {
                                    const oc = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                                    const lid = oc?.linked_item_ids?.[0] || (() => { try { return String(JSON.parse(oc?.value || "{}").linkedPulseIds?.[0]?.linkedPulseId || ""); } catch { return ""; } })();
                                    return String(lid) === String(parentId);
                                })
                                .map((li: any) => String(li.id));
                            const itemIdsToMark = siblingIds.length > 0 ? siblingIds : nonSplitBuckets[parentId].map((item) => String(item.id));
                            await markItems(itemIdsToMark);
                        }
                    }
                } catch (e: any) { errors.push({ group: groupLabel, step: "Line Item Status Update", error: e.message }); }

                {
                    const allSplitIdsInGroup = [...new Set(groupItems.map((i) => i.splitOrderId).filter(Boolean))];
                    if (allSplitIdsInGroup.length > 0) {
                        try {
                            await Promise.all(allSplitIdsInGroup.map((sid) =>
                                monday.api(`mutation { change_multiple_column_values(item_id: ${sid}, board_id: ${ORDER_BOARD_ID}, column_values: "${JSON.stringify({ [ORDER_ALL_COLUMN_IDS_MAP.Order_Type]: { label: "Order" } }).replace(/"/g, '\\"')}") { id } }`)
                            ));
                        } catch (e: any) { errors.push({ group: groupLabel, step: "Split Order Type Update", error: e.message }); }
                    }
                }

                try {
                    for (const parentId of [...new Set(groupItems.map((i) => i.parentOrderId))]) {
                        const allOli = await fetchAllBoardItems(ORDER_ITEM_BOARD_ID, `id column_values { id text ... on BoardRelationValue { linked_item_ids } }`);
                        const siblings = allOli.filter((li: any) => {
                            const oc = li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                            const lid = oc?.linked_item_ids?.[0] || (() => { try { return String(JSON.parse(oc?.value || "{}").linkedPulseIds?.[0]?.linkedPulseId || ""); } catch { return ""; } })();
                            return String(lid) === String(parentId);
                        });
                        const allManifested = siblings.length > 0 && siblings.every((li: any) => li.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS)?.text === "Manifest Generated");
                        // The manifest process's final order status is "Manifest Generated".
                        // "Shipped" is NOT set here — it's set only immediately after the
                        // shipment is created (see runPostAwbSteps → split order status).
                        const newOrderStatus = allManifested ? "Manifest Generated" : null;
                        if (newOrderStatus) {
                            await monday.api(`mutation { change_multiple_column_values(item_id: ${parentId}, board_id: ${ORDER_BOARD_ID}, column_values: "${JSON.stringify({ [ORDER_ALL_COLUMN_IDS_MAP.STATUS]: { label: newOrderStatus } }).replace(/"/g, '\\"')}") { id } }`);
                        }
                    }
                } catch (e: any) { errors.push({ group: groupLabel, step: "Parent Order Status Update", error: e.message }); }
            }
        } catch (e: any) {
            errors.push({ group: "General", step: "Manifest Phase", error: e.message });
        }
        return errors;
    };

    // ── Phase 2 + 3: Run post-AWB steps then manifest for success groups ─────
    const runPhase2AndManifest = async (successGroups: NonNullable<typeof awbFailModal>["successGroups"]) => {
        setIsProcessing(true);
        showToast("⏳ Please wait while shipments, manifests, and shipping labels are being generated…", "dark");
        const collectedErrors: { group: string; step: string; error: string; splitOrderItemId?: string }[] = [];
        const phase2SuccessGroups: typeof successGroups = [];
        try {
            for (const group of successGroups) {
                const groupLabel = `${group.supplierName || "-"} / ${group.courierName || "-"}`;
                try {
                    await runPostAwbSteps(group);
                    phase2SuccessGroups.push(group);
                } catch (e: any) {
                    // group.splitOrderId is the split order's monday item id → link the record.
                    collectedErrors.push({ group: groupLabel, step: "Shipment Steps", error: e.message, splitOrderItemId: group.splitOrderId });
                }
            }

            if (phase2SuccessGroups.length > 0) {
                const manifestItemIds = phase2SuccessGroups.flatMap((g) => g.items.map((i: any) => i.id));
                const awbOverrides: Record<string, string> = {};
                const courierOverrides: Record<string, { courierId: string; courierName: string }> = {};
                phase2SuccessGroups.forEach((g) => {
                    const key = g.splitOrderId || g.monitorId;
                    if (g.awbCode) awbOverrides[key] = g.awbCode;
                    if (g.courierId || g.courierName) courierOverrides[key] = { courierId: g.courierId, courierName: g.courierName };
                });
                const manifestErrors = await runManifestPhase(manifestItemIds, awbOverrides, courierOverrides);
                collectedErrors.push(...manifestErrors);
            }

            await refetch();
            setProcessErrors(collectedErrors);
            if (collectedErrors.length === 0) {
                showToast("All shipments created and manifests generated successfully!", "positive");
                monday.execute("valueCreatedForUser"); // monday activation signal
            } else {
                showToast(`Completed with ${collectedErrors.length} error(s). See details below.`, "negative");
                collectedErrors.forEach((err) =>
                    logError({
                        stage: err.step === "Shipment Steps" ? "Shipment Creation" : "Manifest Generation",
                        severity: "Error",
                        message: `${err.step} failed for ${err.group}: ${err.error}`,
                        technicalDetails: err.error,
                        splitOrderId: err.group,
                        splitOrderItemId: err.splitOrderItemId, // links the "Split Orders" connect when known
                        suggestedSolution: "Review the order in the Ship Easy boards and retry this step from Create Shipment & Manifest.",
                        retry: true,
                    })
                );
            }
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            showToast("Processing failed: " + e.message, "negative");
            logError({
                stage: "Manifest Generation", severity: "Critical",
                message: `Create Shipment & Manifest failed: ${e.message}`,
                technicalDetails: String(e?.stack || e),
                suggestedSolution: "Re-check the selected orders and their courier/AWB assignments, then run Create Shipment & Manifest again.",
                retry: true,
            });
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Main handler: Phase 1 — concurrent AWB assignment ───────────────────
    const handleProcessOrders = async () => {
        if (!processValidation.isValid) return;
        setIsProcessing(true);
        setProcessErrors([]);
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
            const uniqueSplitIds = [...new Set(Object.values(splitOrderIdMap).filter(Boolean))];

            // Fetch SR IDs and names for split orders
            const splitSRMap: Record<string, { srOrderId: string; srShipmentId: string; name: string }> = {};
            if (uniqueSplitIds.length > 0) {
                const res: any = await monday.api(`query {
                    items(ids: [${uniqueSplitIds.join(",")}]) {
                        id name column_values(ids: ["${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID}", "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}"]) { id text }
                    }
                }`);
                (res.data?.items || []).forEach((so: any) => {
                    splitSRMap[so.id] = {
                        srOrderId: so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID)?.text || "",
                        srShipmentId: so.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID)?.text || "",
                        name: so.name || "",
                    };
                });
            }

            // Fetch SR IDs for parent orders
            const uniqueParentIds = [...new Set(selectedItems.map((i: any) => i.linkedOrderId).filter(Boolean))];
            const parentSRMap: Record<string, { srOrderId: string; srShipmentId: string; name: string }> = {};
            if (uniqueParentIds.length > 0) {
                const res: any = await monday.api(`query {
                    items(ids: [${uniqueParentIds.join(",")}]) {
                        id name column_values(ids: ["${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID}", "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}"]) { id text }
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
            const supplierDataMap: Record<string, { address: string; phone: string; email: string }> = {};
            if (supplierIds.length > 0) {
                const res: any = await monday.api(`query { items(ids: [${supplierIds.join(",")}]) { id column_values { id text value } } }`);
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

            const groupEntries = Object.entries(groups);

            // Phase 1: Concurrent AWB assignment
            const awbResults = await Promise.allSettled(
                groupEntries.map(async ([, groupItems]) => {
                    const first = groupItems[0];
                    const splitSR = first.splitOrderId ? splitSRMap[first.splitOrderId] : null;
                    const parentSR = parentSRMap[first.linkedOrderId];
                    const srShipmentId = splitSR ? splitSR.srShipmentId : (parentSR?.srShipmentId || "");
                    const orderName = parentSR?.name || first.orderName || first.linkedOrderId;
                    const awbCode = await assignAwbForGroup(srShipmentId, first.courierId, orderName);
                    // For non-split orders, collect ALL line item IDs of this order so every
                    // sibling gets Shipped=Yes and the SR response, not just selected items.
                    const allSiblingIds = first.splitOrderId
                        ? groupItems.map((i: any) => i.id)
                        : allLineItems.filter((li: any) => li.linkedOrderId === first.linkedOrderId).map((li: any) => li.id);
                    return {
                        groupKey: first.splitOrderId ? `split__${first.splitOrderId}__${first.courierId || first.courierName}` : `order__${first.linkedOrderId}__${first.supplierId}__${first.courierId || first.courierName}`,
                        items: groupItems,
                        awbCode,
                        srShipmentId,
                        courierId: first.courierId,
                        courierName: first.courierName,
                        orderName,
                        splitOrderName: first.splitOrderId ? (splitSRMap[first.splitOrderId]?.name || "") : "",
                        supplierData: supplierDataMap[first.supplierId] || { address: "", phone: "", email: "" },
                        supplierName: first.supplierName || "",
                        splitOrderId: first.splitOrderId,
                        monitorId: first.splitOrderId || first.linkedOrderId,
                        allSiblingIds,
                    };
                })
            );

            // Categorize results
            const successGroups: NonNullable<typeof awbFailModal>["successGroups"] = [];
            const failedGroups: NonNullable<typeof awbFailModal>["failedGroups"] = [];
            awbResults.forEach((result, idx) => {
                const [, groupItems] = groupEntries[idx];
                const first = groupItems[0];
                const groupLabel = `${first.supplierName || "-"} / ${first.courierName || "-"}`;
                const orderName = parentSRMap[first.linkedOrderId]?.name || first.orderName || first.linkedOrderId;
                const splitOrderName = first.splitOrderId ? (splitSRMap[first.splitOrderId]?.name || "") : "";
                if (result.status === "fulfilled") {
                    successGroups.push(result.value);
                } else {
                    // Carry the exact groupKey (idx-linked) so this failed group can be
                    // re-located precisely below. Matching purely by groupLabel is
                    // ambiguous whenever two different orders share the same
                    // Supplier/Courier text — that previously caused one of two
                    // reassigned orders to silently lose its data / get skipped.
                    failedGroups.push({ groupLabel, orderName, splitOrderName, error: result.reason?.message || String(result.reason), groupKey: groupEntries[idx][0] });
                }
            });

            if (failedGroups.length > 0) {
                // Enrich failedGroups with the data needed for reassignment.
                // IMPORTANT: look up groupEntries by the unique groupKey we stashed
                // above, not by the (possibly duplicate) human-readable groupLabel.
                const enrichedFailed: FailedGroup[] = failedGroups.map((fg) => {
                    const found = groupEntries.find(([gk]) => gk === fg.groupKey);
                    const groupItems = found ? found[1] : [];
                    const first = (groupItems as any[])[0] || {};
                    const splitId = splitOrderIdMap[first.id] || "";
                    const splitSR = splitId ? splitSRMap[splitId] : null;
                    const parentSR = parentSRMap[first.linkedOrderId];
                    const srShipmentId = splitSR ? splitSR.srShipmentId : (parentSR?.srShipmentId || "");
                    const monitorId = splitId || first.linkedOrderId || "";
                    const allSiblingIds = splitId
                        ? (groupItems as any[]).map((i: any) => i.id)
                        : allLineItems.filter((li: any) => li.linkedOrderId === first.linkedOrderId).map((li: any) => li.id);
                    return {
                        ...fg,
                        srShipmentId,
                        items: groupItems as any[],
                        supplierName: first.supplierName || "",
                        splitOrderId: splitId,
                        monitorId,
                        allSiblingIds,
                        supplierData: supplierDataMap[first.supplierId] || { address: "", phone: "", email: "" },
                    };
                });
                setAwbFailModal({ successGroups, failedGroups: enrichedFailed });
                return; // pause — user must decide
            }

            // All AWBs assigned — continue automatically
            showToast(`All ${successGroups.length} order(s) assigned AWB successfully!`, "positive");
            await runPhase2AndManifest(successGroups);
        } catch (e: any) {
            showToast("Processing failed: " + e.message, "negative");
            logError({
                stage: "Shipment Creation", severity: "Critical",
                message: `AWB assignment failed: ${e.message}`,
                technicalDetails: String(e?.stack || e),
                suggestedSolution: "Verify courier serviceability and Shiprocket credentials, then run Process Orders again.",
                retry: true,
            });
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Reassign courier helpers ────────────────────────────────────────────
    const fetchReassignCouriers = async (fg: FailedGroup): Promise<ReassignRowState> => {
        const first = fg.items[0];
        const pickupZip = first?.supplierPostalCode || "";
        const deliveryZip = first?.customerPostalCode || "";
        const totalWeight = fg.items.reduce((sum: number, item: any) => {
            const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCTWEIGHT);
            return sum + (parseFloat(col?.display_value || col?.text || "0") || 0);
        }, 0) || 0.5;
        const isCOD = fg.items.some((item: any) => {
            const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COD_STATUS);
            const v = col?.text || "";
            return v.toLowerCase() === "yes" || v === "1" || v === "true";
        });
        if (!pickupZip || !deliveryZip) {
            return { options: [], loading: false, error: !pickupZip ? "Supplier postal code missing" : "Customer postal code missing", selected: null };
        }
        try {
            let response: any;
            if (fg.srShipmentId) {
                response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, totalWeight, isCOD ? 1 : 0, fg.srShipmentId);
                if (!response?.data?.available_courier_companies?.length) {
                    response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, totalWeight, isCOD ? 1 : 0);
                }
            } else {
                response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, totalWeight, isCOD ? 1 : 0);
            }
            const companies: any[] = response?.data?.available_courier_companies || [];
            if (companies.length === 0) return { options: [], loading: false, error: "No couriers found for this route.", selected: null };
            const charges = companies.map((c) => c.freight_charge || 0);
            const ratings = companies.map((c) => c.rating || 0);
            const minCharge = Math.min(...charges), maxCharge = Math.max(...charges);
            const minRating = Math.min(...ratings), maxRating = Math.max(...ratings);
            const scored = companies.map((c) => {
                const normPrice = maxCharge === minCharge ? 1 : (maxCharge - c.freight_charge) / (maxCharge - minCharge);
                const normRating = maxRating === minRating ? 1 : (c.rating - minRating) / (maxRating - minRating);
                return { ...c, _score: 0.55 * normPrice + 0.45 * normRating };
            }).sort((a, b) => b._score - a._score);
            const total = scored.length;
            const options = scored.map((c, idx) => {
                const pct = total === 1 ? 0 : idx / (total - 1);
                const tag = pct <= 0.25 ? "Best" : pct <= 0.5 ? "Good" : pct <= 0.75 ? "Average" : "Poor";
                return { label: c.courier_name, value: String(c.courier_company_id), freight_charge: c.freight_charge, rating: c.rating, etd: c.etd || "-", cod_charges: c.cod_charges || 0, rto_charges: c.rto_charges || 0, tag };
            });
            return { options, loading: false, error: null, selected: null };
        } catch (e: any) {
            return { options: [], loading: false, error: "Failed to fetch couriers.", selected: null };
        }
    };

    const openReassignModal = async (successGroups: SuccessGroup[], failedGroups: FailedGroup[]) => {
        setAwbFailModal(null);
        const initialRowMap: Record<string, ReassignRowState> = {};
        failedGroups.forEach((fg) => { initialRowMap[fg.monitorId] = { options: [], loading: true, error: null, selected: null }; });
        setReassignModal({ successGroups, failedGroups, rowMap: initialRowMap, isSubmitting: false });
        const fetched = await Promise.all(failedGroups.map((fg) => fetchReassignCouriers(fg)));
        setReassignModal((prev) => {
            if (!prev) return prev;
            const newRowMap = { ...prev.rowMap };
            failedGroups.forEach((fg, i) => { newRowMap[fg.monitorId] = fetched[i]; });
            return { ...prev, rowMap: newRowMap };
        });
    };

    const handleReassignUpdate = async () => {
        if (!reassignModal) return;
        const { successGroups, failedGroups, rowMap } = reassignModal;
        setReassignModal((prev) => prev ? { ...prev, isSubmitting: true } : prev);
        const newSuccessGroups: SuccessGroup[] = [...successGroups];
        const stillFailed: FailedGroup[] = [];
        for (const fg of failedGroups) {
            const selected = rowMap[fg.monitorId]?.selected;
            if (!selected) { stillFailed.push(fg); continue; }
            try {
                const awbCode = await assignAwbForGroup(fg.srShipmentId, selected.value, fg.orderName);
                const allSiblingIds = fg.splitOrderId
                    ? fg.items.map((i: any) => i.id)
                    : allLineItems.filter((li: any) => li.linkedOrderId === fg.items[0]?.linkedOrderId).map((li: any) => li.id);
                newSuccessGroups.push({
                    groupKey: fg.monitorId,
                    items: fg.items,
                    awbCode,
                    srShipmentId: fg.srShipmentId,
                    courierId: selected.value,
                    courierName: selected.label,
                    orderName: fg.orderName,
                    splitOrderName: fg.splitOrderName,
                    supplierData: fg.supplierData,
                    supplierName: fg.supplierName,
                    splitOrderId: fg.splitOrderId,
                    monitorId: fg.monitorId,
                    allSiblingIds,
                });
            } catch (e: any) {
                stillFailed.push({ ...fg, error: e.message });
            }
        }
        if (stillFailed.length > 0) {
            const initialRowMap: Record<string, ReassignRowState> = {};
            stillFailed.forEach((fg) => { initialRowMap[fg.monitorId] = { options: [], loading: true, error: null, selected: null }; });
            setReassignModal({ successGroups: newSuccessGroups, failedGroups: stillFailed, rowMap: initialRowMap, isSubmitting: false });
            const fetched = await Promise.all(stillFailed.map((fg) => fetchReassignCouriers(fg)));
            setReassignModal((prev) => {
                if (!prev) return prev;
                const newRowMap = { ...prev.rowMap };
                stillFailed.forEach((fg, i) => { newRowMap[fg.monitorId] = fetched[i]; });
                return { ...prev, rowMap: newRowMap };
            });
        } else {
            setReassignModal(null);
            try {
                await runPhase2AndManifest(newSuccessGroups);
            } catch (e: any) {
                showToast("Processing failed: " + e.message, "negative");
                logError({
                    stage: "Manifest Generation", severity: "Critical",
                    message: `Shipment/manifest processing failed after courier reassignment: ${e.message}`,
                    technicalDetails: String(e?.stack || e),
                    suggestedSolution: "Re-check the reassigned couriers and retry Create Shipment & Manifest.",
                    retry: true,
                });
            }
        }
    };

    const handleReassignCancel = async () => {
        const awbs = (reassignModal?.successGroups || []).map((g) => g.awbCode).filter(Boolean);
        setReassignModal(null);
        if (awbs.length > 0) {
            try {
                await ShipRocketService.cancelShipmentByAwbs(awbs);
                showToast(`Rolled back ${awbs.length} AWB assignment(s).`, "positive");
            } catch (e: any) {
                showToast(`Rollback failed: ${e.message}`, "negative");
            }
        }
    };

    // ── Modal handlers ───────────────────────────────────────────────────────
    const handleAwbFailYes = async () => {
        const groups = awbFailModal!.successGroups;
        setAwbFailModal(null);
        await runPhase2AndManifest(groups);
    };

    const handleAwbFailNo = async () => {
        const awbs = (awbFailModal?.successGroups || []).map((g) => g.awbCode).filter(Boolean);
        setAwbFailModal(null);
        if (awbs.length > 0) {
            try {
                await ShipRocketService.cancelShipmentByAwbs(awbs);
                showToast(`Rolled back ${awbs.length} AWB assignment(s).`, "positive");
            } catch (e: any) {
                showToast(`Rollback failed: ${e.message}`, "negative");
            }
        }
    };


    const generateMergedLabelPDF = async (items: any[]): Promise<Blob> => {
        return generateLabelPDF(items);
    };

    const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9_(). \-]/g, "").trim();

    if (loading) return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", alignItems: "center", minHeight: 400, color: COLOR.textMuted }}>
            <Loader size={38} />
            <span style={{ fontSize: 13 }}>Loading orders for shipment…</span>
        </div>
    );

    return (
        <div style={{ padding: "24px" }}>
            {/* Blocks all interaction while shipments/manifests/labels are being generated.
                isProcessing is always false while the AWB/reassign/confirm modals are open
                (reset in the finally blocks), so this never blocks those. */}
            {isProcessing && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.55)", zIndex: 9000, cursor: "wait" }} aria-busy="true" />
            )}
            <Toast open={toast.open} type={toast.type} onClose={hideToast} autoHideDuration={15000} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, maxWidth: 440 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{toast.message}</span>
            </Toast>

            {/* AWB Failure Modal */}
            {awbFailModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "var(--ds-surface)", borderRadius: 12, padding: 28, maxWidth: 560, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
                        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: COLOR.text }}>AWB Assignment Partially Failed</h3>

                        {/* Failed orders */}
                        <div style={{ marginBottom: 20 }}>
                            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: COLOR.danger }}>
                                ✕ {awbFailModal.failedGroups.length} order(s) failed AWB assignment
                            </p>
                            <div style={{ background: "var(--ds-danger-light)", border: "1px solid var(--ds-danger-bd)", borderRadius: 8, padding: "10px 14px", maxHeight: 160, overflowY: "auto" }}>
                                {awbFailModal.failedGroups.map((g, i) => (
                                    <div key={i} style={{ marginBottom: i < awbFailModal.failedGroups.length - 1 ? 10 : 0 }}>
                                        <span style={{ fontWeight: 600, fontSize: 13, color: COLOR.text }}>{g.orderName}</span>
                                        {g.splitOrderName && (
                                            <span style={{ fontSize: 12, color: COLOR.textMuted, marginLeft: 4 }}>› {g.splitOrderName}</span>
                                        )}
                                        <span style={{ color: COLOR.textMuted, fontSize: 12, marginLeft: 6 }}>({g.groupLabel})</span>
                                        <div style={{ fontSize: 12, color: COLOR.danger, marginTop: 2 }}>{g.error}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <p style={{ margin: "0 0 20px", fontSize: 13, color: COLOR.textMuted }}>
                            {awbFailModal.successGroups.length > 0
                                ? "Would you like to continue processing the successful orders, or roll back all AWB assignments?"
                                : "No orders were assigned AWBs. Click Roll Back to reset."}
                        </p>

                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={handleAwbFailNo} style={btn("secondary")}>No, Roll Back</button>
                            <button
                                onClick={() => openReassignModal(awbFailModal.successGroups, awbFailModal.failedGroups)}
                                style={btn("danger")}
                            >
                                🔄 Reassign Courier ({awbFailModal.failedGroups.length})
                            </button>
                            {awbFailModal.successGroups.length > 0 && (
                                <button onClick={handleAwbFailYes} style={btn("primary")}>
                                    Yes, Continue ({awbFailModal.successGroups.length})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Reassign Courier Modal */}
            {reassignModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "var(--ds-surface)", borderRadius: 12, padding: 28, maxWidth: 640, width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)", maxHeight: "85vh", overflowY: "auto" }}>
                        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: COLOR.text }}>Reassign Courier for Failed Orders</h3>
                        <p style={{ margin: "0 0 18px", fontSize: 13, color: COLOR.textMuted }}>
                            Select a different courier for each failed order, then click Update.
                        </p>

                        {reassignModal.failedGroups.map((fg) => {
                            const rowState = reassignModal.rowMap[fg.monitorId];
                            return (
                                <div key={fg.monitorId} style={{ border: `1px solid ${COLOR.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 14, background: COLOR.bg }}>
                                    <div style={{ marginBottom: 8 }}>
                                        <span style={{ fontWeight: 600, fontSize: 13, color: COLOR.text }}>{fg.orderName}</span>
                                        {fg.splitOrderName && <span style={{ fontSize: 12, color: COLOR.textMuted, marginLeft: 6 }}>› {fg.splitOrderName}</span>}
                                        <span style={{ fontSize: 12, color: COLOR.textMuted, marginLeft: 6 }}>({fg.groupLabel})</span>
                                        <div style={{ fontSize: 12, color: COLOR.danger, marginTop: 3 }}>Error: {fg.error}</div>
                                    </div>
                                    {rowState?.loading ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLOR.textMuted }}>
                                            <Loader size={16} /> Loading couriers…
                                        </div>
                                    ) : (
                                        <>
                                            <Dropdown
                                                placeholder="Select a courier…"
                                                options={rowState?.options || []}
                                                value={rowState?.selected || null}
                                                onChange={(val: any) => setReassignModal((prev) => {
                                                    if (!prev) return prev;
                                                    return { ...prev, rowMap: { ...prev.rowMap, [fg.monitorId]: { ...prev.rowMap[fg.monitorId], selected: val } } };
                                                })}
                                                menuPosition="fixed" menuPlacement="auto"
                                                menuStyles={{ minWidth: 380, width: "max-content", maxWidth: 480 }}
                                                optionRenderer={(opt: any) => <CourierOptionInline label={opt.label} tag={opt.tag} freight_charge={opt.freight_charge} />}
                                                valueRenderer={(opt: any) => <CourierOptionInline label={opt.label} tag={opt.tag} freight_charge={opt.freight_charge} />}
                                            />
                                            {rowState?.error && <p style={{ margin: "4px 0 0", fontSize: 11, color: COLOR.danger }}>{rowState.error}</p>}
                                        </>
                                    )}
                                </div>
                            );
                        })}

                        {reassignModal.successGroups.length > 0 && (
                            <p style={{ fontSize: 12, color: COLOR.textMuted, margin: "0 0 16px" }}>
                                ✓ {reassignModal.successGroups.length} order(s) already assigned will continue after update.
                            </p>
                        )}

                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={handleReassignCancel} style={btn("secondary")} disabled={reassignModal.isSubmitting}>Cancel &amp; Roll Back</button>
                            <button
                                onClick={handleReassignUpdate}
                                disabled={reassignModal.isSubmitting || reassignModal.failedGroups.some((fg) => !reassignModal.rowMap[fg.monitorId]?.selected)}
                                style={btn("primary", reassignModal.isSubmitting || reassignModal.failedGroups.some((fg) => !reassignModal.rowMap[fg.monitorId]?.selected))}
                            >
                                {reassignModal.isSubmitting ? "Assigning…" : `Update (${reassignModal.failedGroups.length})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    <h3 style={sectionTitle}>Generate Supplier Manifests</h3>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: COLOR.textMuted }}>Assign AWB numbers and generate manifests for selected orders</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    {/* The validation reason (e.g. "Select items to process.") is now shown
                        as a hover tooltip on the button instead of as helper text below it. */}
                    <span title={processValidation.reason}>
                        <Button
                            disabled={!processValidation.isValid || isProcessing}
                            loading={isProcessing}
                            onClick={handleProcessOrders}
                        >
                            Process Orders{selectedOrderCount > 0 ? ` (${selectedOrderCount})` : ""}
                        </Button>
                    </span>
                </div>
            </div>

            {/* Filter panel */}
            <div style={{ ...filterBar, marginBottom: 16, zIndex: 20 }}>
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

            {/* Process Error Panel */}
            {processErrors.length > 0 && (
                <div style={{ background: "var(--ds-danger-light)", border: "1px solid var(--ds-danger-bd)", borderRadius: 6, padding: "16px", marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ds-danger)" }}>⚠️ {processErrors.length} error(s) during processing</span>
                        <button onClick={() => setProcessErrors([])} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "var(--ds-text-faint)", lineHeight: 1 }}>✕</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: "var(--ds-danger-light)" }}>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid var(--ds-danger-bd)", fontWeight: 600, color: "var(--ds-text)" }}>Group</th>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid var(--ds-danger-bd)", fontWeight: 600, color: "var(--ds-text)" }}>Step</th>
                                <th style={{ padding: "8px 12px", textAlign: "left", border: "1px solid var(--ds-danger-bd)", fontWeight: 600, color: "var(--ds-text)" }}>Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processErrors.map((err, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "var(--ds-surface)" : "var(--ds-danger-light)" }}>
                                    <td style={{ padding: "8px 12px", border: "1px solid var(--ds-danger-bd)", color: "var(--ds-text)" }}>{err.group}</td>
                                    <td style={{ padding: "8px 12px", border: "1px solid var(--ds-danger-bd)", color: "var(--ds-text-muted)", whiteSpace: "nowrap" }}>{err.step}</td>
                                    <td style={{ padding: "8px 12px", border: "1px solid var(--ds-danger-bd)", color: "var(--ds-danger)", wordBreak: "break-word", maxWidth: 400 }}>{err.error}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Table */}
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: `1px solid ${COLOR.border}`, borderRadius: 10, marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
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
                                {itemColumns.map((c) => <th key={c.label} style={thStyle}>{c.label}</th>)}
                                <th style={thStyle}>Supplier</th>
                                <th style={thStyle}>Courier</th>
                                {groupColumns.map((c) => <th key={c.label} style={thStyle}>{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {allLineItems.length > 0 ? paginatedLineItems.map((item: any) => {
                                const orderSpan = orderSpans[item.id];
                                const sharedSpan = sharedSpans[item.id];
                                const splitId = getSplitOrderId(item);
                                const isSplit = !!splitId;
                                const splitName = isSplit
                                    ? (item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS)?.display_value || splitId)
                                    : "-";

                                // Checkbox: per split group for split items; per order for normal items
                                const checkboxItems = splitId
                                    ? paginatedLineItems.filter((i: any) => getSplitOrderId(i) === splitId)
                                    : paginatedLineItems.filter((i: any) => i.linkedOrderId === item.linkedOrderId && !getSplitOrderId(i));
                                const checkboxChecked = checkboxItems.every((i: any) => selectedLineItemIds.has(i.id));
                                const checkboxIndeterminate = checkboxItems.some((i: any) => selectedLineItemIds.has(i.id)) && !checkboxChecked;

                                return (
                                <tr key={item.id}
                                    onMouseEnter={(e) => { if (!selectedLineItemIds.has(item.id)) e.currentTarget.style.backgroundColor = "var(--ds-bg-header)"; }}
                                    onMouseLeave={(e) => { if (!selectedLineItemIds.has(item.id)) e.currentTarget.style.backgroundColor = COLOR.white; }}
                                    style={{ backgroundColor: selectedLineItemIds.has(item.id) ? COLOR.primaryLight : COLOR.white, transition: "background 0.15s" }}>
                                    {/* Checkbox — per split group (or per order for non-split) */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...tdStyle, width: 36, minWidth: 36, padding: "8px 4px", verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                                <IndeterminateCheckbox
                                                    checked={checkboxChecked}
                                                    indeterminate={checkboxIndeterminate}
                                                    onChange={() => {
                                                        const next = new Set(selectedLineItemIds);
                                                        checkboxChecked
                                                            ? checkboxItems.forEach((i: any) => next.delete(i.id))
                                                            : checkboxItems.forEach((i: any) => next.add(i.id));
                                                        setSelectedLineItemIds(next);
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    )}
                                    {/* Order — order-group span */}
                                    {orderSpan !== 0 && (
                                        <td style={{ ...tdStyle, verticalAlign: "middle", fontWeight: 600 }} rowSpan={orderSpan > 1 ? orderSpan : undefined}>
                                            {orderColumn.render(item)}
                                        </td>
                                    )}
                                    {/* Split Order — shared span */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...tdStyle, verticalAlign: "middle", fontWeight: isSplit ? 500 : undefined }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {splitName}
                                        </td>
                                    )}
                                    {/* Item Name — per row */}
                                    <td style={{ ...tdStyle, textAlign: "left" }}>{item.name}</td>
                                    {/* Per-item columns (SKU, Weight) — per row */}
                                    {itemColumns.map((c) => (
                                        <td key={c.label} style={tdStyle}>{c.render(item)}</td>
                                    ))}
                                    {/* Supplier — shared span */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...tdStyle, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {item.supplierName || "-"}
                                        </td>
                                    )}
                                    {/* Courier — shared span */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...tdStyle, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {item.courierName || "-"}
                                        </td>
                                    )}
                                    {/* Per-group columns — shared span with badges */}
                                    {sharedSpan !== 0 && groupColumns.map((c) => {
                                        const val = c.render(item);
                                        let content: React.ReactNode;
                                        if (c.label === "Status") {
                                            const t = val === "Manifest Generated" ? "success" : "neutral";
                                            content = <span style={badge(t)}>{val}</span>;
                                        } else if (c.label === "Shipped") {
                                            content = <span style={badge(val === "Yes" ? "success" : "neutral")}>{val}</span>;
                                        } else if (c.label === "COD") {
                                            content = <span style={badge(val === "Yes" ? "warning" : "neutral")}>{val}</span>;
                                        } else {
                                            content = val;
                                        }
                                        return (
                                            <td key={c.label} style={{ ...tdStyle, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                                {content}
                                            </td>
                                        );
                                    })}
                                </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={1 + 1 + 1 + 1 + itemColumns.length + 1 + 1 + groupColumns.length} style={{ padding: "48px 24px", textAlign: "center", color: COLOR.textMuted }}>
                                        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--ds-neutral-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 24 }}>📄</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.text, marginBottom: 3 }}>No line items</div>
                                        <div style={{ fontSize: 13 }}>
                                            {selectedOrderFilter || selectedSupplierFilter || selectedCourierFilter || selectedSkuFilter
                                                ? "No line items match the selected filters — try clearing them."
                                                : "No line items to display."}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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
                    <div style={{ background: "var(--ds-surface)", borderRadius: 8, padding: "32px", maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
                        <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>Finish &amp; Reset</h3>
                        <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--ds-text-muted)" }}>Are you sure you want to finish and reset? This will clear all selected orders.</p>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <button onClick={() => setShowConfirm(false)} style={btn("secondary")}>Cancel</button>
                            <button onClick={() => { setShowConfirm(false); onNext(); }} style={btn("primary")}>Finish &amp; Reset</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom nav */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.borderLight}` }}>
                <Btn variant="secondary" onClick={onPrev}>← Back to Couriers</Btn>
                <Btn variant="primary" onClick={() => setShowConfirm(true)}>Finish &amp; Reset →</Btn>
            </div>
        </div>
    );
};