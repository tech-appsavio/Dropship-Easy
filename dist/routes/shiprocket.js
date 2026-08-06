"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shipment_cancel_controller_1 = require("../controllers/shipment-cancel-controller");
const webhook_authentication_1 = require("../middlewares/webhook-authentication");
const account_store_1 = require("../services/account-store");
const verify_monday_jwt_1 = require("../utils/verify-monday-jwt");
const router = express_1.default.Router();
const SHIPROCKET_LOGIN_URL = "https://apiv2.shiprocket.in/v1/external/auth/login";
const SR_BASE = "https://apiv2.shiprocket.in/v1/external";
// Resolves the caller's monday account from a verified session token. Returns
// undefined if the token is missing/invalid — callers must treat that as
// unauthenticated (see requireMondayAuth below), not silently proceed. The frontend
// sends a monday.get("sessionToken") value here, which is signed with the OAuth
// Client Secret, not the Signing Secret — verifyMondayJwt tries both.
function resolveAccount(req) {
    var _a, _b;
    try {
        const auth = ((_a = req.headers.authorization) !== null && _a !== void 0 ? _a : (_b = req.query) === null || _b === void 0 ? void 0 : _b.token);
        if (auth) {
            const decoded = (0, verify_monday_jwt_1.verifyMondayJwt)(auth);
            return (0, verify_monday_jwt_1.sessionFromDecoded)(decoded).accountId;
        }
    }
    catch ( /* invalid/absent token */_c) { /* invalid/absent token */ }
    return undefined;
}
// Requires a verified monday session token before any Shiprocket proxy call is
// allowed through. Without this, these routes were callable by anyone with no
// credentials at all, silently falling back to the server's own env Shiprocket
// account — a real account-takeover-adjacent gap, not just a missing-feature.
// The frontend (client/src/services/shiprocketCourier.ts) always sends this token
// via monday.get("sessionToken") when the app is opened inside monday.com, so this
// does not change behavior for normal app usage — only for direct/unauthenticated
// calls to these URLs.
function requireMondayAuth(req, res, next) {
    const accountId = resolveAccount(req);
    if (!accountId) {
        return res.status(401).json({
            error: "Missing or invalid monday session. Open this app from within monday.com — direct/unauthenticated requests to this endpoint are not allowed.",
        });
    }
    req.mondayAccountId = accountId;
    next();
}
// Resolves a Shiprocket token STRICTLY from the account's saved credentials (Settings
// screen). Multi-tenant: no env fallback — an unconfigured account gets a clear error
// instead of silently using the developer's Shiprocket account.
function getShiprocketToken(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = accountId ? yield (0, account_store_1.getAccountSettings)(accountId) : null;
        const apiToken = settings === null || settings === void 0 ? void 0 : settings.shiprocketApiToken;
        if (apiToken && apiToken !== "paste_your_api_token_here")
            return apiToken;
        const email = settings === null || settings === void 0 ? void 0 : settings.shiprocketEmail;
        const password = settings === null || settings === void 0 ? void 0 : settings.shiprocketPassword;
        if (!email || !password)
            throw new Error("Shiprocket is not configured for this account. Add your Shiprocket Email and Password (or API Token) in Account Settings → Shiprocket.");
        const res = yield fetch(SHIPROCKET_LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok)
            throw new Error(`ShipRocket auth failed: ${res.statusText}`);
        const data = yield res.json();
        return data.token;
    });
}
// ── Serviceability ────────────────────────────────────────────────────────────
router.get("/api/shiprocket/serviceability", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { pickup_postcode, delivery_postcode, weight, cod, shipment_id } = req.query;
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        // When a shipment_id is provided, use it so Shiprocket validates against the exact
        // same shipment parameters it will use during AWB assignment (avoids "courier not
        // available" mismatch caused by pickup-location pincode differences).
        const url = shipment_id
            ? `${SR_BASE}/courier/serviceability/?shipment_id=${shipment_id}&cod=${cod !== null && cod !== void 0 ? cod : 0}`
            : `${SR_BASE}/courier/serviceability/?pickup_postcode=${pickup_postcode}&delivery_postcode=${delivery_postcode}&weight=${weight}&cod=${cod}`;
        const response = yield fetch(url, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Fetch all pickup locations ────────────────────────────────────────────────
router.get("/api/shiprocket/pickup-locations", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const response = yield fetch(`${SR_BASE}/settings/company/pickup`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Add new pickup address ────────────────────────────────────────────────────
router.post("/api/shiprocket/pickup/add", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const response = yield fetch(`${SR_BASE}/settings/company/addpickup`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Update pickup location on an order ───────────────────────────────────────
router.post("/api/shiprocket/pickup/update", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const response = yield fetch(`${SR_BASE}/orders/address/pickup`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Assign AWB ────────────────────────────────────────────────────────────────
router.post("/api/shiprocket/awb/assign", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        // Shiprocket requires shipment_id and courier_id as numbers, not strings
        const response = yield fetch(`${SR_BASE}/courier/assign/awb`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(Object.assign(Object.assign({}, req.body), { shipment_id: Number(req.body.shipment_id), courier_id: Number(req.body.courier_id) })),
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Generate pickup ───────────────────────────────────────────────────────────
router.post("/api/shiprocket/pickup/generate", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const response = yield fetch(`${SR_BASE}/courier/generate/pickup`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Create order (adhoc) ─────────────────────────────────────────────────────
router.post("/api/shiprocket/orders/create", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const response = yield fetch(`${SR_BASE}/orders/create/adhoc`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Track by Shipment ID (primary) ───────────────────────────────────────────
router.get("/api/shiprocket/track/shipment/:shipmentId", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const response = yield fetch(`${SR_BASE}/courier/track/shipment/${req.params.shipmentId}`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Track by Order ID (fallback) ──────────────────────────────────────────────
router.get("/api/shiprocket/track/order", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { order_id, channel_id } = req.query;
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const url = channel_id
            ? `${SR_BASE}/courier/track?order_id=${order_id}&channel_id=${channel_id}`
            : `${SR_BASE}/courier/track?order_id=${order_id}`;
        const response = yield fetch(url, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Cancel shipment AWBs ──────────────────────────────────────────────────────
router.post("/api/shiprocket/shipment/cancel-awbs", requireMondayAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken(resolveAccount(req));
        const response = yield fetch(`${SR_BASE}/orders/cancel/shipment/awbs`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        res.json(yield response.json());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// ── Shipment cancellation webhook (Monday-triggered) ──────────────────────────
// Server-to-server webhook: cancels the Shiprocket shipment when a Shipments-board
// item's status is set to "Cancel". Distinct from the UI-driven /shipment/cancel-awbs
// proxy above, which the Multi-Order UI calls directly.
// Primary: per-account token in the path identifies the account (secure, no spoofable
// ?account= param). Set this URL on the Shipments board's cancel automation.
router.post("/api/shiprocket/webhook/cancel_shipment/:token", webhook_authentication_1.webhookTokenAuthMiddleware, shipment_cancel_controller_1.ShipmentCancelController.onStatusChange);
// Legacy: account resolved from a ?account= query param — kept for backward compatibility.
router.post("/api/shiprocket/webhook/cancel_shipment", webhook_authentication_1.webhookAuthenticationMiddleware, shipment_cancel_controller_1.ShipmentCancelController.onStatusChange);
exports.default = router;
