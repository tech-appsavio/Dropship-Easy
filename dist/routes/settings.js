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
const express_1 = require("express");
const authentication_1 = __importDefault(require("../middlewares/authentication"));
const account_store_1 = require("../services/account-store");
const monday_service_1 = __importDefault(require("../services/monday-service"));
const error_log_1 = require("../services/error-log");
const router = (0, express_1.Router)();
// Builds the account's per-account webhook URLs from its token. APP_URL is the stable
// monday-code hosting URL; the same token secures every webhook for the account.
const appBase = () => (process.env.APP_URL || '').replace(/\/$/, '');
function webhookUrl(token) {
    return `${appBase()}/api/shopify/order_create/${token}`;
}
function cancelShipmentUrl(token) {
    return `${appBase()}/api/shiprocket/webhook/cancel_shipment/${token}`;
}
// Fields the Settings screen can read/write. Keeps the API tight and predictable.
const ALLOWED_FIELDS = [
    'whatsappAccessToken', 'whatsappPhoneId', 'whatsappBusinessAccountId',
    'whatsappWebhookVerifyToken', 'whatsappTemplateLanguage',
    'shiprocketEmail', 'shiprocketPassword', 'shiprocketApiToken', 'shiprocketPickupLocation',
    'shopifyStoreDomain',
];
// A one-glance setup health check for the Settings screen: is THIS account connected
// (OAuth), provisioned (boards created), and is its Shopify store correctly routed to
// it? Surfaces the exact mismatch (e.g. shop mapped to a different account) that silently
// breaks order webhooks.
router.get('/api/settings/status', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const accountId = ((_a = req.session) === null || _a === void 0 ? void 0 : _a.accountId) ? String(req.session.accountId) : '';
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const [token, config, settings] = yield Promise.all([
            (0, account_store_1.getAccountToken)(accountId),
            (0, account_store_1.getAccountConfig)(accountId),
            (0, account_store_1.getAccountSettings)(accountId),
        ]);
        // A stored token can be stale (revoked on uninstall). Verify it's still live so the
        // panel shows the truth; clear it if dead so the user is prompted to reconnect.
        let oauthConnected = !!token;
        if (token && !(yield monday_service_1.default.isTokenValid(token))) {
            yield (0, account_store_1.deleteAccountToken)(accountId);
            oauthConnected = false;
        }
        const whToken = yield (0, account_store_1.getOrCreateWebhookToken)(accountId);
        // Report which REQUIRED per-account settings are still missing, so the app can prompt
        // the user to fill them in the Settings tab (there is no dev-credential fallback).
        const missingSettings = [];
        const s = settings || {};
        const hasShiprocket = !!s.shiprocketApiToken || (!!s.shiprocketEmail && !!s.shiprocketPassword);
        if (!hasShiprocket)
            missingSettings.push('Shiprocket credentials (Email & Password, or API Token)');
        const hasWhatsapp = !!s.whatsappAccessToken && !!s.whatsappPhoneId && !!s.whatsappBusinessAccountId;
        if (!hasWhatsapp)
            missingSettings.push('WhatsApp credentials (Access Token, Phone Number ID, Business Account ID)');
        return res.json({
            accountId,
            oauthConnected,
            provisioned: !!(config === null || config === void 0 ? void 0 : config.provisioned) && !!(config === null || config === void 0 ? void 0 : config.boards) && Object.keys(config.boards).length > 0,
            boardCount: (config === null || config === void 0 ? void 0 : config.boards) ? Object.keys(config.boards).length : 0,
            webhookUrl: whToken ? webhookUrl(whToken) : '',
            cancelShipmentWebhookUrl: whToken ? cancelShipmentUrl(whToken) : '',
            missingSettings,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// Issues a fresh Shopify webhook URL for this account (old one stops working). The user
// must update the URL in their Shopify webhook settings after regenerating.
router.post('/api/settings/webhook-url/regenerate', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    try {
        const accountId = ((_b = req.session) === null || _b === void 0 ? void 0 : _b.accountId) ? String(req.session.accountId) : '';
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const token = yield (0, account_store_1.regenerateWebhookToken)(accountId);
        if (!token)
            return res.status(500).json({ error: 'could not regenerate token' });
        return res.json({ webhookUrl: webhookUrl(token) });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// The shop→account mapping is maintained automatically when the Shopify Store Domain is
// saved via POST /api/settings (see below), and the API token comes from OAuth — so the
// old manual "bootstrap-shop" endpoint (which took a pasted monday API token) is gone.
// Load the caller account's saved settings (for populating the form).
router.get('/api/settings', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    try {
        const accountId = (_c = req.session) === null || _c === void 0 ? void 0 : _c.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const settings = (yield (0, account_store_1.getAccountSettings)(String(accountId))) || {};
        return res.json({ settings });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// Save the caller account's settings (merged with existing).
router.post('/api/settings', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _d, _e;
    try {
        const accountId = (_d = req.session) === null || _d === void 0 ? void 0 : _d.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        // Input validation: only allow whitelisted fields, only accept string/number
        // primitives (reject objects/arrays), trim, and cap length so a client can't store
        // oversized or unexpected payloads.
        const MAX_LEN = 4096;
        const incoming = ((_e = req.body) === null || _e === void 0 ? void 0 : _e.settings) || {};
        const settings = {};
        for (const field of ALLOWED_FIELDS) {
            const v = incoming[field];
            if (v === undefined || v === null)
                continue;
            if (typeof v !== 'string' && typeof v !== 'number')
                continue; // ignore non-primitives
            const str = String(v).trim();
            if (str.length > MAX_LEN) {
                return res.status(400).json({ error: `Value for "${field}" is too long (max ${MAX_LEN} characters).` });
            }
            settings[field] = str;
        }
        yield (0, account_store_1.saveAccountSettings)(String(accountId), settings);
        // Keep the Shopify shop → account mapping in sync so the (session-less) Shopify
        // webhook can route to this account.
        if (settings.shopifyStoreDomain) {
            yield (0, account_store_1.mapShopToAccount)(settings.shopifyStoreDomain, String(accountId));
        }
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// Records an error from the frontend to the account's Error Logs board. Best-effort:
// the app calls this from its stage error handlers; the backend resolves the board and
// column IDs and writes the record.
router.post('/api/error-log', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _f;
    try {
        const accountId = (_f = req.session) === null || _f === void 0 ? void 0 : _f.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const b = req.body || {};
        if (!b.stage || !b.message)
            return res.status(400).json({ error: 'stage and message are required' });
        yield (0, error_log_1.logAccountError)(String(accountId), {
            stage: b.stage,
            severity: b.severity,
            message: String(b.message),
            technicalDetails: b.technicalDetails,
            suggestedSolution: b.suggestedSolution,
            orderId: b.orderId,
            splitOrderId: b.splitOrderId,
            orderItemId: b.orderItemId,
            splitOrderItemId: b.splitOrderItemId,
            supplier: b.supplier,
            courier: b.courier,
            sku: b.sku,
            retry: !!b.retry,
        });
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// Serve the SPA for the Settings board view.
router.get('/settings', (_req, res) => {
    res.sendFile('index.html', { root: 'client/build/' });
});
exports.default = router;
