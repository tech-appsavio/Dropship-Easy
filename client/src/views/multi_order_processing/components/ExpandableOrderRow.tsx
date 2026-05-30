// src/views/multi_order_processing/components/ExpandableOrderRow.tsx
import React, { useState } from "react";
import { Order } from "../types";
import {
    ORDER_BOARD_ID,
    ORDER_ITEM_BOARD_ID,
    ORDER_COLUMN_LABELS_VISIBLE,
    ORDERLINEITEMS_COLUMN_LABELS_VISIBLE,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
} from "../constants";

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

    // Helper to get the correct Monday instance URL from the current environment
    const getMondayUrl = (boardId: string | number, itemId: string) => {
        // If we are in a monday.app domain, we should redirect to the main monday domain
        const host = window.location.hostname.includes("monday.app")
            ? "https://view.monday.com" // Standard redirection host
            : ""; // Falls back to relative path if already on monday.com

        return `${host}/boards/${boardId}/pulses/${itemId}`;
    };

    // Helper to render values based on Monday's complex data structure
    const getDisplayValue = (col: any) => {
        if (!col) return "-";
        // Check for display_value (Mirror, Formula, Status, BoardRelation) or fall back to text
        return col.display_value || col.text || "-";
    };

    return (
        <>
            {/* Order row */}
            <tr style={{ borderBottom: "1px solid #dcdcdc", backgroundColor: isExpanded ? "#f0f4ff" : "white" }}>
                <td style={{ padding: "12px", textAlign: "center" }}>
                    <input type="checkbox" checked={isSelected} onChange={() => onSelect(order.id)} />
                </td>
                {ORDER_COLUMN_LABELS_VISIBLE.map((label) => {
                    const key = label.toUpperCase();
                    const rawValue = label === "Name" ? order.name : order[key];
                    const displayValue = typeof rawValue === "object" ? getDisplayValue(rawValue) : rawValue;

                    return (
                        <td key={label} style={{ padding: "12px", cursor: label === "Name" ? "pointer" : "default" }}>
                            {label === "Name" ? (
                                <div style={{ display: "flex", alignItems: "center" }}>
                                    <span onClick={() => setIsExpanded(!isExpanded)} style={{ marginRight: 8, fontSize: 11, color: "#676879" }}>
                                        {isExpanded ? "▼" : "▶"}
                                    </span>
                                    {/* CLICKABLE LINK FOR ORDER */}
                                    <a
                                        href={getMondayUrl(ORDER_BOARD_ID, order.id)}
                                        target="_top" // Use _top to break out of the iframe and navigate the main window
                                        rel="noopener noreferrer"
                                        style={{ color: "#0073ea", textDecoration: "none" }}
                                    >
                                        {order.name}
                                    </a>
                                </div>
                            ) : (
                                displayValue
                            )}
                        </td>
                    );
                })}
            </tr>
            {/* Line items sub-table */}
            {isExpanded && (
                <tr>
                    {/* Ensure colSpan accounts for the checkbox + all visible columns */}
                    <td colSpan={ORDER_COLUMN_LABELS_VISIBLE.length + 1} style={{ padding: 0, backgroundColor: "#f6f7fb" }}>
                        <div style={{ borderLeft: "3px solid #0073ea", marginLeft: "48px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ backgroundColor: "#eef0f5", borderBottom: "1px solid #e0e2e9" }}>
                                        {/* Explicitly mapping the labels to show the header */}
                                        {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                            <th
                                                key={label}
                                                style={{
                                                    padding: "8px 12px",
                                                    textAlign: "left",
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    color: "#676879",
                                                }}
                                            >
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.map((li) => (
                                        <tr key={li.id} style={{ borderBottom: "1px solid #e6e9ef" }}>
                                            {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => {
                                                const colId = LI_LABEL_TO_COL_ID[label];
                                                const col = li.column_values?.find((cv: any) => cv.id === colId);

                                                return (
                                                    <td key={label} style={{ padding: "8px 12px", fontSize: "13px" }}>
                                                        {label === "Name" ? (
                                                            <a
                                                                href={getMondayUrl(ORDER_ITEM_BOARD_ID, li.id)}
                                                                target="_top"
                                                                style={{ color: "#0073ea", textDecoration: "none" }}
                                                            >
                                                                {li.name}
                                                            </a>
                                                        ) : (
                                                            // Call your getDisplayValue helper here
                                                            getDisplayValue(col)
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};