// src/views/multi_order_processing/components/ExpandableOrderRow.tsx
import React, { useState } from "react";
import { Order } from "../types";
import { ORDER_COLUMN_LABELS_VISIBLE } from "../constants";

export const ExpandableOrderRow: React.FC<{ order: Order }> = ({ order }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <tr style={{ borderBottom: "1px solid #dcdcdc" }}>
        <td style={{ padding: "12px", textAlign: "center" }}>
          <input type="checkbox" />
        </td>
        {ORDER_COLUMN_LABELS_VISIBLE.map((label) => {
            // FIX: If label is "OrderId", it looks for order["ORDERID"]
            const key = label.toUpperCase();
            const displayValue = label === "Name" ? order.name : order[key];

          return (
            <td
              key={label}
              style={{ padding: "12px", cursor: label === "Name" ? "pointer" : "default" }}
              onClick={() => label === "Name" && setIsExpanded(!isExpanded)}
            >
              {label === "Name" && <span style={{ marginRight: "8px" }}>{isExpanded ? "▼" : "▶"}</span>}
              {displayValue}
            </td>
          );
        })}
      </tr>
    </>
  );
};