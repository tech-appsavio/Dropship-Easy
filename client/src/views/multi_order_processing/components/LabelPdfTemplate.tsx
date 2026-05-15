// src/views/multi_order_processing/components/LabelPdfTemplate.tsx
import React, { forwardRef } from "react";

export const LabelPdfTemplate = forwardRef<HTMLDivElement, { item: any }>(({ item }, ref) => {
    if (!item) return null;

    return (
        <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
            <div ref={ref} style={{
                width: "600px",
                background: "white",
                color: "black",
                border: "3px solid black", // Thick outer border
                fontFamily: "Arial, sans-serif",
                padding: "0"
            }}>
                {/* SECTION 1 & 3: Deliver To & Shipped By */}
                <div style={{ display: "flex", borderBottom: "2px solid black" }}>
                    <div style={{ flex: 1.5, padding: "15px", borderRight: "2px solid black" }}>
                        <p style={{ fontWeight: "bold", margin: "0 0 5px 0" }}>DELIVER To:</p>
                        <p style={{ fontSize: "18px", fontWeight: "bold", margin: "0" }}>{item.customerName}</p>
                        <p style={{ margin: "5px 0", lineHeight: "1.3", fontSize: "14px" }}>{item.billingAddress}</p>
                        <p style={{ margin: "10px 0 0 0", fontWeight: "bold" }}>MOBILE NO.: {item.customerPhone}</p>
                        <p style={{ margin: "2px 0" }}>Email: {item.customerEmail}</p>
                    </div>
                    <div style={{ flex: 1, padding: "15px", fontSize: "13px" }}>
                        <p style={{ fontWeight: "bold", margin: "0 0 5px 0" }}>Shipped By (If undelivered, return to):</p>
                        <p style={{ margin: "0" }}>246/2, Jayantipur, Preetam Nagar</p>
                        <p style={{ margin: "2px 0" }}>Mobile No: 91-xxxx</p>
                    </div>
                </div>

                {/* SECTION 2: Order Info */}
                <div style={{ padding: "15px" }}>
                    <p style={{ fontWeight: "bold", fontSize: "16px", margin: "0" }}>ORDER #: {item.orderId}</p>

                    {/* Dummy Barcode */}
                    <div style={{
                        margin: "15px 0",
                        padding: "10px",
                        border: "1px solid black",
                        textAlign: "center",
                        fontSize: "28px",
                        letterSpacing: "4px"
                    }}>
                        ||||||||||||||||||||||||||||||||||||
                    </div>

                    {/* Thick line before financial info */}
                    <div style={{ borderTop: "3px solid black", paddingTop: "10px" }}>
                        <p style={{ margin: "0", fontWeight: "bold", fontSize: "14px" }}>
                            {item.paymentMethod ? item.paymentMethod.toUpperCase() : "TO BE PAID"}
                        </p>
                        <p style={{ margin: "5px 0 0 0", fontSize: "18px", fontWeight: "bold" }}>
                            COLLECT COD - Rs. {item.totalPrice}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
});