// src/views/multi_order_processing/MultiOrderProcessing.tsx
import React, { useState, useMemo } from "react";
import { Loader } from "@vibe/core";
import { useOrderData } from "./hooks/useOrderData";
import { ORDER_COLUMN_LABELS_VISIBLE } from "./constants";
import { ExpandableOrderRow } from "./components/ExpandableOrderRow";

export const MultiOrderProcessing: React.FC = () => {
  const { orders, loading, error } = useOrderData();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOrders = useMemo(() => {
    return orders.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [orders, searchTerm]);

  if (loading) return <div style={{textAlign: "center", padding: "50px"}}><Loader size={40} /></div>;
  if (error) return <div style={{color: "red", padding: "20px"}}>Error: {error}</div>;

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "auto" }}>
      <h1>Multi Order Processing</h1>
      <input
        type="text"
        placeholder="Search orders..."
        style={{ marginBottom: "20px", padding: "8px", width: "100%", borderRadius: "4px", border: "1px solid #ccc" }}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #c3c7d4", textAlign: "left", backgroundColor: "#f1f3f5" }}>
            <th style={{ padding: "12px" }}>Select</th>
            {/* Dynamically generate headers from the Visible array */}
            {ORDER_COLUMN_LABELS_VISIBLE.map(label => (
              <th key={label} style={{ padding: "12px" }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map((order) => (
            <ExpandableOrderRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MultiOrderProcessing;