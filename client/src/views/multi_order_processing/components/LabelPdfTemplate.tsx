// src/views/multi_order_processing/components/LabelPdfTemplate.tsx
import React, { forwardRef } from "react";

interface LabelPdfTemplateProps {
    items: any[];
}

export const LabelPdfTemplate = forwardRef<HTMLDivElement, LabelPdfTemplateProps>(({ items }, ref) => {
    if (!items || items.length === 0) return null;

    const cleanDisplay = (val: any) => {
        if (!val || val === "N/A" || val === "-" || val === "Null" || val === "[Address]") return "";
        return val;
    };

    return (
        /* Hidden layout container contextually positioned to stay fully rendered without affecting UI flow */
        <div style={{ position: "absolute", left: "-9999px", top: 0, width: "450px" }}>
            <div ref={ref} style={{ background: "#ffffff" }}>
                {items.map((item: any, index: number) => (
                    <div
                        key={item.id || index}
                        style={{
                            width: "420px",
                            height: "580px",
                            color: "#000000",
                            border: "3px solid #000000",
                            fontFamily: "Arial, sans-serif",
                            boxSizing: "border-box",
                            padding: "0",
                            margin: "0 0 50px 0", // Separate visual elements on screens
                            pageBreakAfter: "always", // Enforce page break point in print context
                            backgroundColor: "#ffffff",
                        }}
                    >
                        {/* SECTION 1 & 3: Deliver To & Shipped By */}
                        <div style={{ display: "flex", borderBottom: "2px solid #000000" }}>
                            {/* Deliver To */}
                            <div style={{ flex: 1.5, padding: "12px", borderRight: "2px solid #000000" }}>
                                <p style={{ fontWeight: "bold", margin: "0 0 4px 0", fontSize: "11px" }}>DELIVER To:</p>
                                <p style={{ fontSize: "14px", fontWeight: "bold", margin: "0 0 6px 0" }}>{cleanDisplay(item.customerName)}</p>
                                <p style={{ margin: "0 0 8px 0", lineHeight: "1.3", fontSize: "11px", wordBreak: "break-word" }}>
                                    {cleanDisplay(item.billingAddress)}
                                </p>
                                {cleanDisplay(item.customerPhone) && (
                                    <p style={{ margin: "4px 0 0 0", fontSize: "11px", fontWeight: "bold" }}>MOBILE NO.: {cleanDisplay(item.customerPhone)}</p>
                                )}
                                {cleanDisplay(item.customerEmail) && (
                                    <p style={{ margin: "2px 0 0 0", fontSize: "10px" }}>Email: {cleanDisplay(item.customerEmail)}</p>
                                )}
                            </div>

                            {/* Shipped By */}
                            <div style={{ flex: 1, padding: "12px", fontSize: "10px", backgroundColor: "#fafafa" }}>
                                <p style={{ fontWeight: "bold", margin: "0 0 4px 0", fontSize: "10px" }}>Shipped By (If undelivered, return to):</p>
                                <p style={{ margin: "0 0 2px 0", fontWeight: "bold", fontSize: "11px" }}>{cleanDisplay(item.supplierName)}</p>
                                <p style={{ margin: "0 0 6px 0", lineHeight: "1.2", wordBreak: "break-word" }}>{cleanDisplay(item.supplierAddress)}</p>
                                {cleanDisplay(item.supplierPhone) && <p style={{ margin: "2px 0 0 0" }}>Phone: {cleanDisplay(item.supplierPhone)}</p>}
                                {cleanDisplay(item.supplierEmail) && <p style={{ margin: "1px 0 0 0" }}>Email: {cleanDisplay(item.supplierEmail)}</p>}
                            </div>
                        </div>

                        {/* SECTION 2: Order Information Block */}
                        <div style={{ padding: "12px", borderBottom: "2px solid #000000" }}>
                            <p style={{ fontWeight: "bold", fontSize: "14px", margin: "0 0 6px 0" }}>ORDER #: {cleanDisplay(item.orderId)}</p>
                            {/* Dummy Barcode Segment */}
                            <div
                                style={{
                                    margin: "6px 0",
                                    padding: "6px 0",
                                    border: "1px solid #000000",
                                    textAlign: "center",
                                    fontSize: "22px",
                                    letterSpacing: "6px",
                                    fontWeight: "normal",
                                }}
                            >
                                ||||||||||||||||||||||||||||||||||
                            </div>
                        </div>

                        {/* SECTION 4: Weight & Custom Dimension Details */}
                        <div style={{ padding: "12px", borderBottom: "2px solid #000000", fontSize: "12px", lineHeight: "1.4" }}>
                            <p style={{ margin: "0" }}>
                                <strong>WEIGHT:</strong> 1 | <strong>DIMENSIONS:</strong> 29×26×23 (cm)
                            </p>
                            <p style={{ margin: "4px 0 0 0", fontWeight: "bold" }}>
                                {item.paymentMethod ? String(item.paymentMethod).toUpperCase() : "CASH ON DELIVERY"}
                            </p>
                            <p style={{ margin: "2px 0 0 0", fontSize: "15px", fontWeight: "bold" }}>COLLECT COD - Rs. {cleanDisplay(item.totalPrice)}</p>
                        </div>

                        {/* SECTION 5: Courier Route Block */}
                        <div style={{ padding: "12px" }}>
                            <p style={{ fontWeight: "bold", fontSize: "14px", margin: "0 0 6px 0" }}>{cleanDisplay(item.courierName)}</p>
                            <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#333" }}>AWB #: {cleanDisplay(item.sku)}</p>
                            <div
                                style={{
                                    padding: "4px 0",
                                    border: "1px solid #000000",
                                    textAlign: "center",
                                    fontSize: "18px",
                                    letterSpacing: "4px",
                                }}
                            >
                                ||||||||||||||||||||||||||||||||
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});