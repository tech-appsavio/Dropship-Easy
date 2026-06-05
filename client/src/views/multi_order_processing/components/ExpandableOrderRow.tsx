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

// Explicit label → order object key map (keys match ORDER_ALL_COLUMN_IDS_MAP entries)
const ORDER_LABEL_TO_KEY: Record<string, string> = {
    "Name":                   "name",
    "Created Date":           "CREATEDDATE",
    "OrderId":                "ORDERID",
    "Status":                 "STATUS",
    "Total Price":            "TOTAL_PRICE",
    "Billing Address":        "BILLING_ADDRESS",
    "Parent Order":           "PARENTORDER",
    "Shiprocket Order ID":    "Shiprocket_Order_ID",
    "Shiprocket Shipment ID": "Shiprocket_Shipment_ID",
    "Shiprocket AWB ID":      "Shiprocket_AWB_ID",
};
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
            <tr style={{ borderBottom: "1px solid #d0d4e0", backgroundColor: isExpanded ? "#f0f4ff" : "white" }}>
                <td style={{ padding: "12px 16px", textAlign: "center", border: "1px solid #d0d4e0" }}>
                    <input type="checkbox" checked={isSelected} onChange={() => onSelect(order.id)} />
                </td>
                {ORDER_COLUMN_LABELS_VISIBLE.map((label) => {
                    const key = ORDER_LABEL_TO_KEY[label] ?? label.toUpperCase();
                    const rawValue = label === "Name" ? order.name : order[key];
                    
                    let displayValue: string;
                    if (rawValue && typeof rawValue === "object") {
                        displayValue = getDisplayValue(rawValue);
                    } else if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
                        // Format Created Date as "4 June 2026"
                        if (label === "Created Date" && typeof rawValue === "string" && rawValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            const [year, month, day] = rawValue.split("-").map(Number);
                            const date = new Date(year, month - 1, day);
                            const monthName = date.toLocaleString("en-US", { month: "long" });
                            displayValue = `${day} ${monthName} ${year}`;
                        } else {
                            displayValue = String(rawValue);
                        }
                    } else {
                        displayValue = "-";
                    }

                    return (
                        <td key={label} style={{ padding: "12px 16px", textAlign: "center", border: "1px solid #d0d4e0", whiteSpace: label === "BILLING_ADDRESS" ? "normal" : "nowrap", minWidth: 140 }}>
                            {label === "Name" ? (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span onClick={() => setIsExpanded(!isExpanded)} style={{ marginRight: 8, fontSize: 11, color: "#676879", cursor: "pointer" }}>
                                        {isExpanded ? "▼" : "▶"}
                                    </span>
                                    <a
                                        href={getMondayUrl(ORDER_BOARD_ID, order.id)}
                                        target="_top"
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
                    <td colSpan={ORDER_COLUMN_LABELS_VISIBLE.length + 1} style={{ padding: 0, backgroundColor: "#f6f7fb" }}>
                        <div style={{ borderLeft: "3px solid #0073ea", marginLeft: "48px", overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                                <thead>
                                    <tr style={{ backgroundColor: "#e8eaf2" }}>
                                        {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                            <th
                                                key={label}
                                                style={{
                                                    padding: "9px 14px",
                                                    textAlign: "center",
                                                    fontSize: "12px",
                                                    fontWeight: 700,
                                                    color: "#323338",
                                                    border: "1px solid #c8cbe0",
                                                    whiteSpace: "nowrap",
                                                    minWidth: 110,
                                                }}
                                            >
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.map((li) => (
                                        <tr key={li.id} style={{ backgroundColor: "#fff" }}>
                                            {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => {
                                                const colId = LI_LABEL_TO_COL_ID[label];
                                                const col = li.column_values?.find((cv: any) => cv.id === colId);

                                                return (
                                                    <td key={label} style={{ padding: "8px 14px", fontSize: "13px", textAlign: "center", border: "1px solid #c8cbe0", whiteSpace: "nowrap", minWidth: 110 }}>
                                                        {label === "Name" ? (
                                                            <a
                                                                href={getMondayUrl(ORDER_ITEM_BOARD_ID, li.id)}
                                                                target="_top"
                                                                style={{ color: "#0073ea", textDecoration: "none" }}
                                                            >
                                                                {li.name}
                                                            </a>
                                                        ) : (
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