import React, { useEffect, useState, useCallback } from "react";
import { Loader } from "@vibe/core";
import mondaySdk from "monday-sdk-js";
import ShipRocketService from "../../services/shiprocketCourier";
import { ORDER_ALL_COLUMN_IDS_MAP } from "../multi_order_processing/columns";
import { initializeBoardIds } from "../multi_order_processing/utils/initBoardIds";
import { initializeColumnIds } from "../multi_order_processing/utils/initColumnIds";
import { useViewOnly, ViewOnlyMessage } from "../../shared/viewOnly";

const monday = mondaySdk();

// ── Design tokens (aligned with monday Vibe) ────────────────────────────────────
// Theme-aware tokens (CSS variables from shared/theme.css) so Order Tracking tracks
// monday's light / dark / black theme like the rest of the app.
const C = {
    bg: "var(--ds-bg)",
    card: "var(--ds-surface)",
    border: "var(--ds-border-light)",
    borderStrong: "var(--ds-border)",
    text: "var(--ds-text)",
    muted: "var(--ds-text-muted)",
    faint: "var(--ds-text-faint)",
    primary: "var(--ds-primary)",
    primarySoft: "var(--ds-primary-light)",
    success: "var(--ds-success)",
    successBg: "var(--ds-success-light)",
    warning: "var(--ds-warning)",
    warningBg: "var(--ds-warning-light)",
    danger: "var(--ds-danger)",
    dangerBg: "var(--ds-danger-light)",
    subtle: "var(--ds-neutral-bg)",
};

// Semantic colour for a status string.
function statusColor(status: string): { text: string; bg: string } {
    const s = (status || "").toLowerCase();
    if (s.includes("delivered")) return { text: C.success, bg: C.successBg };
    if (s.includes("out for delivery")) return { text: C.warning, bg: C.warningBg };
    if (s.includes("return") || s.includes("failed") || s.includes("cancel") || s.includes("reject") || s.includes("rto") || s.includes("undeliver"))
        return { text: C.danger, bg: C.dangerBg };
    if (s.includes("transit") || s.includes("ship") || s.includes("pick") || s.includes("dispatch"))
        return { text: C.primary, bg: C.primarySoft };
    return { text: C.muted, bg: C.subtle };
}

function formatDate(raw: string | null | undefined): string {
    if (!raw) return "-";
    try {
        const d = new Date(raw.replace(" ", "T"));
        if (isNaN(d.getTime())) return raw;
        return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
        return raw;
    }
}

// ── Icons (inline SVG, stroke = currentColor) 
type IconName = "package" | "boxCheck" | "truck" | "pin" | "check" | "user" | "calendar" | "refresh" | "clock" | "alert" | "route";
const ICON_PATHS: Record<IconName, React.ReactNode> = {
    package: <><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="M3 7l9 5 9-5" /><path d="M12 12v10" /></>,
    boxCheck: <><path d="M21 8v9l-9 5-9-5V7l9-5 6 3.3" /><path d="M9 11l2.5 2.5L22 4" /></>,
    truck: <><rect x="1" y="6" width="14" height="10" rx="1.5" /><path d="M15 9h4l3 3.2V16h-7z" /><circle cx="5.5" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    pin: <><path d="M12 21s7-5.7 7-11a7 7 0 0 0-14 0c0 5.3 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16.5 9" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.2 4-6.4 8-6.4S20 16.8 20 21" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
    refresh: <><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 3.5v5h-5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
    alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 9.5v4M12 16.5h.01" /></>,
    route: <><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="6" r="2.5" /><path d="M7.5 18H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h6.5" /></>,
};
function Icon({ name, size = 18, color = "currentColor", strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            {ICON_PATHS[name]}
        </svg>
    );
}

// ── Shipment progress stages ─────────────
const STAGES: { label: string; icon: IconName }[] = [
    { label: "Order Placed", icon: "package" },
    { label: "Picked Up", icon: "boxCheck" },
    { label: "In Transit", icon: "truck" },
    { label: "Out for Delivery", icon: "pin" },
    { label: "Delivered", icon: "check" },
];
function currentStage(status: string): { index: number; exception?: string } {
    const s = (status || "").toLowerCase();
    if (/return|rto/.test(s)) return { index: 2, exception: "Returned" };
    if (/cancel/.test(s)) return { index: 0, exception: "Cancelled" };
    if (/out for delivery/.test(s)) return { index: 3 };
    if (/delivered/.test(s)) return { index: 4 };
    if (/undeliver|failed/.test(s)) return { index: 3, exception: "Undelivered" };
    if (/transit|dispatch|shipped|in.?transit/.test(s)) return { index: 2 };
    if (/pick/.test(s)) return { index: 1 };
    return { index: 0 };
}
function eventIcon(status: string): IconName {
    const s = (status || "").toLowerCase();
    if (/deliver/.test(s) && !/out for/.test(s)) return "check";
    if (/out for delivery/.test(s)) return "pin";
    if (/transit|dispatch|ship/.test(s)) return "truck";
    if (/pick/.test(s)) return "boxCheck";
    if (/return|rto|cancel|fail|undeliver/.test(s)) return "alert";
    return "clock";
}

interface Activity { date: string; status: string; activity: string; location: string; }
interface TrackingData {
    awb_code: string;
    courier_name: string;
    current_status: string;
    etd?: string;
    pickup_date?: string;
    delivered_date?: string;
    origin?: string;
    destination?: string;
    consignee_name?: string;
    activities: Activity[];
}

// Injected once  enables hover, media queries, and animation that inline styles can't do.
const STYLES = `
.ot-root { --fade: 0; }
@keyframes otFade { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: none;} }
.ot-anim { animation: otFade .35s ease both; }
.ot-card { background:${C.card}; border:1px solid ${C.border}; border-radius:12px; box-shadow:0 1px 3px rgba(29,41,57,.05); }
.ot-refresh { display:inline-flex; align-items:center; gap:7px; padding:8px 14px; border-radius:9px; border:1px solid ${C.borderStrong}; background:${C.card}; cursor:pointer; font-size:13px; font-weight:600; color:${C.text}; transition:background .15s, box-shadow .15s, border-color .15s; }
.ot-refresh:hover:not(:disabled) { background:${C.primarySoft}; border-color:${C.primary}; color:${C.primary}; }
.ot-refresh:disabled { opacity:.55; cursor:default; }
.ot-refresh svg { transition:transform .5s; }
.ot-refresh:hover:not(:disabled) svg { transform:rotate(-90deg); }
.ot-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px 20px; }
.ot-stepper { display:flex; align-items:flex-start; gap:0; overflow-x:auto; padding:4px 2px 6px; scrollbar-width:thin; }
.ot-step { flex:1 1 0; min-width:88px; display:flex; flex-direction:column; align-items:center; text-align:center; position:relative; }
.ot-seg { position:absolute; top:20px; height:3px; border-radius:2px; }
.ot-tl-item { position:relative; padding-left:40px; padding-bottom:22px; }
.ot-tl-item:last-child { padding-bottom:0; }
.ot-tl-line { position:absolute; left:15px; top:30px; bottom:-4px; width:2px; background:${C.border}; }
.ot-tl-item:last-child .ot-tl-line { display:none; }
@media (max-width:520px){ .ot-hide-sm{ display:none; } .ot-step{ min-width:72px; } }
`;

export default function OrderTracking() {
    const [itemName, setItemName] = useState("");
    const [srShipmentId, setSrShipmentId] = useState("");
    const [srOrderId, setSrOrderId] = useState("");
    const [awbCode, setAwbCode] = useState("");

    const [loading, setLoading] = useState(true);
    const [tracking, setTracking] = useState<TrackingData | null>(null);
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const { loading: viewerLoading, isViewOnly } = useViewOnly();

    // ── Load item context from Monday ────────────
    useEffect(() => {
        monday.listen("context", async (res: any) => {
            const itemId = res?.data?.itemId;
            if (!itemId) {
                setError("No item selected. Open this view from an order item.");
                setLoading(false);
                return;
            }
            try {
                await initializeBoardIds();
                await initializeColumnIds();

                const result: any = await monday.api(`query {
                    items(ids: [${itemId}]) {
                        id name
                        column_values(ids: [
                            "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID}",
                            "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID}",
                            "${ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID}"
                        ]) { id text }
                    }
                }`);
                const item = result?.data?.items?.[0];
                if (!item) { setError("Item not found."); setLoading(false); return; }
                const getCol = (id: string) => item.column_values.find((c: any) => c.id === id)?.text || "";
                setItemName(item.name);
                setSrShipmentId(getCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID));
                setSrOrderId(getCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID));
                setAwbCode(getCol(ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_AWB_ID));
            } catch (e: any) {
                setError("Failed to load item data: " + e.message);
                setLoading(false);
            }
        });
    }, []);

    // ── Fetch tracking data ───────────
    const fetchTracking = useCallback(async (shipmentId: string, orderId: string) => {
        setError("");
        try {
            let raw: any = null;
            if (shipmentId) raw = await ShipRocketService.trackShipment(shipmentId);
            if (!raw?.tracking_data && orderId) raw = await ShipRocketService.trackByOrderId(orderId);

            if (!raw?.tracking_data) {
                setError("No tracking data available for this shipment yet.");
                setTracking(null);
                return;
            }

            const td = raw.tracking_data;
            const shipmentTrack = Array.isArray(td.shipment_track) ? td.shipment_track[0] : null;
            const activities: Activity[] = (
                td.activities || td.shipment_track_activities || shipmentTrack?.activities || []
            ).map((a: any) => ({
                date: a.date || a.datetime || "",
                status: a.status || "",
                activity: a.activity || a.description || "",
                location: a.location || a.city || "",
            }));

            setTracking({
                awb_code: td.awb_code || shipmentTrack?.awb_code || awbCode || "-",
                courier_name: td.courier_name || shipmentTrack?.courier_name || "-",
                current_status: td.current_status || td.shipment_status_label || shipmentTrack?.current_status || "Unknown",
                etd: td.etd || shipmentTrack?.etd || td.edd || shipmentTrack?.edd || "",
                pickup_date: td.pickup_date || shipmentTrack?.pickup_date || "",
                delivered_date: td.delivered_date || shipmentTrack?.delivered_date || "",
                origin: td.origin || shipmentTrack?.origin || "",
                destination: td.destination || shipmentTrack?.destination || "",
                consignee_name: td.consignee_name || shipmentTrack?.consignee_name || "",
                activities,
            });
            // The user got real value  live shipment tracking is shown (monday value-created
            // event; fire every time it happens, not just the first).
            monday.execute("valueCreatedForUser");
        } catch (e: any) {
            setError("Tracking fetch failed: " + e.message);
            setTracking(null);
        }
    }, [awbCode]);

    useEffect(() => {
        if (!srShipmentId && !srOrderId) return;
        setLoading(true);
        fetchTracking(srShipmentId, srOrderId).finally(() => setLoading(false));
    }, [srShipmentId, srOrderId, fetchTracking]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchTracking(srShipmentId, srOrderId);
        setRefreshing(false);
    };

    // ── Render ──────────
    const shell = (children: React.ReactNode) => (
        <div className="ot-root" style={{ padding: "20px 22px", background: C.bg, minHeight: "100vh", fontFamily: "Inter, Roboto, -apple-system, 'Segoe UI', sans-serif", color: C.text, boxSizing: "border-box" }}>
            <style>{STYLES}</style>
            {children}
        </div>
    );

    if (!viewerLoading && isViewOnly) return shell(<ViewOnlyMessage />);

    if (loading) {
        return shell(
            <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", alignItems: "center", minHeight: 320, color: C.muted }}>
                <Loader size={34} />
                <span style={{ fontSize: 13 }}>Fetching latest tracking…</span>
            </div>
        );
    }

    const sc = tracking ? statusColor(tracking.current_status) : { text: C.muted, bg: C.subtle };
    const stage = tracking ? currentStage(tracking.current_status) : { index: 0 };
    const delivered = !!tracking && stage.index >= 4 && !stage.exception;

    return shell(
        <div className="ot-anim" style={{ maxWidth: 860, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                        Shipment Tracking
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15, wordBreak: "break-word" }}>{itemName || "—"}</div>
                    {(srShipmentId || (tracking && tracking.awb_code !== "-")) && (
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
                            {tracking?.awb_code && tracking.awb_code !== "-" && <span>AWB <b style={{ color: C.text, fontFamily: "ui-monospace, monospace" }}>{tracking.awb_code}</b></span>}
                            {srShipmentId && <span className="ot-hide-sm">Shipment ID {srShipmentId}</span>}
                        </div>
                    )}
                </div>
                <button className="ot-refresh" onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? <Loader size={14} /> : <Icon name="refresh" size={15} />}
                    Refresh
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="ot-card ot-anim" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.dangerBg, borderColor: "var(--ds-danger-bd)", padding: "12px 15px", marginBottom: 16, fontSize: 13, color: C.danger }}>
                    <span style={{ flex: "0 0 auto", marginTop: 1 }}><Icon name="alert" size={16} /></span>
                    <span>{error}</span>
                </div>
            )}

            {/* Empty state */}
            {!tracking && !error && (
                <div className="ot-card" style={{ padding: "40px 24px", textAlign: "center", color: C.muted }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.subtle, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: C.faint }}>
                        <Icon name="truck" size={26} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>No tracking yet</div>
                    <div style={{ fontSize: 13 }}>This shipment hasn't been dispatched, or the courier hasn't shared updates yet.</div>
                </div>
            )}

            {tracking && (
                <>
                    {/* Status hero */}
                    <div className="ot-card" style={{ padding: "18px 20px", marginBottom: 14, display: "flex", alignItems: "center", gap: 16, borderLeft: `4px solid ${stage.exception ? C.danger : sc.text}` }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: (stage.exception ? C.dangerBg : sc.bg), color: (stage.exception ? C.danger : sc.text), display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                            <Icon name={stage.exception ? "alert" : STAGES[Math.min(stage.index, 4)].icon} size={24} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>Current status</div>
                            <div style={{ fontSize: 19, fontWeight: 700, color: (stage.exception ? C.danger : C.text), marginTop: 2, wordBreak: "break-word" }}>
                                {stage.exception || tracking.current_status}
                            </div>
                        </div>
                        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>{delivered ? "Delivered" : "Est. delivery"}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: delivered ? C.success : C.text, marginTop: 3 }}>
                                {delivered ? formatDate(tracking.delivered_date) : (tracking.etd ? formatDate(tracking.etd) : "—")}
                            </div>
                        </div>
                    </div>

                    {/* Progress stepper */}
                    <div className="ot-card" style={{ padding: "20px 18px 14px", marginBottom: 14 }}>
                        <div className="ot-stepper">
                            {STAGES.map((st, i) => {
                                const done = !stage.exception && i < stage.index;
                                const active = !stage.exception && i === stage.index;
                                const reached = done || active;
                                const ring = active ? sc.text : done ? C.success : C.border;
                                const fill = active ? sc.bg : done ? C.successBg : C.subtle;
                                const ic = done ? C.success : active ? sc.text : C.faint;
                                return (
                                    <div className="ot-step" key={st.label}>
                                        {i < STAGES.length - 1 && (
                                            <div className="ot-seg" style={{ left: "50%", right: `-50%`, width: "100%", background: i < stage.index && !stage.exception ? C.success : C.border }} />
                                        )}
                                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: fill, border: `2px solid ${ring}`, color: ic, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, boxShadow: active ? `0 0 0 4px ${sc.bg}` : "none", transition: "all .2s" }}>
                                            <Icon name={done ? "check" : st.icon} size={19} />
                                        </div>
                                        <div style={{ fontSize: 11.5, fontWeight: reached ? 700 : 500, color: reached ? C.text : C.faint, marginTop: 8, lineHeight: 1.25 }}>
                                            {st.label}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Shipment details */}
                    <div className="ot-card" style={{ padding: "18px 20px", marginBottom: 14 }}>
                        <SectionTitle icon="route" label="Shipment Details" />
                        <div className="ot-grid" style={{ marginTop: 14 }}>
                            <Field icon="boxCheck" label="AWB Number" value={tracking.awb_code} mono />
                            <Field icon="truck" label="Courier" value={tracking.courier_name} />
                            <Field icon="pin" label="Origin" value={tracking.origin || "-"} />
                            <Field icon="pin" label="Destination" value={tracking.destination || "-"} />
                            {tracking.consignee_name ? <Field icon="user" label="Consignee" value={tracking.consignee_name} /> : null}
                            <Field icon="calendar" label="Picked Up" value={tracking.pickup_date ? formatDate(tracking.pickup_date) : "-"} />
                            <Field
                                icon="calendar"
                                label={delivered ? "Delivered On" : "Expected Delivery"}
                                value={delivered ? formatDate(tracking.delivered_date) : (tracking.etd ? formatDate(tracking.etd) : "-")}
                                valueColor={delivered ? C.success : undefined}
                            />
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="ot-card" style={{ padding: "18px 20px" }}>
                        <SectionTitle icon="clock" label="Tracking Timeline" count={tracking.activities.length} />
                        {tracking.activities.length === 0 ? (
                            <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "22px 0" }}>
                                No activity recorded yet.
                            </div>
                        ) : (
                            <div style={{ marginTop: 16 }}>
                                {tracking.activities.map((act, i) => {
                                    const asc = statusColor(act.status);
                                    const latest = i === 0;
                                    return (
                                        <div className="ot-tl-item" key={i}>
                                            <div className="ot-tl-line" />
                                            <div style={{ position: "absolute", left: 0, top: 1, width: 32, height: 32, borderRadius: "50%", background: latest ? asc.bg : C.subtle, border: `2px solid ${latest ? asc.text : C.border}`, color: latest ? asc.text : C.faint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <Icon name={eventIcon(act.status)} size={16} />
                                            </div>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                                                <span style={{ fontSize: 13.5, fontWeight: latest ? 700 : 600, color: latest ? C.text : C.muted }}>
                                                    {act.activity || act.status || "Update"}
                                                </span>
                                                {act.status && act.status !== act.activity && (
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: asc.text, background: asc.bg }}>
                                                        {act.status}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 12, color: C.muted, marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                                <span>{formatDate(act.date)}</span>
                                                {act.location && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="pin" size={12} color={C.faint} /> {act.location}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function SectionTitle({ icon, label, count }: { icon: IconName; label: string; count?: number }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ color: C.primary, display: "inline-flex" }}><Icon name={icon} size={17} /></span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</span>
            {typeof count === "number" && count > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: C.subtle, borderRadius: 20, padding: "1px 8px" }}>{count}</span>
            )}
        </div>
    );
}

function Field({ icon, label, value, mono, valueColor }: { icon: IconName; label: string; value: string; mono?: boolean; valueColor?: string }) {
    return (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: C.faint, flex: "0 0 auto", marginTop: 2 }}><Icon name={icon} size={16} /></span>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: valueColor || C.text, wordBreak: "break-word", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>
                    {value || "-"}
                </div>
            </div>
        </div>
    );
}
