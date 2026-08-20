import React from "react";
import { COLOR, SHADOW, RADIUS } from "../styles";

// How-to / onboarding link surfaced in-app (monday marketplace requirement).
// Served by the app itself from client/public/how-to.html, so the link is always valid
// and self-hosted at the app's own domain.
const HELP_URL = "/how-to.html";

const STAGES = [
    { key: "ORDERS",    label: "Order Selection",     hint: "Pick confirmed orders" },
    { key: "SUPPLIERS", label: "Supplier Selection",  hint: "Assign suppliers" },
    { key: "COURIERS",  label: "Courier Selection",   hint: "Choose couriers" },
    { key: "MANIFEST",  label: "Create Shipment & Manifest", hint: "Ship & generate" },
];

const OrderProcessingPathBase: React.FC<{ activeView: string }> = ({ activeView }) => {
    const activeIndex = STAGES.findIndex((s) => s.key === activeView);
    const N = STAGES.length;
    const edge = 100 / (2 * N);
    const span = 100 - 2 * edge;
    const fillW = N > 1 ? (activeIndex / (N - 1)) * span : 0;

    return (
        <div style={{ marginBottom: 14 }}>
            {/* Title */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: COLOR.text, letterSpacing: "-0.02em" }}>
                        Bulk Order Processing
                    </h2>
                    <p style={{ margin: "3px 0 0", fontSize: 12.5, color: COLOR.textMuted }}>
                        Step {activeIndex + 1} of {STAGES.length} — {STAGES[activeIndex]?.label}
                    </p>
                </div>
                <a
                    href={HELP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto", padding: "7px 12px", borderRadius: RADIUS.md, border: `1px solid ${COLOR.border}`, background: COLOR.white, color: COLOR.primary, fontSize: 12.5, fontWeight: 600, textDecoration: "none", boxShadow: SHADOW.sm }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7" /><path d="M12 17h.01" /></svg>
                    How to use
                </a>
            </div>

            {/* Stepper */}
            <div style={{ background: COLOR.white, border: `1px solid ${COLOR.borderLight}`, borderRadius: RADIUS.lg, padding: "18px 22px 14px", boxShadow: SHADOW.sm }}>
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 8 }}>
                    {/* Track (behind the nodes) spans first node center → last node center */}
                    <div style={{ position: "absolute", left: `${edge}%`, width: `${span}%`, top: 15, height: 3, background: COLOR.borderLight, borderRadius: 2 }} />
                    <div style={{ position: "absolute", left: `${edge}%`, width: `${fillW}%`, top: 15, height: 3, background: COLOR.primary, borderRadius: 2, transition: "width .35s ease" }} />

                    {STAGES.map((stage, i) => {
                        const done = i < activeIndex;
                        const active = i === activeIndex;
                        const reached = done || active;
                        return (
                            <div key={stage.key} style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: "50%",
                                    background: reached ? COLOR.primary : COLOR.white,
                                    border: `2px solid ${reached ? COLOR.primary : COLOR.border}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 13, fontWeight: 700,
                                    color: reached ? "#fff" : COLOR.textFaint,
                                    boxShadow: active ? SHADOW.focus : "none",
                                    transition: "all .2s",
                                }}>
                                    {done ? (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                                    ) : (i + 1)}
                                </div>
                                <div style={{ textAlign: "center", marginTop: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: active ? 700 : reached ? 600 : 500, color: active ? COLOR.primary : reached ? COLOR.text : COLOR.textMuted, lineHeight: 1.2 }}>
                                        {stage.label}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: active ? COLOR.primary : COLOR.textFaint, marginTop: 2, fontWeight: 500 }}>
                                        {active ? "In progress" : done ? "Completed" : stage.hint}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// Only re-renders when the active step changes not on every selection change upstream.
export const OrderProcessingPath = React.memo(OrderProcessingPathBase);
