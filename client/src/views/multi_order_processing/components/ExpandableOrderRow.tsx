import React, { useState } from "react";
import { Order } from "../types";
import {
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    ORDER_COLUMN_LABELS_VISIBLE,
    ORDERLINEITEMS_COLUMN_LABELS_VISIBLE,
    ORDER_LABEL_TO_KEY,
    ORDERLINEITEMS_LABEL_TO_KEY,
} from "../columns";
import { ORDER_BOARD_ID, ORDER_ITEM_BOARD_ID } from "../boardIds";
import { COLOR, TH, TD } from "../styles";

const statusStyle = (val: string): React.CSSProperties => {
    if (val === "Confirmed")           return { background: COLOR.successLight, color: COLOR.success, border: "1px solid var(--ds-success-bd)" };
    if (val === "Supplier Selected")   return { background: COLOR.primaryLight, color: COLOR.primary, border: "1px solid var(--ds-info-bd)" };
    if (val === "Manifest Generated")  return { background: COLOR.primaryLight, color: COLOR.primary, border: "1px solid var(--ds-info-bd)" };
    if (val === "Shipped")             return { background: COLOR.successLight, color: COLOR.success, border: "1px solid var(--ds-success-bd)" };
    return { background: COLOR.bgHeader, color: COLOR.textMuted, border: `1px solid ${COLOR.border}` };
};

const ExpandableOrderRowBase: React.FC<{
    order: Order;
    isSelected: boolean;
    onSelect: (id: string) => void;
    lineItems: any[];
}> = ({ order, isSelected, onSelect, lineItems }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [hover, setHover] = useState(false);

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
            <tr
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{ backgroundColor: isSelected ? COLOR.primaryLight : hover ? COLOR.bgHeader : isExpanded ? "var(--ds-surface-alt)" : COLOR.white, transition: "background 0.15s" }}
            >
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
                                        title={isExpanded ? "Collapse line items" : "Expand line items"}
                                        style={{ background: isExpanded ? COLOR.primaryLight : "transparent", border: "none", cursor: "pointer", width: 22, height: 22, borderRadius: 5, color: isExpanded ? COLOR.primary : COLOR.textMuted, display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s" }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}>
                                            <path d="M9 6l6 6-6 6" />
                                        </svg>
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
                    <td colSpan={ORDER_COLUMN_LABELS_VISIBLE.length + 1} style={{ padding: 0, background: "var(--ds-bg)" }}>
                        <div style={{ borderLeft: `3px solid ${COLOR.primary}`, marginLeft: 48 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                                <thead>
                                    <tr>
                                        {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                            <th key={label} style={{ ...TH, background: "var(--ds-bg-header)", fontSize: 11 }}>{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.length > 0 ? lineItems.map((li) => (
                                        <tr key={li.id} style={{ background: COLOR.white }}>
                                            {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => {
                                                // Resolve the column id at render time — the id maps are
                                                // populated after module load (see initColumnIds), so a
                                                // module-level snapshot would capture empty strings.
                                                const liKey = ORDERLINEITEMS_LABEL_TO_KEY[label];
                                                const colId = liKey ? ORDERLINEITEMS_ALL_COLUMN_IDS_MAP[liKey] : "";
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

// Memoized: a row only re-renders when its own props change (selection, line items),
// not when an unrelated row is toggled or the search box is typed into.
export const ExpandableOrderRow = React.memo(ExpandableOrderRowBase);
