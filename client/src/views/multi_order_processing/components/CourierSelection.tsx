import React, { useState, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { Dropdown, Button, Loader, Toast } from "@vibe/core";
import { useToast } from "../hooks/useToast";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import { ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, ORDERLINEITEMS_COLUMNS, titleMapOf } from "../columns";
import { ORDER_ITEM_BOARD_ID } from "../boardIds";
import { logError } from "../utils/logError";
import { aiRank, applyAiRanking } from "../utils/aiRank";
import ShipRocketService from "../../../services/shiprocketCourier";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import mondaySdk from "monday-sdk-js";
import { btn, TH, TD, filterBar, sectionTitle, paginationBtn, COLOR, badge } from "../styles";
import { Btn } from "./Btn";

const monday = mondaySdk();

const DEFAULT_COURIER = { label: "SP Store (Self)", value: "SP Store (Self)", freight_charge: 0, rating: 0, etd: "-", cod_charges: 0, rto_charges: 0, tag: "Best" };

const TAG_STYLES: Record<string, React.CSSProperties> = {
    Best:    { background: "var(--ds-success-light)", color: "var(--ds-success)", border: "1px solid var(--ds-success-bd)" },
    Good:    { background: "var(--ds-primary-light)", color: "var(--ds-primary)", border: "1px solid var(--ds-info-bd)" },
    Average: { background: "var(--ds-warning-light)", color: "var(--ds-warning)", border: "1px solid var(--ds-warning-bd)" },
    Poor:    { background: "var(--ds-danger-light)",  color: "var(--ds-danger)",  border: "1px solid var(--ds-danger-bd)" },
};

const CourierOption = ({ label, tag, freight_charge, rating, etd, cod_charges, rto_charges, aiReason }: any) => {
    const [tooltip, setTooltip] = React.useState<{ x: number; y: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    const showTooltip = () => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        setTooltip({ x: rect.left, y: rect.top });
    };

    const hasDetails = (freight_charge !== undefined) || (rating && rating > 0) || (etd && etd !== "-") || (cod_charges > 0) || (rto_charges > 0) || !!aiReason;

    return (
        <div
            ref={ref}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 0", width: "100%" }}
            onMouseEnter={showTooltip}
            onMouseLeave={() => setTooltip(null)}
        >
            <span style={{ fontSize: 13, color: "var(--ds-text)", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {freight_charge !== undefined && (
                    <span style={{ fontSize: 11, color: "var(--ds-text-muted)", whiteSpace: "nowrap" }}>₹{freight_charge}</span>
                )}
                {aiReason && <span title={`AI: ${aiReason}`} style={{ fontSize: 11 }}>✨</span>}
                {tag && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, ...TAG_STYLES[tag] }}>{tag}</span>
                )}
            </div>
            {tooltip && hasDetails && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: tooltip.y - 8,
                    left: tooltip.x,
                    transform: "translateY(-100%)",
                    zIndex: 99999,
                    background: "var(--ds-surface)",
                    border: "1px solid var(--ds-border-light)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
                    pointerEvents: "none",
                    minWidth: 200,
                }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ds-text)", marginBottom: 8, borderBottom: "1px solid var(--ds-border-light)", paddingBottom: 6 }}>
                        {label}
                        {tag && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, ...TAG_STYLES[tag] }}>{tag}</span>}
                    </div>
                    {aiReason && (
                        <div style={{ fontSize: 11.5, color: "var(--ds-primary)", marginBottom: 8, lineHeight: 1.4 }}>✨ {aiReason}</div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {freight_charge !== undefined && (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Freight</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text)" }}>₹{freight_charge}</span>
                            </div>
                        )}
                        {rating !== undefined && rating > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Rating</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text)" }}>⭐ {rating}</span>
                            </div>
                        )}
                        {etd && etd !== "-" && (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Est. Delivery</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text)" }}>{etd}</span>
                            </div>
                        )}
                        {cod_charges > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>COD Charges</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text)" }}>₹{cod_charges}</span>
                            </div>
                        )}
                        {rto_charges > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                <span style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>RTO Charges</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-danger)" }}>₹{rto_charges}</span>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};


interface RowCourierState {
    options: any[];
    loading: boolean;
    error: string | null;
    selected: any;
}

const formatNumeric = (raw: string): string => {
    if (!raw) return "";
    const n = parseFloat(raw);
    return !isNaN(n) ? String(n) : raw;
};

const getRobustValue = (column_values: any[], colId: string): string => {
    const cv = column_values?.find((c: any) => c.id === colId);
    if (!cv) return "";
    if (cv.display_value) return cv.display_value;
    if (cv.text) return cv.text;
    if (cv.value) {
        try {
            const parsed = JSON.parse(cv.value);
            return typeof parsed === "object" ? parsed.value || parsed.text || "" : String(parsed);
        } catch { return cv.value; }
    }
    return "";
};

export const CourierSelection = ({
    selectedOrderIds,
    onPrev,
    onNext,
}: {
    selectedOrderIds: string[];
    onPrev: () => void;
    onNext: () => void;
}) => {
    const { loading, lineItems, refetch } = useCourierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();
    const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
    const [isUpdating, setIsUpdating] = useState(false);
    const [rowCourierMap, setRowCourierMap] = useState<Record<string, RowCourierState>>({});
    const [selectedOrderFilter, setSelectedOrderFilter] = useState<any>(null);
    const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<any>(null);
    const [selectedProductFilter, setSelectedProductFilter] = useState<any>(null);
    const [selectedCourierFilter, setSelectedCourierFilter] = useState<any>(null);
    const [selectedSkuFilter, setSelectedSkuFilter] = useState<any>(null);
    const [selectedStatusFilter, setSelectedStatusFilter] = useState<any>(null);
    const [selectedPickupPostalFilter, setSelectedPickupPostalFilter] = useState<any>(null);
    const [selectedDeliveryPostalFilter, setSelectedDeliveryPostalFilter] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showFilters, setShowFilters] = useState(false);

    const resetFilters = () => {
        setSelectedOrderFilter(null); setSelectedSupplierFilter(null); setSelectedProductFilter(null);
        setSelectedCourierFilter(null); setSelectedSkuFilter(null); setSelectedStatusFilter(null);
        setSelectedPickupPostalFilter(null); setSelectedDeliveryPostalFilter(null);
        setSelectedRowIds(new Set()); setCurrentPage(1);
    };

    const orderOptions = useMemo(() => {
        const map = new Map<string, string>();
        lineItems.forEach((item) => {
            if (item.linkedOrderId && item.orderName) map.set(item.linkedOrderId, item.orderName);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
    }, [lineItems]);

    const supplierOptions = useMemo(() => {
        const base = selectedOrderFilter ? lineItems.filter((i) => i.linkedOrderId === selectedOrderFilter.value) : lineItems;
        const map = new Map<string, string>();
        base.forEach((i) => { if (i.supplierId && i.supplierName) map.set(i.supplierId, i.supplierName); });
        return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
    }, [lineItems, selectedOrderFilter]);

    const productOptions = useMemo(() => {
        const map = new Map<string, string>();
        lineItems.forEach((i) => {
            const col = i.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT);
            const name = col?.display_value?.trim();
            const id = col?.linked_item_ids?.[0];
            if (id && name) map.set(id, name);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
    }, [lineItems]);

    const courierFilterOptions = useMemo(() => {
        const set = new Set<string>();
        lineItems.forEach((i) => { if (i.courierName?.trim()) set.add(i.courierName.trim()); });
        return Array.from(set).map((c) => ({ value: c, label: c }));
    }, [lineItems]);

    const skuOptions = useMemo(() => {
        const set = new Set<string>();
        lineItems.forEach((i) => {
            const sku = i.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU)?.text?.trim();
            if (sku) set.add(sku);
        });
        return Array.from(set).map((s) => ({ value: s, label: s }));
    }, [lineItems]);

    const statusOptions = useMemo(() => {
        const set = new Set<string>();
        lineItems.forEach((i) => {
            const s = i.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS)?.text?.trim();
            if (s) set.add(s);
        });
        return Array.from(set).map((s) => ({ value: s, label: s }));
    }, [lineItems]);

    const pickupPostalOptions = useMemo(() => {
        const set = new Set<string>();
        lineItems.forEach((i) => { if (i.supplierPostalCode?.trim()) set.add(i.supplierPostalCode.trim()); });
        return Array.from(set).map((s) => ({ value: s, label: s }));
    }, [lineItems]);

    const deliveryPostalOptions = useMemo(() => {
        const set = new Set<string>();
        lineItems.forEach((i) => { if (i.customerPostalCode?.trim()) set.add(i.customerPostalCode.trim()); });
        return Array.from(set).map((s) => ({ value: s, label: s }));
    }, [lineItems]);

    const displayedLineItems = useMemo(() => {
        let items = lineItems;
        if (selectedOrderFilter)        items = items.filter((i) => i.linkedOrderId === selectedOrderFilter.value);
        if (selectedSupplierFilter)     items = items.filter((i) => i.supplierId === selectedSupplierFilter.value);
        if (selectedProductFilter)      items = items.filter((i) => {
            const col = i.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT);
            return col?.linked_item_ids?.[0] === selectedProductFilter.value;
        });
        if (selectedCourierFilter)      items = items.filter((i) => i.courierName?.trim() === selectedCourierFilter.value);
        if (selectedSkuFilter)          items = items.filter((i) => {
            const sku = i.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU)?.text?.trim();
            return sku === selectedSkuFilter.value;
        });
        if (selectedStatusFilter)       items = items.filter((i) => {
            const s = i.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS)?.text?.trim();
            return s === selectedStatusFilter.value;
        });
        if (selectedPickupPostalFilter)  items = items.filter((i) => i.supplierPostalCode?.trim() === selectedPickupPostalFilter.value);
        if (selectedDeliveryPostalFilter) items = items.filter((i) => i.customerPostalCode?.trim() === selectedDeliveryPostalFilter.value);
        return items;
    }, [lineItems, selectedOrderFilter, selectedSupplierFilter, selectedProductFilter, selectedCourierFilter,
        selectedSkuFilter, selectedStatusFilter, selectedPickupPostalFilter, selectedDeliveryPostalFilter]);

    const hasActiveFilters = selectedOrderFilter || selectedSupplierFilter || selectedProductFilter ||
        selectedCourierFilter || selectedSkuFilter || selectedStatusFilter ||
        selectedPickupPostalFilter || selectedDeliveryPostalFilter;

    const getSplitOrderId = (item: any): string => {
        const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
        return col?.linked_item_ids?.[0] || "";
    };
    // Human split name (e.g. "ORD-0001-S2") — used to order splits S1, S2, S3… correctly.
    const getSplitOrderName = (item: any): string => {
        const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
        return col?.display_value || "";
    };

    // rowKey = splitOrderId for split items, parentOrderId for non-split
    // Non-split items in the same order share one courier dropdown and one checkbox.
    const getRowKey = (item: any): string => getSplitOrderId(item) || item.linkedOrderId || item.id;

    const sortedDisplayedLineItems = useMemo(() => [...displayedLineItems].sort((a, b) => {
        const oCmp = (a.orderName || "").localeCompare(b.orderName || "", undefined, { numeric: true });
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
    }), [displayedLineItems]);

    const totalPages = Math.ceil(sortedDisplayedLineItems.length / pageSize) || 1;
    const paginatedLineItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedDisplayedLineItems.slice(start, start + pageSize);
    }, [sortedDisplayedLineItems, currentPage, pageSize]);

    // orderSpans: rowSpan by linked order
    // sharedSpans: rowSpan for all shared columns — groups split items by split-group and
    //   groups ALL consecutive non-split items in the same order together, so columns like
    //   COD, Postal, Supplier, Status, and the Courier dropdown each render only once.
    const { orderSpans, sharedSpans } = useMemo(() => {
        const orderSpans: Record<string, number> = {};
        const sharedSpans: Record<string, number> = {};
        let i = 0;
        while (i < paginatedLineItems.length) {
            const orderId = paginatedLineItems[i].linkedOrderId;
            let j = i;
            while (j < paginatedLineItems.length && paginatedLineItems[j].linkedOrderId === orderId) j++;
            orderSpans[paginatedLineItems[i].id] = j - i;
            for (let k = i + 1; k < j; k++) orderSpans[paginatedLineItems[k].id] = 0;
            let m = i;
            while (m < j) {
                const splitId = getSplitOrderId(paginatedLineItems[m]);
                if (splitId) {
                    let n = m;
                    while (n < j && getSplitOrderId(paginatedLineItems[n]) === splitId) n++;
                    sharedSpans[paginatedLineItems[m].id] = n - m;
                    for (let k = m + 1; k < n; k++) sharedSpans[paginatedLineItems[k].id] = 0;
                    m = n;
                } else {
                    // Group all consecutive non-split items in this order under one shared span.
                    let n = m;
                    while (n < j && !getSplitOrderId(paginatedLineItems[n])) n++;
                    sharedSpans[paginatedLineItems[m].id] = n - m;
                    for (let k = m + 1; k < n; k++) sharedSpans[paginatedLineItems[k].id] = 0;
                    m = n;
                }
            }
            i = j;
        }
        return { orderSpans, sharedSpans };
    }, [paginatedLineItems]);

    // Auto-fetch couriers once per unique rowKey (one fetch per split order, one per non-split item)
    useEffect(() => {
        if (lineItems.length === 0) return;
        const groups = new Map<string, any[]>();
        lineItems.forEach((item: any) => {
            const key = getRowKey(item);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        });
        groups.forEach((items, key) => {
            if (rowCourierMap[key]) return;
            fetchCouriersForKey(key, items);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineItems]);

    // Auto-populate courier dropdown if already set
    useEffect(() => {
        const groups = new Map<string, any[]>();
        lineItems.forEach((item: any) => {
            const key = getRowKey(item);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        });
        groups.forEach((items, key) => {
            const rowState = rowCourierMap[key];
            if (!rowState || rowState.loading || rowState.selected) return;
            const first = items[0];
            const existingCourierName = first.courierName?.trim();
            const existingCourierId = first.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID)?.text?.trim();
            if (existingCourierName || existingCourierId) {
                const matching = rowState.options.find((opt: any) =>
                    opt.label === existingCourierName || opt.value === existingCourierId
                );
                if (matching) {
                    setRowCourierMap((prev) => ({ ...prev, [key]: { ...prev[key], selected: matching } }));
                } else if (existingCourierName) {
                    const opt = { label: existingCourierName, value: existingCourierId || existingCourierName };
                    setRowCourierMap((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], options: [opt, ...prev[key].options], selected: opt },
                    }));
                }
            }
        });
    }, [lineItems, rowCourierMap]);

    const fetchCouriersForKey = async (key: string, items: any[]) => {
        const first = items[0];
        const srShipmentId: string = first.srShipmentId || "";
        const pickupZip = first.supplierPostalCode;
        const deliveryZip = first.customerPostalCode;
        const totalWeight = items.reduce((sum: number, item: any) =>
            sum + (parseFloat(getRobustValue(item.column_values, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCTWEIGHT) || "0") || 0), 0) || 0.5;
        const isCOD = items.some((item: any) => {
            const v = getRobustValue(item.column_values, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COD_STATUS);
            return v?.toLowerCase() === "yes" || v === "1" || v === "true";
        });

        setRowCourierMap((prev) => ({ ...prev, [key]: { options: [], loading: true, error: null, selected: null } }));

        if (!pickupZip || !deliveryZip) {
            const error = !pickupZip ? "Supplier postal code missing" : "Customer postal code missing";
            setRowCourierMap((prev) => ({ ...prev, [key]: { options: [DEFAULT_COURIER], loading: false, error, selected: null } }));
            return;
        }

        try {
            // Prefer shipment-based serviceability (matches exactly what AWB assignment validates).
            // Fall back to pincode-based if the shipment ID is stale/cancelled and returns no results.
            let response: any;
            if (srShipmentId) {
                response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, totalWeight, isCOD ? 1 : 0, srShipmentId);
                if (!(response?.data?.available_courier_companies?.length)) {
                    response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, totalWeight, isCOD ? 1 : 0);
                }
            } else {
                response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, totalWeight, isCOD ? 1 : 0);
            }
            const companies: any[] = response?.data?.available_courier_companies || [];

            if (companies.length === 0) {
                setRowCourierMap((prev) => ({ ...prev, [key]: { options: [DEFAULT_COURIER], loading: false, error: "No couriers found for this route.", selected: DEFAULT_COURIER } }));
                return;
            }

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

            setRowCourierMap((prev) => ({ ...prev, [key]: { options, loading: false, error: null, selected: options.length === 1 ? options[0] : null } }));
        } catch (e: any) {
            setRowCourierMap((prev) => ({ ...prev, [key]: { options: [DEFAULT_COURIER], loading: false, error: "Failed to fetch couriers.", selected: DEFAULT_COURIER } }));
        }
    };

    // ── AI ranking (progressive enhancement) ──────
    // Re-ranks each loaded row's courier options via monday AI, overlaying the AI order + tags.
    // Best-effort: rows the AI can't rank keep their existing (weighted) order, so nothing breaks.
    const [aiRanking, setAiRanking] = useState(false);
    const handleAiRankAll = async () => {
        if (aiRanking) return;
        setAiRanking(true);
        try {
            const keys = Object.keys(rowCourierMap).filter((k) => {
                const s = rowCourierMap[k];
                return s && !s.loading && s.options.length > 1;
            });
            let applied = 0;
            await Promise.all(keys.map(async (key) => {
                const opts = rowCourierMap[key].options;
                const items = opts
                    .filter((o: any) => o.value !== "SP Store (Self)")
                    .map((o: any) => ({ id: String(o.value), label: o.label, price: o.freight_charge, rating: o.rating, etd: o.etd, codCharges: o.cod_charges, rtoCharges: o.rto_charges }));
                const ranking = await aiRank("courier", items);
                if (!ranking) return;
                applied++;
                setRowCourierMap((prev) => {
                    const st = prev[key];
                    if (!st) return prev;
                    return { ...prev, [key]: { ...st, options: applyAiRanking(st.options, ranking) } };
                });
            }));
            showToast(applied > 0 ? "Couriers re-ranked by AI." : "AI ranking is unavailable (needs a monday Pro/Enterprise plan with AI).", applied > 0 ? "positive" : "negative");
        } catch {
            showToast("AI ranking failed. Showing standard ranking.", "negative");
        } finally {
            setAiRanking(false);
        }
    };

    const handleSelectBestForAll = () => {
        setRowCourierMap((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
                const state = next[key];
                if (!state || state.loading || !state.options.length) continue;
                const best = state.options.find((o: any) => o.tag === "Best") || state.options[0];
                if (best) next[key] = { ...state, selected: best };
            }
            return next;
        });
        // Auto-check all rows that have loaded options so user can immediately hit Update Courier
        const selectableKeys = new Set(
            lineItems
                .map((item: any) => getRowKey(item))
                .filter((key: string) => {
                    const state = rowCourierMap[key];
                    return state && !state.loading && state.options.length > 0;
                })
        );
        setSelectedRowIds(selectableKeys);
    };

    const hasBestSelectableRows = useMemo(() =>
        Object.keys(rowCourierMap).some((k) => { const s = rowCourierMap[k]; return !s.loading && s.options.length > 0; })
    , [rowCourierMap]);

    const canUpdate = useMemo(() => {
        if (selectedRowIds.size === 0) return false;
        return Array.from<string>(selectedRowIds).every((rowId) => {
            const item = lineItems.find((i: any) => getRowKey(i) === rowId);
            if (!item) return false;
            return !!item.supplierName?.trim() && (!!rowCourierMap[rowId]?.selected || !!item.courierName?.trim());
        });
    }, [selectedRowIds, rowCourierMap, lineItems]);

    const handleUpdateCourier = async () => {
        if (!canUpdate) return;
        setIsUpdating(true);
        try {
            // Build groups so all items sharing a rowKey get the same courier
            const groups = new Map<string, any[]>();
            lineItems.forEach((item: any) => {
                const key = getRowKey(item);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(item);
            });

            await Promise.all(
                Array.from<string>(selectedRowIds).map(async (rowId) => {
                    const items = groups.get(rowId) || [];
                    if (items.length === 0) return;
                    const rowState = rowCourierMap[rowId];
                    const first = items[0];
                    const courier = rowState?.selected || (first.courierName
                        ? { label: first.courierName, value: first.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID)?.text || first.courierName }
                        : null);
                    if (!courier) return;

                    // Build column_values only from columns that actually resolved on the
                    // board. If any is missing (its title in columns.ts doesn't match the
                    // real board), fail with a clear message naming the exact column title
                    // instead of monday's cryptic InvalidColumnIdException / column_id:"".
                    const liTitles = titleMapOf(ORDERLINEITEMS_COLUMNS);
                    const wanted: Record<string, any> = {
                        COURIERID: courier.value,
                        COURIERNAME: courier.label,
                        STATUS: { label: "Courier Selected" },
                    };
                    const columnValues: Record<string, any> = {};
                    const missing: string[] = [];
                    for (const key of Object.keys(wanted)) {
                        const colId = ORDERLINEITEMS_ALL_COLUMN_IDS_MAP[key];
                        if (colId) columnValues[colId] = wanted[key];
                        else missing.push(liTitles[key] || key);
                    }
                    if (missing.length) {
                        throw new Error(
                            `These columns weren't found on the Order Line Items board — ` +
                            `check the exact column title(s): "${missing.join('", "')}"`
                        );
                    }
                    await Promise.all(items.map((item: any) =>
                        monday.api(`mutation {
                            change_multiple_column_values(
                                item_id: ${item.id},
                                board_id: ${ORDER_ITEM_BOARD_ID},
                                column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                            ) { id }
                        }`)
                    ));
                })
            );
            await refetch();
            showToast("Couriers updated successfully!", "positive");
            monday.execute("valueCreatedForUser"); // monday activation signal
            setSelectedRowIds(new Set());
        } catch (e: any) {
            showToast(`Update failed: ${e.message}`, "negative");
            logError({
                stage: "Courier Selection", severity: "Error",
                message: `Courier update failed: ${e.message}`,
                technicalDetails: String(e?.stack || e),
                suggestedSolution: "Re-check the selected orders and courier assignment, then try updating again.",
                retry: true,
            });
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", alignItems: "center", minHeight: 400, color: COLOR.textMuted }}>
            <Loader size={38} />
            <span style={{ fontSize: 13 }}>Loading shipments & courier options…</span>
        </div>
    );

    const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };

    return (
        <div>
            <Toast open={toast.open} type={toast.type} onClose={hideToast} autoHideDuration={4000} className="mop-toast">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{toast.message}</span>
            </Toast>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    <h3 style={sectionTitle}>Courier Selection</h3>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: COLOR.textMuted }}>Assign couriers to each line item</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => setShowFilters((v) => !v)}
                            style={{ ...btn(showFilters || !!hasActiveFilters ? "primary" : "secondary"), padding: "9px 16px" }}
                        >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
                                <path d="M1.5 2.5A.5.5 0 0 1 2 2h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.146.354l-4.5 4.5V13.5a.5.5 0 0 1-.724.447l-2-1A.5.5 0 0 1 7 12.5V9.354l-4.5-4.5A.5.5 0 0 1 2 4.5v-2z" />
                            </svg>
                            Filters{hasActiveFilters ? ` (${[selectedOrderFilter, selectedSupplierFilter, selectedProductFilter, selectedCourierFilter, selectedSkuFilter, selectedStatusFilter, selectedPickupPostalFilter, selectedDeliveryPostalFilter].filter(Boolean).length})` : ""}
                        </button>
                        <button
                            onClick={handleSelectBestForAll}
                            disabled={!hasBestSelectableRows || isUpdating}
                            style={{
                                ...btn("secondary"),
                                display: "flex", alignItems: "center", gap: 6,
                                borderColor: hasBestSelectableRows ? "var(--ds-warning)" : undefined,
                                color: hasBestSelectableRows ? "var(--ds-warning)" : undefined,
                                background: hasBestSelectableRows ? "var(--ds-warning-light)" : undefined,
                            }}
                        >
                            ⭐ Select Best for All
                        </button>
                        <button
                            onClick={handleAiRankAll}
                            disabled={!hasBestSelectableRows || aiRanking || isUpdating}
                            title="Re-rank couriers using monday AI"
                            style={{
                                ...btn("secondary"),
                                display: "flex", alignItems: "center", gap: 6,
                                borderColor: hasBestSelectableRows ? "var(--ds-primary)" : undefined,
                                color: hasBestSelectableRows ? "var(--ds-primary)" : undefined,
                                background: hasBestSelectableRows ? "var(--ds-primary-light)" : undefined,
                            }}
                        >
                            ✨ {aiRanking ? "Ranking…" : "AI Rank"}
                        </button>
                        <Button disabled={!canUpdate || isUpdating} loading={isUpdating} onClick={handleUpdateCourier}>
                            Update Courier{selectedRowIds.size > 0 ? ` (${selectedRowIds.size})` : ""}
                        </Button>
                    </div>
                    {selectedRowIds.size > 0 && !canUpdate && (
                        <p style={{ margin: 0, fontSize: 12, color: COLOR.danger }}>
                            {Array.from<string>(selectedRowIds).some((rowId) => !lineItems.find((i: any) => getRowKey(i) === rowId)?.supplierName?.trim())
                                ? "Supplier and courier must be selected for each checked row"
                                : "Select a courier for each checked row"}
                        </p>
                    )}
                </div>
            </div>

            {/* Filter panel */}
            {showFilters && <div style={{ marginBottom: 16 }}>
                {/* Row 1 */}
                <div style={{ ...filterBar, marginBottom: 8, zIndex: 22 }}>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>Order</label>
                        <Dropdown placeholder="All Orders" options={orderOptions} value={selectedOrderFilter}
                            onChange={(val: any) => { setSelectedOrderFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>Supplier</label>
                        <Dropdown placeholder="All Suppliers" options={supplierOptions} value={selectedSupplierFilter}
                            onChange={(val: any) => { setSelectedSupplierFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>Product</label>
                        <Dropdown placeholder="All Products" options={productOptions} value={selectedProductFilter}
                            onChange={(val: any) => { setSelectedProductFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>Courier</label>
                        <Dropdown placeholder="All Couriers" options={courierFilterOptions} value={selectedCourierFilter}
                            onChange={(val: any) => { setSelectedCourierFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                </div>
                {/* Row 2 */}
                <div style={{ ...filterBar, marginBottom: 0, zIndex: 20 }}>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>SKU</label>
                        <Dropdown placeholder="All SKUs" options={skuOptions} value={selectedSkuFilter}
                            onChange={(val: any) => { setSelectedSkuFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>Status</label>
                        <Dropdown placeholder="All Statuses" options={statusOptions} value={selectedStatusFilter}
                            onChange={(val: any) => { setSelectedStatusFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>Pickup Postal</label>
                        <Dropdown placeholder="All" options={pickupPostalOptions} value={selectedPickupPostalFilter}
                            onChange={(val: any) => { setSelectedPickupPostalFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                    <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                        <label style={labelStyle}>Delivery Postal</label>
                        <Dropdown placeholder="All" options={deliveryPostalOptions} value={selectedDeliveryPostalFilter}
                            onChange={(val: any) => { setSelectedDeliveryPostalFilter(val); setSelectedRowIds(new Set()); setCurrentPage(1); }} />
                    </div>
                    {hasActiveFilters && (
                        <button onClick={resetFilters} style={{ ...btn("ghost"), alignSelf: "flex-end", marginBottom: 2 }}>
                            ✕ Clear All
                        </button>
                    )}
                </div>
            </div>}

            {/* Table */}
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: `1px solid ${COLOR.border}`, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                    <thead>
                        <tr>
                            <th style={{ ...TH, width: 36, minWidth: 36, padding: "9px 4px" }}>
                                <IndeterminateCheckbox
                                    checked={paginatedLineItems.length > 0 && [...new Set(paginatedLineItems.map(getRowKey))].every((k) => selectedRowIds.has(k))}
                                    indeterminate={(() => { const keys = [...new Set(paginatedLineItems.map(getRowKey))]; return keys.some((k) => selectedRowIds.has(k)) && !keys.every((k) => selectedRowIds.has(k)); })()}
                                    onChange={() => {
                                        const keys = [...new Set(paginatedLineItems.map(getRowKey))];
                                        const allSel = keys.every((k) => selectedRowIds.has(k));
                                        const next = new Set(selectedRowIds);
                                        keys.forEach((k) => allSel ? next.delete(k) : next.add(k));
                                        setSelectedRowIds(next);
                                    }}
                                />
                            </th>
                            <th style={TH}>Order</th>
                            <th style={TH}>Split Order</th>
                            {["Product Name","SKU","Weight","COD","Pickup Postal","Delivery Postal","Supplier","Current Courier","Status"].map(h => <th key={h} style={TH}>{h}</th>)}
                            <th style={{ ...TH, minWidth: 400 }}>Courier</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedDisplayedLineItems.length > 0 ? paginatedLineItems.map((item) => {
                            const rowKey = getRowKey(item);
                            const rowState = rowCourierMap[rowKey];
                            const splitId = getSplitOrderId(item);
                            const isSplit = !!splitId;
                            const splitName = isSplit
                                ? (item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS)?.display_value || splitId)
                                : "-";
                            const skuCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU);
                            const statusCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS);
                            const statusText = statusCol?.text || "-";
                            const orderSpan = orderSpans[item.id];
                            const sharedSpan = sharedSpans[item.id]; // used for all shared cols

                            return (
                                <tr key={item.id}
                                    onMouseEnter={(e) => { if (!selectedRowIds.has(rowKey)) e.currentTarget.style.backgroundColor = "var(--ds-bg-header)"; }}
                                    onMouseLeave={(e) => { if (!selectedRowIds.has(rowKey)) e.currentTarget.style.backgroundColor = COLOR.white; }}
                                    style={{ backgroundColor: selectedRowIds.has(rowKey) ? COLOR.primaryLight : COLOR.white, transition: "background 0.15s" }}>
                                    {/* Checkbox — shared span (one per split-group OR per non-split order) */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, width: 36, minWidth: 36, padding: "8px 4px", verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            <input type="checkbox" checked={selectedRowIds.has(rowKey)}
                                                onChange={() => {
                                                    const next = new Set(selectedRowIds);
                                                    next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
                                                    setSelectedRowIds(next);
                                                }}
                                                style={{ width: 14, height: 14, cursor: "pointer", display: "block", margin: "0 auto", accentColor: "#0073ea" }} />
                                        </td>
                                    )}
                                    {/* Order — order-group span */}
                                    {orderSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle", fontWeight: 600 }} rowSpan={orderSpan > 1 ? orderSpan : undefined}>
                                            {item.orderName || "-"}
                                        </td>
                                    )}
                                    {/* Split Order — shared span */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle", fontWeight: isSplit ? 500 : undefined }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {splitName}
                                        </td>
                                    )}
                                    {/* Per-item columns — always one row each */}
                                    <td style={{ ...TD, textAlign: "left" }}>{item.name}</td>
                                    <td style={TD}>{skuCol?.text || "-"}</td>
                                    <td style={TD}>{formatNumeric(getRobustValue(item.column_values, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCTWEIGHT)) || "-"}</td>
                                    {/* Shared columns — rowspanned for both split groups and non-split orders */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {getRobustValue(item.column_values, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COD_STATUS) || "-"}
                                        </td>
                                    )}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {item.supplierPostalCode || "-"}
                                        </td>
                                    )}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {item.customerPostalCode || "-"}
                                        </td>
                                    )}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {item.supplierName || "-"}
                                        </td>
                                    )}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {item.courierName || "-"}
                                        </td>
                                    )}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            <span style={badge(statusText === "Courier Selected" ? "success" : "neutral")}>
                                                {statusText}
                                            </span>
                                        </td>
                                    )}
                                    {/* Courier dropdown — one per group. Fixed width + a min-height
                                        wrapper so the cell reserves its full size while couriers load
                                        async — the Loader→Dropdown swap then causes no table reflow. */}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, width: 420, minWidth: 420, padding: "6px 10px", verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                          <div style={{ minHeight: 38, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                            {rowState?.loading ? (
                                                <Loader size={20} />
                                            ) : (
                                                <>
                                                    <Dropdown
                                                        placeholder="Select courier..."
                                                        options={rowState?.options || []}
                                                        value={rowState?.selected || null}
                                                        onChange={(val: any) => setRowCourierMap((prev: any) => ({ ...prev, [rowKey]: { ...prev[rowKey], selected: val } }))}
                                                        menuPosition="fixed" menuPlacement="auto"
                                                        menuStyles={{ minWidth: 400, width: "max-content", maxWidth: 500 }}
                                                        optionRenderer={(opt: any) => <CourierOption label={opt.label} tag={opt.tag} freight_charge={opt.freight_charge} rating={opt.rating} etd={opt.etd} cod_charges={opt.cod_charges} rto_charges={opt.rto_charges} aiReason={opt.aiReason} />}
                                                        valueRenderer={(opt: any) => <CourierOption label={opt.label} tag={opt.tag} freight_charge={opt.freight_charge} rating={opt.rating} etd={opt.etd} cod_charges={opt.cod_charges} rto_charges={opt.rto_charges} aiReason={opt.aiReason} />}
                                                    />
                                                    {rowState?.error && <p style={{ margin: "2px 0 0", fontSize: 11, color: COLOR.danger }}>{rowState.error}</p>}
                                                </>
                                            )}
                                          </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={13} style={{ padding: "48px 24px", textAlign: "center", color: COLOR.textMuted }}>
                                    <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--ds-neutral-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 24 }}>🚚</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.text, marginBottom: 3 }}>No line items</div>
                                    <div style={{ fontSize: 13 }}>
                                        {hasActiveFilters ? "No line items match the selected filters — try clearing them." : "No line items found for the selected orders."}
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
                    <span style={{ fontSize: 12, color: COLOR.textMuted }}>{sortedDisplayedLineItems.length} record{sortedDisplayedLineItems.length !== 1 ? "s" : ""}</span>
                </div>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${COLOR.border}`, fontSize: 13, color: COLOR.text }}>
                    {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
            </div>

            {/* Bottom nav */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.borderLight}` }}>
                <Btn variant="secondary" onClick={onPrev}>← Back to Suppliers</Btn>
                <Btn variant="primary" onClick={onNext}>Create Shipment &amp; Manifest →</Btn>
            </div>
        </div>
    );
};
