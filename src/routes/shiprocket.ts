import express from "express";
import { ShipmentCancelController } from "../controllers/shipment-cancel-controller";
import { webhookAuthenticationMiddleware, webhookTokenAuthMiddleware } from "../middlewares/webhook-authentication";
import { getAccountSettings } from "../services/account-store";
import { verifyMondayJwt, sessionFromDecoded } from "../utils/verify-monday-jwt";
const router = express.Router();

const SHIPROCKET_LOGIN_URL = "https://apiv2.shiprocket.in/v1/external/auth/login";
const SR_BASE = "https://apiv2.shiprocket.in/v1/external";

// Resolves the caller's monday account from a verified session token. Returns
// undefined if the token is missing/invalid  callers must treat that as
// unauthenticated (see requireMondayAuth below), not silently proceed. The frontend
// sends a monday.get("sessionToken") value here, which is signed with the OAuth
// Client Secret, not the Signing Secret  verifyMondayJwt tries both.
function resolveAccount(req: express.Request): string | undefined {
    try {
        const auth = (req.headers.authorization ?? (req.query?.token as string)) as string | undefined;
        if (auth) {
            const decoded = verifyMondayJwt(auth);
            return sessionFromDecoded(decoded).accountId;
        }
    } catch { /* invalid/absent token */ }
    return undefined;
}

// Requires a verified monday session token before any Shiprocket proxy call is
// allowed through. Without this, these routes were callable by anyone with no
// credentials at all, silently falling back to the server's own env Shiprocket
// account  a real account-takeover-adjacent gap, not just a missing-feature.
// The frontend (client/src/services/shiprocketCourier.ts) always sends this token
// via monday.get("sessionToken") when the app is opened inside monday.com, so this
// does not change behavior for normal app usage  only for direct/unauthenticated
// calls to these URLs.
function requireMondayAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const accountId = resolveAccount(req);
    if (!accountId) {
        return res.status(401).json({
            error: "Missing or invalid monday session. Open this app from within monday.com direct/unauthenticated requests to this endpoint are not allowed.",
        });
    }
    (req as any).mondayAccountId = accountId;
    next();
}

// Resolves a Shiprocket token STRICTLY from the account's saved credentials (Settings
// screen). Multi-tenant: no env fallback  an unconfigured account gets a clear error
// instead of silently using the developer's Shiprocket account.
async function getShiprocketToken(accountId?: string): Promise<string> {
    const settings = accountId ? await getAccountSettings(accountId) : null;

    const apiToken = settings?.shiprocketApiToken;
    if (apiToken && apiToken !== "paste_your_api_token_here") return apiToken;

    const email = settings?.shiprocketEmail;
    const password = settings?.shiprocketPassword;
    if (!email || !password) throw new Error("Shiprocket is not configured for this account. Add your Shiprocket Email and Password (or API Token) in Account Settings → Shiprocket.");

    const res = await fetch(SHIPROCKET_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`ShipRocket auth failed: ${res.statusText}`);
    const data: any = await res.json();
    return data.token;
}

// ── Serviceability ────────────────────────────────────────────────────────────
router.get("/api/shiprocket/serviceability", requireMondayAuth, async (req, res) => {
    const { pickup_postcode, delivery_postcode, weight, cod, shipment_id } = req.query;
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
router.get("/api/shiprocket/pickup-locations", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
        const response = await fetch(`${SR_BASE}/settings/company/pickup`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Add new pickup address ────────────────────────────────────────────────────
router.post("/api/shiprocket/pickup/add", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
router.post("/api/shiprocket/pickup/update", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
router.post("/api/shiprocket/awb/assign", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
router.post("/api/shiprocket/pickup/generate", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
router.post("/api/shiprocket/orders/create", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
router.get("/api/shiprocket/track/shipment/:shipmentId", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
        const response = await fetch(`${SR_BASE}/courier/track/shipment/${req.params.shipmentId}`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(await response.json());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Track by Order ID (fallback) ──────────────────────────────────────────────
router.get("/api/shiprocket/track/order", requireMondayAuth, async (req, res) => {
    const { order_id, channel_id } = req.query;
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
router.post("/api/shiprocket/shipment/cancel-awbs", requireMondayAuth, async (req, res) => {
    try {
        const token = await getShiprocketToken(resolveAccount(req));
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
// Primary: per-account token in the path identifies the account (secure, no spoofable
// ?account= param). Set this URL on the Shipments board's cancel automation.
router.post("/api/shiprocket/webhook/cancel_shipment/:token", webhookTokenAuthMiddleware, ShipmentCancelController.onStatusChange);
// Legacy: account resolved from a ?account= query param  kept for backward compatibility.
router.post("/api/shiprocket/webhook/cancel_shipment", webhookAuthenticationMiddleware, ShipmentCancelController.onStatusChange);

export default router;
