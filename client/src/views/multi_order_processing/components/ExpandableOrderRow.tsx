import React, { useState } from "react";
import { Order } from "../types";
import {
    ORDER_BOARD_ID,
    ORDER_ITEM_BOARD_ID,
    ORDER_COLUMN_LABELS_VISIBLE,
    ORDERLINEITEMS_COLUMN_LABELS_VISIBLE,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
} from "../constants";
import { COLOR, TH, TD } from "../styles";

const ORDER_LABEL_TO_KEY: Record<string, string> = {
    "Name":                   "name",
    "Created Date":           "CREATEDDATE",
    "OrderId":                "ORDERID",
    "Status":                 "STATUS",
    "Total Price":            "TOTAL_PRICE",
    "Customer":               "CUSTOMER",
    "Billing Address":        "BILLING_ADDRESS",
    "Parent Order":           "PARENTORDER",
    "Shiprocket Order ID":    "Shiprocket_Order_ID",
    "Shiprocket Shipment ID": "Shiprocket_Shipment_ID",
    "Shiprocket AWB ID":      "Shiprocket_AWB_ID",
};

const LI_LABEL_TO_COL_ID: Record<string, string> = {
    SKU:               ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU,
    Qty:               ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY,
    Weight:            ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCTWEIGHT,
    COD:               ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COD_STATUS,
    "Current Supplier": ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER,
    "Split Order":     ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS,
    Status:            ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS,
};

const statusStyle = (val: string): React.CSSProperties => {
    if (val === "Confirmed")           return { background: COLOR.successLight, color: COLOR.success, border: "1px solid #a8d5b5" };
    if (val === "Supplier Selected")   return { background: "#e8f0fe",          color: "#1a73e8",     border: "1px solid #a8c4f5" };
    if (val === "Manifest Generated")  return { background: COLOR.primaryLight, color: COLOR.primary, border: "1px solid #a8c4f5" };
    if (val === "Shipped")             return { background: "#e0f7fa",          color: "#00796b",     border: "1px solid #80cbc4" };
    return { background: COLOR.bgHeader, color: COLOR.textMuted, border: `1px solid ${COLOR.border}` };
};

export const ExpandableOrderRow: React.FC<{
    order: Order;
    isSelected: boolean;
    onSelect: (id: string) => void;
    lineItems: any[];
}> = ({ order, isSelected, onSelect, lineItems }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const getMondayUrl = (boardId: string | number, itemId: string) => {
        const host = window.location.hostname.includes("monday.app") ? "https://view.monday.com" : "";
        return `${host}/boards/${boardId}/pulses/${itemId}`;
    };

    const getDisplayValue = (col: any) => {
        if (!col) return "-";
        return col.display_value || col.text || "-";
    };

    return (
        <>
            <tr style={{ backgroundColor: isSelected ? "#f0f7ff" : isExpanded ? "#fafbff" : COLOR.white, transition: "background 0.15s" }}>
                <td style={{ ...TD, width: 36, minWidth: 36, padding: "8px 4px", verticalAlign: "middle" }}>
                    <input type="checkbox" checked={isSelected} onChange={() => onSelect(order.id)}
                        style={{ width: 14, height: 14, cursor: "pointer", display: "block", margin: "0 auto", accentColor: "#0073ea" }} />
                </td>
                {ORDER_COLUMN_LABELS_VISIBLE.map((label) => {
                    const key = ORDER_LABEL_TO_KEY[label] ?? label.toUpperCase();
                    const rawValue = label === "Name" ? order.name : order[key];
                    let displayValue: string;
                    if (rawValue && typeof rawValue === "object") {
                        displayValue = getDisplayValue(rawValue);
                    } else if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
                        if (label === "Created Date" && typeof rawValue === "string" && rawValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            const [year, month, day] = rawValue.split("-").map(Number);
                            const date = new Date(year, month - 1, day);
                            displayValue = `${day} ${date.toLocaleString("en-US", { month: "short" })} ${year}`;
                        } else {
                            displayValue = String(rawValue);
                        }
                    } else {
                        displayValue = "-";
                    }

                    return (
                        <td key={label} style={{ ...TD, whiteSpace: label === "Billing Address" ? "normal" : "nowrap" }}>
                            {label === "Name" ? (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, color: COLOR.textMuted, fontSize: 9, lineHeight: 1 }}
                                    >
                                        {isExpanded ? "▼" : "▶"}
                                    </button>
                                    <a href={getMondayUrl(ORDER_BOARD_ID, order.id)} target="_top" rel="noopener noreferrer"
                                        style={{ color: COLOR.text, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
                                        {order.name}
                                    </a>
                                </div>
                            ) : label === "Status" ? (
                                <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, ...statusStyle(displayValue) }}>
                                    {displayValue}
                                </span>
                            ) : (
                                displayValue
                            )}
                        </td>
                    );
                })}
            </tr>
            {isExpanded && (
                <tr>
                    <td colSpan={ORDER_COLUMN_LABELS_VISIBLE.length + 1} style={{ padding: 0, background: "#f4f6fb" }}>
                        <div style={{ borderLeft: `3px solid ${COLOR.primary}`, marginLeft: 48 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                                <thead>
                                    <tr>
                                        {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                            <th key={label} style={{ ...TH, background: "#eef0f7", fontSize: 11 }}>{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.length > 0 ? lineItems.map((li) => (
                                        <tr key={li.id} style={{ background: COLOR.white }}>
                                            {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => {
                                                const colId = LI_LABEL_TO_COL_ID[label];
                                                const col = li.column_values?.find((cv: any) => cv.id === colId);
                                                const val = getDisplayValue(col);
                                                return (
                                                    <td key={label} style={{ ...TD, fontSize: 12 }}>
                                                        {label === "Name" ? (
                                                            <a href={getMondayUrl(ORDER_ITEM_BOARD_ID, li.id)} target="_top"
                                                                style={{ color: COLOR.text, textDecoration: "none", fontWeight: 500 }}>
                                                                {li.name}
                                                            </a>
                                                        ) : label === "Status" ? (
                                                            <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, ...statusStyle(val) }}>
                                                                {val}
                                                            </span>
                                                        ) : val}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.length}
                                                style={{ padding: 16, textAlign: "center", color: COLOR.textMuted, fontSize: 12 }}>
                                                No line items
                                            </td>
                                        </tr>
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
