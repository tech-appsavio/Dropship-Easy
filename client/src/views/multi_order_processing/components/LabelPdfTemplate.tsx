// src/views/multi_order_processing/components/LabelPdfTemplate.tsx
import React, { forwardRef } from "react";

export const LabelPdfTemplate = forwardRef<HTMLDivElement, { item: any }>(({ item }, ref) => {
    if (!item) return null;

    // Filter helper to ensure blank values do not render fallback text, "Null", or "N/A"
    const cleanDisplay = (val: any) => {
        if (!val || val === "N/A" || val === "-" || val === "Null" || val === "[Address]") return "";
        return val;
    };

    return (
        <div style={{ position: "fixed", top: 0, left: 0, width: "0", height: "0", overflow: "hidden", zIndex: -1 }}>
            <div
                ref={ref}
                style={{
                    width: "420px",
                    minHeight: "600px",
                    background: "#ffffff",
                    color: "#000000",
                    border: "3px solid #000000",
                    fontFamily: "Arial, sans-serif",
                    boxSizing: "border-box",
                }}
            >
                {/* SECTION 1 & 3: Deliver To & Shipped By */}
                <div style={{ display: "flex", borderBottom: "2px solid #000000" }}>
                    {/* Deliver To (Customer Data) */}
                    <div style={{ flex: 1.5, padding: "12px", borderRight: "2px solid #000000" }}>
                        <p style={{ fontWeight: "bold", margin: "0 0 4px 0", fontSize: "12px" }}>DELIVER To:</p>
                        <p style={{ fontSize: "15px", fontWeight: "bold", margin: "0 0 6px 0" }}>{cleanDisplay(item.customerName)}</p>
                        <p style={{ margin: "0 0 8px 0", lineHeight: "1.3", fontSize: "12px", wordBreak: "break-word" }}>{cleanDisplay(item.billingAddress)}</p>
                        {cleanDisplay(item.customerPhone) && (
                            <p style={{ margin: "4px 0 0 0", fontSize: "12px", fontWeight: "bold" }}>MOBILE NO.: {cleanDisplay(item.customerPhone)}</p>
                        )}
                        {cleanDisplay(item.customerEmail) && <p style={{ margin: "2px 0 0 0", fontSize: "11px" }}>Email: {cleanDisplay(item.customerEmail)}</p>}
                    </div>

                    {/* Shipped By (Supplier Data) */}
                    <div style={{ flex: 1, padding: "12px", fontSize: "11px", backgroundColor: "#fafafa" }}>
                        <p style={{ fontWeight: "bold", margin: "0 0 4px 0", fontSize: "11px" }}>Shipped By (If undelivered, return to):</p>
                        <p style={{ margin: "0 0 2px 0", fontWeight: "bold", fontSize: "12px" }}>{cleanDisplay(item.supplierName)}</p>
                        <p style={{ margin: "0 0 6px 0", lineHeight: "1.2", wordBreak: "break-word" }}>{cleanDisplay(item.supplierAddress)}</p>
                        {cleanDisplay(item.supplierPhone) && <p style={{ margin: "2px 0 0 0" }}>Phone: {cleanDisplay(item.supplierPhone)}</p>}
                        {cleanDisplay(item.supplierEmail) && <p style={{ margin: "1px 0 0 0" }}>Email: {cleanDisplay(item.supplierEmail)}</p>}
                    </div>
                </div>

                {/* SECTION 2: Order Details */}
                <div style={{ padding: "12px" }}>
                    <p style={{ fontWeight: "bold", fontSize: "14px", margin: "0 0 10px 0" }}>ORDER #: {cleanDisplay(item.orderId)}</p>

                    {/* Barcode representation */}
                    <div
                        style={{
                            margin: "12px 0",
                            padding: "8px",
                            border: "1px solid #000000",
                            textAlign: "center",
                            fontSize: "24px",
                            letterSpacing: "6px",
                            fontWeight: "normal",
                        }}
                    >
                        ||||||||||||||||||||||||||||||||||
                    </div>

                    {/* Financial metrics block */}
                    <div style={{ borderTop: "3px solid #000000", paddingTop: "10px", marginTop: "15px" }}>
                        <p style={{ margin: "0", fontWeight: "bold", fontSize: "13px", letterSpacing: "0.5px" }}>
                            {item.paymentMethod ? String(item.paymentMethod).toUpperCase() : "TO BE PAID"}
                        </p>
                        <p style={{ margin: "4px 0 0 0", fontSize: "16px", fontWeight: "bold" }}>COLLECT COD - Rs. {cleanDisplay(item.totalPrice)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
});