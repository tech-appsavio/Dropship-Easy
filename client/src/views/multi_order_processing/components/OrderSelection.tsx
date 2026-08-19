// src/views/multi_order_processing/components/OrderSelection.tsx
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Loader, Dropdown } from "@vibe/core";
import mondaySdk from "monday-sdk-js";
import { useOrderData } from "../hooks/useOrderData";
import { ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, ORDER_COLUMN_LABELS_VISIBLE } from "../columns";
import { ORDER_ITEM_BOARD_ID } from "../boardIds";
import { ExpandableOrderRow } from "./ExpandableOrderRow";
import { fetchAllBoardItems } from "../utils/fetchAllItems";
import { SetupIncompleteBanner } from "./SetupIncompleteBanner";
import { btn, TH, filterBar, sectionTitle, paginationBtn, COLOR, SHADOW, badge } from "../styles";
import { Btn } from "./Btn";

const monday = mondaySdk();
// Stable empty-array reference so memoized rows don't re-render just because
// `lineItemsMap[id] || []` produced a fresh array each render.
const EMPTY: any[] = [];

interface Props {
    selectedOrderIds: Set<string>;
    onSelectionChange: (ids: Set<string>) => void;
    onNext: () => void;
    isNextDisabled: boolean;
}

export const OrderSelection: React.FC<Props> = ({ selectedOrderIds, onSelectionChange, onNext, isNextDisabled }) => {
    const { orders, loading, error } = useOrderData();
    const [searchTerm, setSearchTerm] = useState("");
    const [pageSize, setPageSize] = useState(5);
    const [currentPage, setCurrentPage] = useState(1);

    // NEW STATES: Salesforce-like list filtering layout components
    const [showFilters, setShowFilters] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState<any>(null);
    const [selectedDateFilter, setSelectedDateFilter] = useState<any>(null);
    const [customDateStart, setCustomDateStart] = useState("");
    const [customDateEnd, setCustomDateEnd] = useState("");
    const DATE_FILTER_OPTIONS = [
        { value: "today", label: "Today" },
        { value: "yesterday", label: "Yesterday" },
        { value: "week", label: "This Week" },
        { value: "month", label: "This Month" },
        { value: "custom", label: "Custom Range" },
    ];

    // Line items map: orderId → line item rows
    const [lineItemsMap, setLineItemsMap] = useState<Record<string, any[]>>({});

    useEffect(() => {
        const fetchLineItems = async () => {
            try {
                // Paginated (cursor) fetch — supports line-item boards with >500 items.
                const items = await fetchAllBoardItems(ORDER_ITEM_BOARD_ID, `
                    id
                    name
                    column_values {
                        column { title type id }
                        id
                        type
                        text
                        value
                        ... on MirrorValue { display_value }
                        ... on BoardRelationValue { linked_item_ids display_value }
                        ... on FormulaValue { display_value }
                    }
                `);
                const map: Record<string, any[]> = {};

                items.forEach((item: any) => {
                    const orderCol = item.column_values.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                    let orderId = orderCol?.linked_item_ids?.[0];
                    if (!orderId && orderCol?.value) {
                        try {
                            const parsed = JSON.parse(orderCol.value);
                            orderId = String(parsed?.linkedPulseIds?.[0]?.linkedPulseId);
                        } catch {}
                    }
                    if (orderId) {
                        if (!map[orderId]) map[orderId] = [];
                        map[orderId].push(item);
                    }
                });

                setLineItemsMap(map);
            } catch (e) {
                monday.execute("confirm", {
                    message: "Failed to query Order Line Items: " + e.message,
                    description: e,
                    type: "error",
                    confirmButtonText: "OK",
                    excludeCancelButton: true,
                });
            }
        };
        fetchLineItems();
    }, []);

    // Collect all active unique statuses (excluding "Manifest Generated")
    const statusOptions = useMemo(() => {
        const statuses = new Set<string>();
        orders.forEach((o) => {
            if (o.STATUS && o.STATUS !== "Manifest Generated") statuses.add(String(o.STATUS));
        });
        return Array.from(statuses).map((status) => ({ value: status, label: status }));
    }, [orders]);

    // Combined multi-filter routine (Searching + Status + Date Dropdown Evaluation)
    const filteredOrders = useMemo(() => {
        const now = new Date();
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const today = startOfDay(now);

        return orders.filter((o) => {
            // Only show "Confirmed" orders, exclude "Manifest Generated". Compared
            // case-insensitively and trimmed, since a stray space or casing difference
            // in the monday status label (e.g. "Confirmed " or "confirmed") would
            // otherwise silently hide an order that looks correct at a glance.
            const status = String(o.STATUS || "").trim().toLowerCase();
            if (status !== "confirmed") return false;

            const term = searchTerm.toLowerCase();
            const matchesSearch =
                o.name.toLowerCase().includes(term) ||
                String(o.BILLING_ADDRESS || "").toLowerCase().includes(term) ||
                String(o.CUSTOMER || "").toLowerCase().includes(term);
            const matchesStatus = !selectedStatus || String(o.STATUS || "").trim().toLowerCase() === selectedStatus.value.trim().toLowerCase();

            let matchesDate = true;
            if (selectedDateFilter) {
                // Exclude orders with no date when a date filter is active
                if (!o.CREATEDDATE) {
                    matchesDate = false;
                } else {
                    // monday returns "YYYY-MM-DD" — parse parts directly to avoid UTC offset shifting the date
                    const [year, month, day] = String(o.CREATEDDATE).split("-").map(Number);
                    const orderDate = new Date(year, month - 1, day);
                    if (selectedDateFilter.value === "today") {
                        matchesDate = orderDate.getTime() === today.getTime();
                    } else if (selectedDateFilter.value === "yesterday") {
                        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
                        matchesDate = orderDate.getTime() === yesterday.getTime();
                    } else if (selectedDateFilter.value === "week") {
                        const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
                        matchesDate = orderDate >= weekAgo && orderDate <= today;
                    } else if (selectedDateFilter.value === "month") {
                        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                        matchesDate = orderDate >= startOfMonth && orderDate <= today;
                    } else if (selectedDateFilter.value === "custom") {
                        const parseLocalDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
                        if (customDateStart && customDateEnd) {
                            matchesDate = orderDate >= parseLocalDate(customDateStart) && orderDate <= parseLocalDate(customDateEnd);
                        } else if (customDateStart) {
                            matchesDate = orderDate >= parseLocalDate(customDateStart);
                        } else if (customDateEnd) {
                            matchesDate = orderDate <= parseLocalDate(customDateEnd);
                        } else {
                            matchesDate = true;
                        }
                    }
                }
            }

            return matchesSearch && matchesStatus && matchesDate;
        });
    }, [orders, searchTerm, selectedStatus, selectedDateFilter, customDateStart, customDateEnd]);

    const paginatedOrders = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredOrders.slice(start, start + pageSize);
    }, [filteredOrders, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;

    const toggle = useCallback((id: string) => {
        const next = new Set(selectedOrderIds);
        next.has(id) ? next.delete(id) : next.add(id);
        onSelectionChange(next);
    }, [selectedOrderIds, onSelectionChange]);

    const handleClearAllFilters = () => {
        setSelectedStatus(null);
        setSelectedDateFilter(null);
        setCustomDateStart("");
        setCustomDateEnd("");
        setSearchTerm("");
        const searchInput = document.getElementById("order-search-input") as HTMLInputElement;
        if (searchInput) searchInput.value = "";
        setCurrentPage(1);
    };

    if (loading)
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", alignItems: "center", minHeight: 320, color: COLOR.textMuted }}>
                <Loader size={38} />
                <span style={{ fontSize: 13 }}>Loading confirmed orders…</span>
            </div>
        );
    if (error)
        return (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: COLOR.dangerLight, border: `1px solid var(--ds-danger-bd)`, borderRadius: 10, padding: "14px 16px", margin: "8px 0", color: COLOR.danger, fontSize: 13 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
                <div><b>Couldn't load orders</b><div style={{ marginTop: 2, color: COLOR.danger }}>{error}</div></div>
            </div>
        );

    return (
        <div>
            {/* Warns (with a link to the Settings tab) if required credentials/boards aren't set up */}
            <SetupIncompleteBanner />

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    <h3 style={sectionTitle}>Order Selection</h3>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: COLOR.textMuted }}>
                        Select orders to process — only <strong>Confirmed</strong> orders are shown
                    </p>
                </div>
                {selectedOrderIds.size > 0 && (
                    <span style={{ ...badge("info"), padding: "5px 14px", fontSize: 12, fontWeight: 700 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLOR.primary }} />
                        {selectedOrderIds.size} selected
                    </span>
                )}
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap", position: "relative", zIndex: 30 }}>
                <div style={{ flex: 1, position: "relative", minWidth: 200 }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLOR.textMuted, fontSize: 14, pointerEvents: "none" }}>🔍</span>
                    <input
                        id="order-search-input"
                        type="text"
                        placeholder="Search by order name, address or customer name..."
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 8, border: `1px solid ${searchFocused ? COLOR.primary : COLOR.border}`, boxShadow: searchFocused ? SHADOW.focus : "none", fontSize: 13, color: COLOR.text, outline: "none", boxSizing: "border-box", background: COLOR.white, transition: "border-color .15s, box-shadow .15s" }}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    style={{ ...btn(showFilters || selectedStatus || selectedDateFilter ? "primary" : "secondary"), padding: "9px 16px" }}
                    title="Toggle Filters"
                >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1.5 2.5A.5.5 0 0 1 2 2h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.146.354l-4.5 4.5V13.5a.5.5 0 0 1-.724.447l-2-1A.5.5 0 0 1 7 12.5V9.354l-4.5-4.5A.5.5 0 0 1 2 4.5v-2z" />
                    </svg>
                    Filters {(selectedStatus ? 1 : 0) + (selectedDateFilter ? 1 : 0) > 0 ? `(${(selectedStatus ? 1 : 0) + (selectedDateFilter ? 1 : 0)})` : ""}
                </button>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${COLOR.border}`, fontSize: 13, color: COLOR.text }}>
                    {[5, 10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
            </div>

            {/* Filter panel */}
            {showFilters && (
                <div style={filterBar}>
                    <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
                        <Dropdown placeholder="All Statuses" options={statusOptions} value={selectedStatus}
                            onChange={(opt: any) => { setSelectedStatus(opt); setCurrentPage(1); }} />
                    </div>
                    <div style={{ flex: "1 1 180px", minWidth: 160 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Created Date</label>
                        <Dropdown placeholder="Select Date" options={DATE_FILTER_OPTIONS} value={selectedDateFilter}
                            onChange={(opt: any) => { setSelectedDateFilter(opt); setCustomDateStart(""); setCustomDateEnd(""); setCurrentPage(1); }} />
                        {selectedDateFilter?.value === "custom" && (
                            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 10, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>From</label>
                                    <input
                                        type="date"
                                        value={customDateStart}
                                        max={customDateEnd || undefined}
                                        onChange={(e) => { setCustomDateStart(e.target.value); setCurrentPage(1); }}
                                        style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${COLOR.border}`, fontSize: 12, color: COLOR.text, outline: "none", boxSizing: "border-box", background: COLOR.white }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 10, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>To</label>
                                    <input
                                        type="date"
                                        value={customDateEnd}
                                        min={customDateStart || undefined}
                                        onChange={(e) => { setCustomDateEnd(e.target.value); setCurrentPage(1); }}
                                        style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${COLOR.border}`, fontSize: 12, color: COLOR.text, outline: "none", boxSizing: "border-box", background: COLOR.white }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    {(selectedStatus || selectedDateFilter || searchTerm) && (
                        <button onClick={handleClearAllFilters} style={btn("ghost")}>
                            ✕ Clear Filters
                        </button>
                    )}
                </div>
            )}

            {/* Table */}
            <div style={{ overflowX: "auto", border: `1px solid ${COLOR.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ overflowY: "auto", maxHeight: 420 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                            <tr>
                                <th style={{ ...TH, width: 36, minWidth: 36, padding: "9px 4px" }}>
                                    <input
                                        type="checkbox"
                                        checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedOrderIds.has(o.id))}
                                        onChange={(e) => {
                                            const next = new Set(selectedOrderIds);
                                            paginatedOrders.forEach((o) => (e.target.checked ? next.add(o.id) : next.delete(o.id)));
                                            onSelectionChange(next);
                                        }}
                                        style={{ width: 14, height: 14, cursor: "pointer", display: "block", margin: "0 auto", accentColor: "#0073ea" }}
                                    />
                                </th>
                                {ORDER_COLUMN_LABELS_VISIBLE.map((label) => (
                                    <th key={label} style={TH}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedOrders.length > 0 ? paginatedOrders.map((order) => (
                                <ExpandableOrderRow key={order.id} order={order} isSelected={selectedOrderIds.has(order.id)} onSelect={toggle} lineItems={lineItemsMap[order.id] || EMPTY} />
                            )) : (
                                <tr>
                                    <td colSpan={ORDER_COLUMN_LABELS_VISIBLE.length + 1} style={{ padding: "48px 24px", textAlign: "center", color: COLOR.textMuted }}>
                                        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--ds-neutral-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 24 }}>📦</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.text, marginBottom: 3 }}>No confirmed orders</div>
                                        <div style={{ fontSize: 13 }}>
                                            {searchTerm || selectedStatus || selectedDateFilter
                                                ? "No orders match your filters — try clearing them."
                                                : "Confirmed orders will appear here once customers confirm their orders."}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.borderLight}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1} style={paginationBtn(currentPage === 1)}>← Prev</button>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.text, padding: "5px 12px", border: `1px solid ${COLOR.border}`, borderRadius: 6, background: COLOR.bg }}>
                        {currentPage} / {totalPages}
                    </span>
                    <button onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages} style={paginationBtn(currentPage === totalPages)}>Next →</button>
                    <span style={{ fontSize: 12, color: COLOR.textMuted }}>{filteredOrders.length} record{filteredOrders.length !== 1 ? "s" : ""}</span>
                </div>
                <Btn variant="primary" onClick={onNext} disabled={isNextDisabled}>
                    Go to Supplier Selection <span style={{ fontSize: 15 }}>→</span>
                </Btn>
            </div>
        </div>
    );
};
