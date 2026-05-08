// src/views/multi_order_processing/MultiOrderProcessing.tsx
import React, { useState, useMemo } from "react";
import { Loader, Dropdown, Button } from "@vibe/core";
import { useOrderData } from "./hooks/useOrderData";
import { ORDER_COLUMN_LABELS_VISIBLE } from "./constants";
import { ExpandableOrderRow } from "./components/ExpandableOrderRow";

const PAGE_SIZE_OPTIONS = [
    { value: 5, label: "5" },
    { value: 10, label: "10" },
    { value: 20, label: "20" },
    { value: 50, label: "50" },
    { value: 100, label: "100" },
];

export const MultiOrderProcessing: React.FC = () => {
    const { orders, loading, error } = useOrderData();
    const [searchTerm, setSearchTerm] = useState("");

    // Pagination State
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => o.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [orders, searchTerm]);

    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

    // Calculate Paginated Orders
    const paginatedOrders = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredOrders.slice(startIndex, startIndex + pageSize);
    }, [filteredOrders, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;

    if (loading)
        return (
            <div style={{ textAlign: "center", padding: "50px" }}>
                <Loader size={40} />
            </div>
        );
    if (error) return <div style={{ color: "red", padding: "20px" }}>Error: {error}</div>;

    return (
        <div style={{ padding: "24px", maxWidth: "1200px", margin: "auto" }}>
            <h1>Multi Order Processing</h1>

            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <input
                    type="text"
                    placeholder="Search orders..."
                    style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1); // Reset to page 1 on search
                    }}
                />
                <div style={{ width: "150px" }}>
                    <Dropdown
                        placeholder="Page Size"
                        options={PAGE_SIZE_OPTIONS}
                        // ADD THIS: Syncs the visible label with the state
                        value={PAGE_SIZE_OPTIONS.find((opt) => opt.value === pageSize)}
                        onChange={(option: any) => {
                            if (option) {
                                setPageSize(option.value);
                                setCurrentPage(1);
                            }
                        }}
                    />
                </div>
            </div>

            {/* NEW: Scrollable container for the table */}
            <div
                style={{
                    maxHeight: "450px",
                    overflowY: "auto",
                    border: "1px solid #eee",
                    borderRadius: "4px",
                    marginTop: "10px",
                }}
            >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr
                            style={{
                                borderBottom: "2px solid #c3c7d4",
                                textAlign: "left",
                                backgroundColor: "#f1f3f5",
                                position: "sticky", // Keep header at top
                                top: 0, // Keep header at top
                                zIndex: 1, // Keep header above rows
                            }}
                        >
                            <th style={{ padding: "12px" }}>
                                <input
                                    type="checkbox"
                                    // Checks if all items on the CURRENT page are selected
                                    checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedOrderIds.has(o.id))}
                                    onChange={(e) => {
                                        const newSelected = new Set(selectedOrderIds);
                                        paginatedOrders.forEach((order) => {
                                            if (e.target.checked) {
                                                newSelected.add(order.id);
                                            } else {
                                                newSelected.delete(order.id);
                                            }
                                        });
                                        setSelectedOrderIds(newSelected);
                                    }}
                                />
                            </th>
                            {ORDER_COLUMN_LABELS_VISIBLE.map((label) => (
                                <th key={label} style={{ padding: "12px" }}>
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedOrders.map((order) => (
                            <ExpandableOrderRow
                                key={order.id}
                                order={order}
                                isSelected={selectedOrderIds.has(order.id)}
                                onSelect={(id) => {
                                    const next = new Set(selectedOrderIds);
                                    if (next.has(id)) next.delete(id);
                                    else next.add(id);
                                    setSelectedOrderIds(next);
                                }}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "20px",
                    marginTop: "20px",
                    padding: "10px",
                    borderTop: "1px solid #eee",
                }}
            >
                <Button kind={Button.kinds.TERTIARY} disabled={currentPage === 1} onClick={() => setCurrentPage((prev) => prev - 1)}>
                    Previous
                </Button>

                <span style={{ fontSize: "14px", fontWeight: "bold" }}>
                    Page {currentPage} of {totalPages}
                </span>

                <Button kind={Button.kinds.TERTIARY} disabled={currentPage === totalPages} onClick={() => setCurrentPage((prev) => prev + 1)}>
                    Next
                </Button>
            </div>
            {/* NEW: Supplier Selection Button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
                <Button
                    kind={Button.kinds.PRIMARY}
                    disabled={selectedOrderIds.size === 0}
                    onClick={() => {
                        const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id));
                        console.log("Proceeding with selected orders:", selectedOrders);
                    }}
                >
                    Go to Supplier Selection Screen
                </Button>
            </div>
        </div>
    );
};

export default MultiOrderProcessing;