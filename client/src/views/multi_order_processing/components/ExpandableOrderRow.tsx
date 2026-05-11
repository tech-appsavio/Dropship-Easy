// src/views/multi_order_processing/components/ExpandableOrderRow.tsx
import React, { useState } from "react";
import { Order } from "../types";
import { ORDER_COLUMN_LABELS_VISIBLE, ORDERLINEITEMS_COLUMN_LABELS_VISIBLE, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";

// Map line item labels → column IDs for value lookup
const LI_LABEL_TO_COL_ID: Record<string, string> = {
    Quantity: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY,
    UnitPrice: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.UNITPRICE,
    SKU: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU,
    ListPrice: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.LISTPRICE,
    "Product Code": ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCTCODE,
    SUPPLIER: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER,
    PRODUCT: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT,
    STATUS: ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS,
};

export const ExpandableOrderRow: React.FC<{
    order: Order;
    isSelected: boolean;
    onSelect: (id: string) => void;
    lineItems: any[];
}> = ({ order, isSelected, onSelect, lineItems }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const totalCols = ORDER_COLUMN_LABELS_VISIBLE.length + 1; // +1 for checkbox col

    return (
        <>
            {/* Order row */}
            <tr style={{ borderBottom: "1px solid #dcdcdc", backgroundColor: isExpanded ? "#f0f4ff" : "white" }}>
                <td style={{ padding: "12px", textAlign: "center" }}>
                    <input type="checkbox" checked={isSelected} onChange={() => onSelect(order.id)} />
                </td>
                {ORDER_COLUMN_LABELS_VISIBLE.map((label) => {
                    const key = label.toUpperCase();
                    const displayValue = label === "Name" ? order.name : order[key];

                    return (
                        <td
                            key={label}
                            style={{ padding: "12px", cursor: label === "Name" ? "pointer" : "default" }}
                            onClick={() => label === "Name" && setIsExpanded(!isExpanded)}
                        >
                            {label === "Name" && <span style={{ marginRight: 8, fontSize: 11, color: "#676879" }}>{isExpanded ? "▼" : "▶"}</span>}
                            {displayValue}
                        </td>
                    );
                })}
            </tr>

            {/* Line items sub-table — only when expanded */}
            {isExpanded && (
                <tr>
                    <td colSpan={totalCols} style={{ padding: 0, backgroundColor: "#f6f7fb" }}>
                        {/* Left accent line like Monday's native UI */}
                        <div style={{ borderLeft: "3px solid #0073ea", marginLeft: 48 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ backgroundColor: "#eef0f5", borderBottom: "1px solid #e0e2e9" }}>
                                        {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                            <th
                                                key={label}
                                                style={{
                                                    padding: "7px 12px",
                                                    textAlign: "left",
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    color: "#676879",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.length}
                                                style={{ padding: "10px 12px", color: "#aaa", fontSize: 12, fontStyle: "italic" }}
                                            >
                                                No line items for this order.
                                            </td>
                                        </tr>
                                    ) : (
                                        lineItems.map((li) => (
                                            <tr key={li.id} style={{ borderBottom: "1px solid #e6e9ef" }}>
                                                {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => {
                                                    const colId = LI_LABEL_TO_COL_ID[label];
                                                    const value = label === "Name" ? li.name : li.column_values.find((cv: any) => cv.id === colId)?.text || "-";
                                                    return (
                                                        <td
                                                            key={label}
                                                            style={{
                                                                padding: "8px 12px",
                                                                fontSize: 13,
                                                                color: "#323338",
                                                            }}
                                                        >
                                                            {value}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};