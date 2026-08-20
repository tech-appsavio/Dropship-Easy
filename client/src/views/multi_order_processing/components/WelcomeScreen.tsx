import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";
import { COLOR, RADIUS, SHADOW, btn } from "../styles";

const monday = mondaySdk();

// Bump this if the welcome content changes enough to re-show it to everyone.
const STORAGE_KEY = "mop_welcome_seen_v1";

// One-time welcome gate. Returns a tri-state `seen`:
//   null  → still checking storage (don't render the welcome OR the app yet)
//   false → not seen → show the welcome
//   true  → already seen → go straight to the app
// The check is best-effort and NEVER blocks the app: any storage failure resolves to
// `true` (skip the welcome) so a storage hiccup can't hide the actual tool.
export function useWelcomeGate(): { seen: boolean | null; markSeen: () => void } {
    // Fast path: if this browser already recorded it, skip instantly (no flash, no wait).
    const [seen, setSeen] = useState<boolean | null>(() => {
        try { return localStorage.getItem(STORAGE_KEY) ? true : null; } catch { return null; }
    });

    useEffect(() => {
        if (seen !== null) return; // already decided by the fast path
        let cancelled = false;
        // Safety net: if storage never answers, default to "seen" so the welcome check can
        // never wedge the app on a loading state.
        const timer = setTimeout(() => { if (!cancelled) setSeen(true); }, 2500);
        (async () => {
            try {
                const res: any = await monday.storage.getItem(STORAGE_KEY);
                const val = res?.data?.value;
                if (!cancelled) setSeen(!!val);
            } catch {
                if (!cancelled) setSeen(true); // never block the app on a storage error
            } finally {
                clearTimeout(timer);
            }
        })();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [seen]);

    const markSeen = () => {
        setSeen(true); // dismiss immediately
        try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
        try { monday.storage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    };

    return { seen, markSeen };
}

const STEPS: { n: number; title: string; desc: string }[] = [
    { n: 1, title: "Order Selection", desc: "Pick the confirmed Shopify orders you want to process." },
    { n: 2, title: "Supplier Selection", desc: "Assign a supplier to each item  multi-supplier orders split automatically." },
    { n: 3, title: "Courier Selection", desc: "Check serviceability and choose the best courier per shipment." },
    { n: 4, title: "Create Shipment & Manifest", desc: "Assign AWBs, create shipments, and generate labels & supplier manifests." },
];

// First-run welcome shown before the board view (monday UI/UX onboarding guideline). Purely
// additive: dismissing it with "Get started" reveals the normal wizard, unchanged.
export const WelcomeScreen: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => {
    return (
        <div style={{ padding: "32px 24px", width: "100%", boxSizing: "border-box", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
                <div
                    style={{
                        background: COLOR.white, borderRadius: RADIUS.lg, border: `1px solid ${COLOR.borderLight}`,
                        boxShadow: SHADOW.md, padding: "34px 36px",
                    }}
                >
                    {/* Header */}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: COLOR.primaryLight, color: COLOR.primary, borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.02em" }}>
                        🚀 Dropship Easy
                    </div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, margin: "16px 0 8px", color: COLOR.text, letterSpacing: "-0.02em" }}>
                        Welcome to Dropship Easy
                    </h1>
                    <p style={{ margin: 0, fontSize: 14.5, color: COLOR.textMuted, lineHeight: 1.6, maxWidth: "58ch" }}>
                        Dropship Easy turns your Shopify orders into monday records and runs the whole dropshipping
                        flow  supplier and courier selection, shipments, labels, and supplier manifests. Here's the
                        four-step flow you'll use each time:
                    </p>

                    {/* Hero screenshot (same-origin asset from public/how-to-assets) */}
                    <img
                        src="/how-to-assets/01-order-selection.png"
                        alt="Dropship Easy  the Bulk Order Processing view"
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        style={{ width: "100%", maxWidth: "100%", height: "auto", display: "block", marginTop: 20, border: `1px solid ${COLOR.borderLight}`, borderRadius: RADIUS.md, boxShadow: SHADOW.sm }}
                    />

                    {/* Steps */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, margin: "22px 0 24px" }}>
                        {STEPS.map((s) => (
                            <div key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: COLOR.bg, border: `1px solid ${COLOR.borderLight}`, borderRadius: RADIUS.md, padding: "14px 16px" }}>
                                <span style={{ flex: "0 0 auto", width: 28, height: 28, borderRadius: "50%", background: COLOR.primaryLight, color: COLOR.primary, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{s.n}</span>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.text, marginBottom: 2 }}>{s.title}</div>
                                    <div style={{ fontSize: 12.5, color: COLOR.textMuted, lineHeight: 1.5 }}>{s.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* First-time setup note */}
                    <div style={{ background: COLOR.primaryLight, border: `1px solid var(--ds-info-bd)`, borderRadius: RADIUS.md, padding: "13px 16px", marginBottom: 24 }}>
                        <div style={{ fontSize: 13, color: COLOR.text, lineHeight: 1.55 }}>
                            <b>Before your first run:</b> add your products and Supplier Products (which supplier sells
                            what), and enter your WhatsApp &amp; Shiprocket credentials in <b>Account Settings</b>. The
                            full <b>How-to</b> guide walks through everything, including creating your WhatsApp template.
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <button onClick={onGetStarted} style={{ ...btn("primary") }}>
                            Get started
                        </button>
                        <a
                            href="/how-to.html"
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 13.5, fontWeight: 600, color: COLOR.primary, textDecoration: "none" }}
                        >
                            Open the full How-to guide →
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WelcomeScreen;
