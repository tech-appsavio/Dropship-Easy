import express from "express";
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
    const { pickup_postcode, delivery_postcode, weight, cod } = req.query;
    try {
        const token = await getShiprocketToken();
        const url = `${SR_BASE}/courier/serviceability/?pickup_postcode=${pickup_postcode}&delivery_postcode=${delivery_postcode}&weight=${weight}&cod=${cod}`;
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
        const response = await fetch(`${SR_BASE}/courier/assign/awb`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
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

export default router;
