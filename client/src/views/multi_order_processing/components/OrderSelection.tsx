// src/views/multi_order_processing/components/OrderSelection.tsx
import React, { useState, useMemo, useEffect } from "react";
import { Loader, Dropdown } from "@vibe/core";
import mondaySdk from "monday-sdk-js";
import { useOrderData } from "../hooks/useOrderData";
import { ORDER_COLUMN_LABELS_VISIBLE, ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";
import { ExpandableOrderRow } from "./ExpandableOrderRow";

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

    const DATE_FILTER_OPTIONS = [
        { value: "today", label: "Today" },
        { value: "yesterday", label: "Yesterday" },
        { value: "week", label: "This Week" },
        { value: "month", label: "This Month" },
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

    // Collect all active unique statuses available across all incoming Order records dynamically
    const statusOptions = useMemo(() => {
        const statuses = new Set<string>();
        orders.forEach((o) => {
            if (o.STATUS) statuses.add(String(o.STATUS));
        });
        return Array.from(statuses).map((status) => ({ value: status, label: status }));
    }, [orders]);

    // Combined multi-filter routine (Searching + Status + Date Dropdown Evaluation)
    const filteredOrders = useMemo(() => {
        const now = new Date();
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const today = startOfDay(now);

        return orders.filter((o) => {
            const matchesSearch = o.name.toLowerCase().includes(searchTerm.toLowerCase());
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
                        const monthAgo = new Date(today); monthAgo.setMonth(today.getMonth() - 1);
                        matchesDate = orderDate >= monthAgo && orderDate <= today;
                    }
                }
            }

            return matchesSearch && matchesStatus && matchesDate;
        });
    }, [orders, searchTerm, selectedStatus, selectedDateFilter]);

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
        setSearchTerm("");
        const searchInput = document.getElementById("order-search-input") as HTMLInputElement;
        if (searchInput) searchInput.value = "";
        setCurrentPage(1);
    };

    if (loading)
        return (
            <div style={{ textAlign: "center", padding: 50 }}>
                <Loader size={40} />
            </div>
        );
    if (error) return <div style={{ color: "red", padding: 20 }}>Error: {error}</div>;

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                }}
            >
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Order Selection</h3>
            </div>
            {/* Top Toolbar controls area */}
            <div style={{ display: "flex", gap: 10, marginBottom: "16px", alignItems: "center", flexWrap: "wrap", position: "relative", zIndex: 30 }}>
                <input
                    id="order-search-input"
                    type="text"
                    placeholder="Search orders by name..."
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 4, border: "1px solid #cccccc", fontSize: "14px" }}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                    }}
                />

                {/* Salesforce-Style Toggleable Filter Action Icon */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "8px 14px",
                        borderRadius: "4px",
                        border: "1px solid #cccccc",
                        background: showFilters || selectedStatus || selectedDateFilter ? "#f0f4ff" : "#ffffff",
                        color: selectedStatus || selectedDateFilter ? "#0073ea" : "#323338",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: 500,
                        gap: "6px",
                        transition: "all 0.2s ease",
                    }}
                    title="Toggle Filter Panel"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1.5 2.5A.5.5 0 0 1 2 2h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.146.354l-4.5 4.5V13.5a.5.5 0 0 1-.724.447l-2-1A.5.5 0 0 1 7 12.5V9.354l-4.5-4.5A.5.5 0 0 1 2 4.5v-2z" />
                    </svg>
                    Filters {(selectedStatus ? 1 : 0) + (selectedDateFilter ? 1 : 0) > 0 ? `(${(selectedStatus ? 1 : 0) + (selectedDateFilter ? 1 : 0)})` : ""}
                </button>

                <div style={{ width: 120, position: "relative", zIndex: 6, flexShrink: 0 }}>
                    <Dropdown
                        placeholder="Page Size"
                        options={PAGE_SIZE_OPTIONS}
                        value={PAGE_SIZE_OPTIONS.find((o) => o.value === pageSize)}
                        onChange={(opt: any) => {
                            if (opt) {
                                setPageSize(opt.value);
                                setCurrentPage(1);
                            }
                        }}
                    />
                </div>
            </div>

            {/* Collapsible Filter Panel Grid Box */}
            {showFilters && (
                <div
                    style={{
                        background: "#f8f9fa",
                        border: "1px solid #e2e4e9",
                        borderRadius: "4px",
                        padding: "16px",
                        marginBottom: "16px",
                        display: "flex",
                        alignItems: "flex-end",
                        gap: "20px",
                        flexWrap: "wrap",
                        position: "relative",
                        zIndex: 20,
                    }}
                >
                    <div style={{ width: "240px" }}>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "#676879", display: "block", marginBottom: "6px" }}>Filter by Status:</label>
                        <Dropdown
                            placeholder="All Statuses"
                            options={statusOptions}
                            value={selectedStatus}
                            onChange={(opt: any) => {
                                setSelectedStatus(opt);
                                setCurrentPage(1);
                            }}
                        />
                    </div>

                    <div style={{ width: "200px" }}>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "#676879", display: "block", marginBottom: "6px" }}>Filter by Created Date:</label>
                        <Dropdown
                            placeholder="Select Date"
                            options={DATE_FILTER_OPTIONS}
                            value={selectedDateFilter}
                            onChange={(opt: any) => {
                                setSelectedDateFilter(opt);
                                setCurrentPage(1);
                            }}
                        />
                    </div>

                    {(selectedStatus || selectedDateFilter || searchTerm) && (
                        <button
                            onClick={handleClearAllFilters}
                            style={{
                                border: "none",
                                background: "none",
                                color: "#ba3e3a",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: 500,
                                padding: "8px 4px",
                                textDecoration: "underline",
                            }}
                        >
                            Clear Active Filters
                        </button>
                    )}
                </div>
            )}

            {/* Table: outer wrapper only controls horizontal overflow; inner div controls vertical scroll */}
            <div style={{ overflowX: "auto", border: "1px solid #d0d4e0", borderRadius: 6 }}>
                <div style={{ overflowY: "auto", maxHeight: 420 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                    <thead style={{ backgroundColor: "#f1f3f5", position: "sticky", top: 0, zIndex: 5 }}>
                        <tr>
                            <th style={{ padding: "12px 16px", width: 50, border: "1px solid #d0d4e0", textAlign: "center" }}>
                                <input
                                    type="checkbox"
                                    checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedOrderIds.has(o.id))}
                                    onChange={(e) => {
                                        const next = new Set(selectedOrderIds);
                                        paginatedOrders.forEach((o) => (e.target.checked ? next.add(o.id) : next.delete(o.id)));
                                        onSelectionChange(next);
                                    }}
                                />
                            </th>
                            {ORDER_COLUMN_LABELS_VISIBLE.map((label) => (
                                <th key={label} style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#323338", border: "1px solid #d0d4e0", whiteSpace: "nowrap", minWidth: 140 }}>
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody style={{ display: "table-row-group" }}>
                        {paginatedOrders.map((order) => (
                            <ExpandableOrderRow
                                key={order.id}
                                order={order}
                                isSelected={selectedOrderIds.has(order.id)}
                                onSelect={toggle}
                                lineItems={lineItemsMap[order.id] || []}
                            />
                        ))}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Bottom bar: pagination left, Go to Supplier Selection right */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, paddingBottom: 24, borderTop: "1px solid #eee" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                        onClick={() => setCurrentPage((p) => p - 1)}
                        disabled={currentPage === 1}
                        style={{
                            padding: "6px 14px", borderRadius: 4, border: "1px solid #d0d4e0",
                            background: currentPage === 1 ? "#f4f5f7" : "#fff",
                            color: currentPage === 1 ? "#aaa" : "#323338",
                            cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 13,
                        }}
                    >
                        ← Previous
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#323338", padding: "6px 10px", border: "1px solid #d0d4e0", borderRadius: 4, background: "#f8f9fa" }}>
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage((p) => p + 1)}
                        disabled={currentPage === totalPages}
                        style={{
                            padding: "6px 14px", borderRadius: 4, border: "1px solid #d0d4e0",
                            background: currentPage === totalPages ? "#f4f5f7" : "#fff",
                            color: currentPage === totalPages ? "#aaa" : "#323338",
                            cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontSize: 13,
                        }}
                    >
                        Next →
                    </button>
                    <span style={{ fontSize: 12, color: "#676879", marginLeft: 6 }}>
                        {filteredOrders.length} record{filteredOrders.length !== 1 ? "s" : ""}
                    </span>
                </div>

                <button
                    onClick={onNext}
                    disabled={isNextDisabled}
                    style={{
                        padding: "10px 22px", borderRadius: 6,
                        background: isNextDisabled ? "#c5c7d4" : "#0073ea",
                        color: "#fff", border: "none",
                        cursor: isNextDisabled ? "not-allowed" : "pointer",
                        fontSize: 14, fontWeight: 600,
                        display: "flex", alignItems: "center", gap: 8,
                        boxShadow: isNextDisabled ? "none" : "0 2px 8px rgba(0,115,234,0.3)",
                        transition: "all 0.2s ease",
                    }}
                >
                    Go to Supplier Selection →
                </button>
            </div>
        </div>
    );
};
