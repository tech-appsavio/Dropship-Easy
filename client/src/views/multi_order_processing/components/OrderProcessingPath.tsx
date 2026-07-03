import React from "react";
import { COLOR } from "../styles";

const STAGES = [
    { key: "ORDERS",    label: "Order Selection" },
    { key: "SUPPLIERS", label: "Supplier Selection" },
    { key: "COURIERS",  label: "Courier Selection" },
    { key: "MANIFEST",  label: "Manifest Generation" },
];

export const OrderProcessingPath: React.FC<{ activeView: string }> = ({ activeView }) => {
    const activeIndex = STAGES.findIndex((s) => s.key === activeView);

    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: COLOR.text, letterSpacing: "-0.02em" }}>
                        Bulk Order Processing
                    </h2>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: COLOR.textMuted }}>
                        Manage orders through supplier assignment, courier selection, and manifest generation
                    </p>
                </div>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: COLOR.white, border: `1px solid ${COLOR.borderLight}`, borderRadius: 8, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                {STAGES.map((stage, i) => {
                    const done   = i < activeIndex;
                    const active = i === activeIndex;

                    const circleColor  = done || active ? COLOR.primary : "#e2e4e9";
                    const circleBorder = done || active ? COLOR.primary : "#d0d4e0";
                    const labelColor   = active ? COLOR.primary : done ? COLOR.text : COLOR.textMuted;
                    const lineColor    = i < activeIndex ? COLOR.primary : COLOR.borderLight;

                    return (
                        <React.Fragment key={stage.key}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: "0 0 auto" }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: "50%",
                                    background: done || active ? circleColor : COLOR.white,
                                    border: `2px solid ${circleBorder}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: done ? 11 : 11, fontWeight: 700,
                                    color: done || active ? "#fff" : COLOR.textMuted,
                                    transition: "all 0.2s",
                                    boxShadow: active ? `0 0 0 3px rgba(0,115,234,0.14)` : "none",
                                    flexShrink: 0,
                                }}>
                                    {done ? "✓" : i + 1}
                                </div>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: labelColor, whiteSpace: "nowrap" }}>
                                        {stage.label}
                                    </div>
                                    {(done || active) && (
                                        <div style={{ fontSize: 9, color: done ? "#52c41a" : COLOR.primary, fontWeight: 600, marginTop: 1 }}>
                                            {done ? "Done" : "Active"}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {i < STAGES.length - 1 && (
                                <div style={{ flex: 1, maxWidth: 80, height: 2, background: lineColor, margin: "0 6px", marginBottom: 18, transition: "background 0.3s", minWidth: 16 }} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};
