import express from "express";
import { ShipmentCancelController } from "../controllers/shipment-cancel-controller";
import { webhookAuthenticationMiddleware } from "../middlewares/webhook-authentication";
const router = express.Router();

const SHIPROCKET_LOGIN_URL = "https://apiv2.shiprocket.in/v1/external/auth/login";
const SR_BASE = "https://apiv2.shiprocket.in/v1/external";

async function getShiprocketToken(): Promise<string> {
    const res = await fetch(SHIPROCKET_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: process.env.SHIPROCKET_EMAIL,
            password: process.env.SHIPROCKET_PASSWORD,
        }),
    });
    if (!res.ok) throw new Error(`ShipRocket auth failed: ${res.statusText}`);
    const data: any = await res.json();
    return data.token;
}

// ── Serviceability ────────────────────────────────────────────────────────────
router.get("/api/shiprocket/serviceability", async (req, res) => {
    const { pickup_postcode, delivery_postcode, weight, cod, shipment_id } = req.query;
    try {
        const token = await getShiprocketToken();
        // When a shipment_id is provided, use it so Shiprocket validates against the exact
        // same shipment parameters it will use during AWB assignment (avoids "courier not
        // available" mismatch caused by pickup-location pincode differences).
        const url = shipment_id
            ? `${SR_BASE}/courier/serviceability/?shipment_id=${shipment_id}&cod=${cod ?? 0}`
            : `${SR_BASE}/courier/serviceability/?pickup_postcode=${pickup_postcode}&delivery_postcode=${delivery_postcode}&weight=${weight}&cod=${cod}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Fetch all pickup locations ────────────────────────────────────────────────
router.get("/api/shiprocket/pickup-locations", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await fetch(`${SR_BASE}/settings/company/pickup`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Add new pickup address ────────────────────────────────────────────────────
router.post("/api/shiprocket/pickup/add", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await fetch(`${SR_BASE}/settings/company/addpickup`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Update pickup location on an order ───────────────────────────────────────
router.post("/api/shiprocket/pickup/update", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await fetch(`${SR_BASE}/orders/address/pickup`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Assign AWB ────────────────────────────────────────────────────────────────
router.post("/api/shiprocket/awb/assign", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        // Shiprocket requires shipment_id and courier_id as numbers, not strings
        const response = await fetch(`${SR_BASE}/courier/assign/awb`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...req.body,
                shipment_id: Number(req.body.shipment_id),
                courier_id: Number(req.body.courier_id),
            }),
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Generate pickup ───────────────────────────────────────────────────────────
router.post("/api/shiprocket/pickup/generate", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await fetch(`${SR_BASE}/courier/generate/pickup`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Create order (adhoc) ─────────────────────────────────────────────────────
router.post("/api/shiprocket/orders/create", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await fetch(`${SR_BASE}/orders/create/adhoc`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Track by Shipment ID (primary) ───────────────────────────────────────────
router.get("/api/shiprocket/track/shipment/:shipmentId", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await fetch(`${SR_BASE}/courier/track/shipment/${req.params.shipmentId}`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Track by Order ID (fallback) ──────────────────────────────────────────────
router.get("/api/shiprocket/track/order", async (req, res) => {
    const { order_id, channel_id } = req.query;
    try {
        const token = await getShiprocketToken();
        const url = channel_id
            ? `${SR_BASE}/courier/track?order_id=${order_id}&channel_id=${channel_id}`
            : `${SR_BASE}/courier/track?order_id=${order_id}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Cancel shipment AWBs ──────────────────────────────────────────────────────
router.post("/api/shiprocket/shipment/cancel-awbs", async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const response = await fetch(`${SR_BASE}/orders/cancel/shipment/awbs`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Shipment cancellation webhook (Monday-triggered) ──────────────────────────
// Server-to-server webhook: cancels the Shiprocket shipment when a Shipments-board
// item's status is set to "Cancel". Distinct from the UI-driven /shipment/cancel-awbs
// proxy above, which the Multi-Order UI calls directly.
router.post("/api/shiprocket/webhook/cancel_shipment", webhookAuthenticationMiddleware, ShipmentCancelController.onStatusChange);

export default router;
