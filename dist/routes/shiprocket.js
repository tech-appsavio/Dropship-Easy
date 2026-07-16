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
const router = express_1.default.Router();
const SHIPROCKET_LOGIN_URL = "https://apiv2.shiprocket.in/v1/external/auth/login";
const SR_BASE = "https://apiv2.shiprocket.in/v1/external";
function getShiprocketToken() {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch(SHIPROCKET_LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: process.env.SHIPROCKET_EMAIL,
                password: process.env.SHIPROCKET_PASSWORD,
            }),
        });
        if (!res.ok)
            throw new Error(`ShipRocket auth failed: ${res.statusText}`);
        const data = yield res.json();
        return data.token;
    });
}
// ── Serviceability ────────────────────────────────────────────────────────────
router.get("/api/shiprocket/serviceability", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { pickup_postcode, delivery_postcode, weight, cod, shipment_id } = req.query;
    try {
        const token = yield getShiprocketToken();
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
router.get("/api/shiprocket/pickup-locations", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
router.post("/api/shiprocket/pickup/add", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
router.post("/api/shiprocket/pickup/update", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
router.post("/api/shiprocket/awb/assign", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
router.post("/api/shiprocket/pickup/generate", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
router.post("/api/shiprocket/orders/create", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
router.get("/api/shiprocket/track/shipment/:shipmentId", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
router.get("/api/shiprocket/track/order", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { order_id, channel_id } = req.query;
    try {
        const token = yield getShiprocketToken();
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
router.post("/api/shiprocket/shipment/cancel-awbs", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = yield getShiprocketToken();
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
exports.default = router;
