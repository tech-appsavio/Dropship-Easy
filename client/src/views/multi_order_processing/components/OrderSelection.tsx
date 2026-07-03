// src/views/multi_order_processing/components/OrderSelection.tsx
import React, { useState, useMemo, useEffect } from "react";
import { Loader, Dropdown } from "@vibe/core";
import mondaySdk from "monday-sdk-js";
import { useOrderData } from "../hooks/useOrderData";
import { ORDER_COLUMN_LABELS_VISIBLE, ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";
import { ExpandableOrderRow } from "./ExpandableOrderRow";
import { btn, TH, filterBar, sectionTitle, paginationBtn, COLOR } from "../styles";

const monday = mondaySdk();
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100].map((n) => ({ value: n, label: String(n) }));

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
                const res: any = await monday.api(`query {
                    boards(ids: ${ORDER_ITEM_BOARD_ID}) {
                        items_page(limit: 500) {
                            items {
                                id
                                name
                                column_values {
                                    column {
                                        title
                                        type
                                        id
                                    }
                                    id
                                    type
                                    text
                                    value
                                    ... on MirrorValue {
                                        display_value
                                        id
                                        text
                                        value
                                    }
                                    ... on BoardRelationValue {
                                        linked_item_ids
                                        display_value
                                    }
                                    ... on FormulaValue {
                                        value
                                        display_value
                                    }
                                }
                            }
                        }
                    }
                }`); //

                const items = res.data?.boards?.[0]?.items_page?.items || [];
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
            // Only show "Confirmed" orders, exclude "Manifest Generated"
            if (String(o.STATUS) !== "Confirmed" || String(o.STATUS) === "Manifest Generated") return false;

            const term = searchTerm.toLowerCase();
            const matchesSearch =
                o.name.toLowerCase().includes(term) ||
                String(o.BILLING_ADDRESS || "").toLowerCase().includes(term) ||
                String(o.CUSTOMER || "").toLowerCase().includes(term);
            const matchesStatus = !selectedStatus || String(o.STATUS) === selectedStatus.value;

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

    const toggle = (id: string) => {
        const next = new Set(selectedOrderIds);
        next.has(id) ? next.delete(id) : next.add(id);
        onSelectionChange(next);
    };

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
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
                <Loader size={40} />
            </div>
        );
    if (error) return <div style={{ color: COLOR.danger, padding: 20, fontWeight: 500 }}>Error: {error}</div>;

    return (
        <div>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    <h3 style={sectionTitle}>Order Selection</h3>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: COLOR.textMuted }}>
                        Select orders to process — only <strong>Confirmed</strong> orders are shown
                    </p>
                </div>
                {selectedOrderIds.size > 0 && (
                    <span style={{ background: COLOR.primaryLight, color: COLOR.primary, border: `1px solid #a8c4f5`, borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700 }}>
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
                        style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 8, border: `1px solid ${COLOR.border}`, fontSize: 13, color: COLOR.text, outline: "none", boxSizing: "border-box", background: COLOR.white }}
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
                                <ExpandableOrderRow key={order.id} order={order} isSelected={selectedOrderIds.has(order.id)} onSelect={toggle} lineItems={lineItemsMap[order.id] || []} />
                            )) : (
                                <tr>
                                    <td colSpan={ORDER_COLUMN_LABELS_VISIBLE.length + 1} style={{ padding: 40, textAlign: "center", color: COLOR.textMuted, fontSize: 13 }}>
                                        No confirmed orders found
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
                <button onClick={onNext} disabled={isNextDisabled} style={btn("primary", isNextDisabled)}>
                    Go to Supplier Selection <span style={{ fontSize: 15 }}>→</span>
                </button>
            </div>
        </div>
    );
};
