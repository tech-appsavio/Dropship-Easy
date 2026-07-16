import React, { useEffect, useState, useCallback } from "react";
import { Loader } from "@vibe/core";
import mondaySdk from "monday-sdk-js";
import ShipRocketService from "../../services/shiprocketCourier";
import { ORDER_ALL_COLUMN_IDS_MAP } from "../multi_order_processing/constants";

const monday = mondaySdk();

// ── Colours ────────────────────────────────────────────────────────────────────
const C = {
    bg: "#f8f9fb",
    card: "#ffffff",
    border: "#d0d4e0",
    borderLight: "#e6e8ef",
    text: "#323338",
    muted: "#676879",
    primary: "#0073ea",
    success: "#1a7f4b",
    successBg: "#f2faf6",
    warning: "#b45309",
    warningBg: "#fffbeb",
    danger: "#e2445c",
    dangerBg: "#fff8f8",
    blue: "#0073ea",
    blueBg: "#e6f2ff",
};

function statusColor(status: string): { text: string; bg: string } {
    const s = (status || "").toLowerCase();
    if (s.includes("delivered")) return { text: C.success, bg: C.successBg };
    if (s.includes("out for delivery")) return { text: C.warning, bg: C.warningBg };
    if (s.includes("return") || s.includes("failed") || s.includes("cancel") || s.includes("reject"))
        return { text: C.danger, bg: C.dangerBg };
    if (s.includes("transit") || s.includes("ship") || s.includes("pick") || s.includes("dispatch"))
        return { text: C.blue, bg: C.blueBg };
    return { text: C.muted, bg: C.borderLight };
}

function formatDate(raw: string | null | undefined): string {
    if (!raw) return "-";
    try {
        const d = new Date(raw.replace(" ", "T"));
        return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
        return raw;
    }
}

interface Activity {
    date: string;
    status: string;
    activity: string;
    location: string;
}

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

export default function OrderTracking() {
    const [itemName, setItemName] = useState("");
    const [srShipmentId, setSrShipmentId] = useState("");
    const [srOrderId, setSrOrderId] = useState("");
    const [awbCode, setAwbCode] = useState("");

    const [loading, setLoading] = useState(true);
    const [tracking, setTracking] = useState<TrackingData | null>(null);
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    // ── Load item context from Monday ─────────────────────────────────────────
    useEffect(() => {
        monday.listen("context", async (res: any) => {
            const itemId = res?.data?.itemId;
            if (!itemId) {
                setError("No item selected. Open this view from an order item.");
                setLoading(false);
                return;
            }
            try {
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

    // ── Fetch tracking data ───────────────────────────────────────────────────
    const fetchTracking = useCallback(async (shipmentId: string, orderId: string) => {
        setError("");
        try {
            let raw: any = null;

            // Primary: shipment ID
            if (shipmentId) {
                raw = await ShipRocketService.trackShipment(shipmentId);
            }

            // Fallback: order ID
            if (!raw?.tracking_data && orderId) {
                raw = await ShipRocketService.trackByOrderId(orderId);
            }

            if (!raw?.tracking_data) {
                setError("No tracking data available for this shipment yet.");
                setTracking(null);
                return;
            }

            const td = raw.tracking_data;

            // Normalise — shipment-based and order-based APIs have slightly different shapes
            const shipmentTrack = Array.isArray(td.shipment_track) ? td.shipment_track[0] : null;
            const activities: Activity[] = (
                td.activities ||
                td.shipment_track_activities ||
                shipmentTrack?.activities ||
                []
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
        } catch (e: any) {
            setError("Tracking fetch failed: " + e.message);
            setTracking(null);
        }
    }, [awbCode]);

    // Fetch once we have the IDs
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

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
                <Loader size={36} />
            </div>
        );
    }

    const statusColors = tracking ? statusColor(tracking.current_status) : { text: C.muted, bg: C.borderLight };

    return (
        <div style={{ padding: 20, background: C.bg, minHeight: "100vh", fontFamily: "Roboto, sans-serif" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                        Order Tracking
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{itemName || "—"}</div>
                    {srShipmentId && (
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Shipment ID: {srShipmentId}</div>
                    )}
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.border}`,
                        background: "#fff", cursor: refreshing ? "not-allowed" : "pointer",
                        fontSize: 13, color: C.text, fontWeight: 500, opacity: refreshing ? 0.6 : 1,
                    }}
                >
                    {refreshing ? <Loader size={14} /> : "↻"} Refresh
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div style={{ background: C.dangerBg, border: `1px solid #f5c2c2`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.danger }}>
                    {error}
                </div>
            )}

            {!tracking && !error && (
                <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
                    No tracking information available. Shipment may not have been dispatched yet.
                </div>
            )}

            {tracking && (
                <>
                    {/* Shipment summary card */}
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px" }}>

                            <InfoRow label="AWB Number" value={tracking.awb_code} bold />
                            <InfoRow label="Courier" value={tracking.courier_name} />

                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                                    Current Status
                                </div>
                                <span style={{
                                    display: "inline-block", padding: "3px 10px", borderRadius: 12,
                                    fontSize: 12, fontWeight: 600,
                                    color: statusColors.text, background: statusColors.bg,
                                    border: `1px solid ${statusColors.text}30`,
                                }}>
                                    {tracking.current_status}
                                </span>
                            </div>

                            <InfoRow
                                label={tracking.delivered_date ? "Delivered On" : "Expected Delivery"}
                                value={tracking.delivered_date ? formatDate(tracking.delivered_date) : (tracking.etd ? formatDate(tracking.etd) : "-")}
                                valueColor={tracking.delivered_date ? C.success : undefined}
                            />

                            {tracking.origin && <InfoRow label="Origin" value={tracking.origin} />}
                            {tracking.destination && <InfoRow label="Destination" value={tracking.destination} />}
                            {tracking.consignee_name && <InfoRow label="Consignee" value={tracking.consignee_name} />}
                            {tracking.pickup_date && <InfoRow label="Picked Up" value={formatDate(tracking.pickup_date)} />}
                        </div>
                    </div>

                    {/* Activity timeline */}
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
                            Tracking Timeline
                        </div>

                        {tracking.activities.length === 0 ? (
                            <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "16px 0" }}>
                                No activity recorded yet.
                            </div>
                        ) : (
                            <div style={{ position: "relative" }}>
                                {/* Vertical line */}
                                <div style={{
                                    position: "absolute", left: 7, top: 8, bottom: 8,
                                    width: 2, background: C.borderLight,
                                }} />

                                {tracking.activities.map((act, i) => {
                                    const sc = statusColor(act.status);
                                    return (
                                        <div key={i} style={{ display: "flex", gap: 16, marginBottom: i < tracking.activities.length - 1 ? 20 : 0, position: "relative" }}>
                                            {/* Dot */}
                                            <div style={{
                                                width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                                                background: i === 0 ? sc.text : C.borderLight,
                                                border: `2px solid ${i === 0 ? sc.text : C.border}`,
                                                zIndex: 1,
                                            }} />
                                            {/* Content */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", marginBottom: 2 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? C.text : C.muted }}>
                                                        {act.activity || act.status}
                                                    </span>
                                                    {act.status && act.status !== act.activity && (
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 10,
                                                            color: sc.text, background: sc.bg,
                                                        }}>
                                                            {act.status}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 11, color: C.muted }}>
                                                    {formatDate(act.date)}
                                                    {act.location && <span style={{ marginLeft: 8 }}>· {act.location}</span>}
                                                </div>
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

function InfoRow({ label, value, bold, valueColor }: { label: string; value: string; bold?: boolean; valueColor?: string }) {
    return (
        <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#676879", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
                {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: valueColor || "#323338", wordBreak: "break-all" }}>
                {value || "-"}
            </div>
        </div>
    );
}
