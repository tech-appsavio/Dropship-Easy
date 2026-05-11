import React, { useState, useMemo } from "react";
import { Loader, Dropdown } from "@vibe/core";
import { useOrderData } from "../hooks/useOrderData";
import { ORDER_COLUMN_LABELS_VISIBLE } from "../constants";
import { ExpandableOrderRow } from "./ExpandableOrderRow";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100].map(n => ({ value: n, label: String(n) }));

interface Props {
    selectedOrderIds: Set<string>;
    onSelectionChange: (ids: Set<string>) => void;
}

export const OrderSelection: React.FC<Props> = ({ selectedOrderIds, onSelectionChange }) => {
    const { orders, loading, error } = useOrderData();
    const [searchTerm, setSearchTerm] = useState("");
    const [pageSize, setPageSize]     = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const filteredOrders = useMemo(() =>
        orders.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [orders, searchTerm]
    );

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

    if (loading) return <div style={{ textAlign: "center", padding: 50 }}><Loader size={40} /></div>;
    if (error)   return <div style={{ color: "red", padding: 20 }}>Error: {error}</div>;

    return (
        <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <input
                    type="text"
                    placeholder="Search orders..."
                    style={{ flex: 1, padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                />
                <div style={{ width: 150 }}>
                    <Dropdown
                        placeholder="Page Size"
                        options={PAGE_SIZE_OPTIONS}
                        value={PAGE_SIZE_OPTIONS.find(o => o.value === pageSize)}
                        onChange={(opt: any) => { if (opt) { setPageSize(opt.value); setCurrentPage(1); } }}
                    />
                </div>
            </div>

            <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #eee", borderRadius: 4 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #c3c7d4", backgroundColor: "#f1f3f5", position: "sticky", top: 0, zIndex: 1 }}>
                            <th style={{ padding: 12 }}>
                                <input
                                    type="checkbox"
                                    checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrderIds.has(o.id))}
                                    onChange={e => {
                                        const next = new Set(selectedOrderIds);
                                        paginatedOrders.forEach(o => e.target.checked ? next.add(o.id) : next.delete(o.id));
                                        onSelectionChange(next);
                                    }}
                                />
                            </th>
                            {ORDER_COLUMN_LABELS_VISIBLE.map(label => (
                                <th key={label} style={{ padding: 12, textAlign: "left" }}>{label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedOrders.map(order => (
                            <ExpandableOrderRow
                                key={order.id}
                                order={order}
                                isSelected={selectedOrderIds.has(order.id)}
                                onSelect={toggle}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20, marginTop: 16, paddingTop: 10, borderTop: "1px solid #eee" }}>
                <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}
                    style={{ padding: "6px 16px", cursor: currentPage === 1 ? "not-allowed" : "pointer" }}>
                    Previous
                </button>
                <span style={{ fontSize: 14, fontWeight: "bold" }}>Page {currentPage} of {totalPages}</span>
                <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}
                    style={{ padding: "6px 16px", cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}>
                    Next
                </button>
            </div>
        </div>
    );
};