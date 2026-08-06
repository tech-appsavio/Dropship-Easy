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
const oauth_controller_1 = require("../controllers/oauth-controller");
const authentication_1 = __importDefault(require("../middlewares/authentication"));
const account_store_1 = require("../services/account-store");
const board_provisioning_1 = require("../services/board-provisioning");
const provisioning_schema_1 = require("../services/provisioning-schema");
const verify_monday_jwt_1 = require("../utils/verify-monday-jwt");
const router = (0, express_1.Router)();
// Leniently resolve the monday account from the session token if one is present.
// Never throws — returns undefined so callers can still fall back to env board IDs.
// Tries both the Signing Secret and the OAuth Client Secret (see verify-monday-jwt.ts) —
// a monday.get("sessionToken") value (what the frontend actually sends here) is signed
// with the Client Secret, not the Signing Secret.
function accountFromRequest(req) {
    var _a, _b;
    try {
        const auth = ((_a = req.headers.authorization) !== null && _a !== void 0 ? _a : (_b = req.query) === null || _b === void 0 ? void 0 : _b.token);
        if (auth) {
            const decoded = (0, verify_monday_jwt_1.verifyMondayJwt)(auth);
            return (0, verify_monday_jwt_1.sessionFromDecoded)(decoded).accountId;
        }
    }
    catch ( /* invalid/absent token → env fallback */_c) { /* invalid/absent token → env fallback */ }
    return undefined;
}
// Board IDs are numeric — strip anything else (stray spaces, a trailing ";" copied
// from TS, quotes) so a malformed .env value can't break a GraphQL query like
// `boards(ids: 2028904077;)`. Empty/absent → undefined (frontend leaves it unset).
const cleanBoardId = (v) => {
    const digits = (v || '').replace(/\D/g, '');
    return digits || undefined;
};
// Read env board IDs at REQUEST time — not module load. `import routes` in app.ts
// runs before dotenv.config(), so anything read at module-load would be undefined.
// These are the tunnel/local fallback; a provisioned account's config wins over them.
const envBoardIds = () => ({
    orders: cleanBoardId(process.env.ORDER_BOARD_ID),
    lineItems: cleanBoardId(process.env.ORDER_ITEM_BOARD_ID),
    products: cleanBoardId(process.env.PRODUCTS_BOARD_ID),
    suppliers: cleanBoardId(process.env.SUPPLIER_BOARD_ID),
    supplierProducts: cleanBoardId(process.env.SUPPLIER_PRODUCT_BOARD_ID),
    supplierManifests: cleanBoardId(process.env.SUPPLIER_MANIFEST_BOARD_ID),
    shipments: cleanBoardId(process.env.SHIPMENTS_BOARD_ID),
    customers: cleanBoardId(process.env.CUSTOMER_BOARD_ID),
});
// monday OAuth 2.0 install/authorize flow
router.get('/oauth/authorize', oauth_controller_1.OAuthController.authorize);
router.get('/oauth/callback', oauth_controller_1.OAuthController.callback);
// Manually (re)provision boards for the caller's account — useful for testing or if
// install-time provisioning was interrupted. Idempotent: no-op if already provisioned.
router.post('/api/provision', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const accountId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.accountId;
        const token = (_b = req.session) === null || _b === void 0 ? void 0 : _b.shortLivedToken;
        if (!accountId || !token) {
            return res.status(401).json({ error: 'missing account session' });
        }
        const config = yield (0, board_provisioning_1.provisionAccount)(String(accountId), token);
        return res.json({ success: true, config });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// The board/column schema to provision. The FRONTEND creates the boards client-side via
// monday.api() (runs in the user's monday session — no token/OAuth needed for setup), so
// it needs the schema. Kept here as the single source of truth (titles + relationships).
router.get('/api/provision/schema', (_req, res) => {
    return res.json({ schema: provisioning_schema_1.PROVISIONING_SCHEMA });
});
// Tells the frontend whether THIS account still needs provisioning. Legacy account
// (LEGACY_ACCOUNT_ID) and local/tunnel dev report as provisioned with the env boards so
// they never re-create boards; any other account with no stored config → needs setup.
router.get('/api/provision/status', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    try {
        const accountId = (_c = req.session) === null || _c === void 0 ? void 0 : _c.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        console.log(`🔎 [provision/status] accountId="${accountId}"`);
        const stored = yield (0, account_store_1.getAccountConfig)(String(accountId));
        if ((stored === null || stored === void 0 ? void 0 : stored.boards) && Object.keys(stored.boards).length) {
            // Return whatever's stored (even a partial/half-provisioned config) so the
            // frontend can REUSE existing board IDs and only fill missing columns —
            // completeness is judged client-side against the schema, not this flag.
            console.log(`🗂️ [provision/status] returning stored boards for "${accountId}":`, JSON.stringify(stored.boards));
            return res.json({ accountId: String(accountId), provisioned: !!stored.provisioned, boards: stored.boards, columns: stored.columns || {} });
        }
        const legacyId = process.env.LEGACY_ACCOUNT_ID;
        if (legacyId && String(accountId) === String(legacyId)) {
            console.log(`🗂️ [provision/status] account "${accountId}" is LEGACY — returning env boards`);
            return res.json({ accountId: String(accountId), provisioned: true, boards: envBoardIds(), columns: {}, legacy: true });
        }
        console.log(`🆕 [provision/status] account "${accountId}" not provisioned`);
        return res.json({ accountId: String(accountId), provisioned: false, boards: {}, columns: {} });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// Persist the board/column mapping the frontend created via monday.api(), so the
// session-less webhooks (Shopify order-create, etc.) and board-ids can resolve this
// account's real boards. accountId comes from the verified session — never the body.
router.post('/api/provision/save', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _d, _e, _f, _g, _h;
    try {
        const accountId = (_d = req.session) === null || _d === void 0 ? void 0 : _d.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const boards = (_e = req.body) === null || _e === void 0 ? void 0 : _e.boards;
        const columns = (_g = (_f = req.body) === null || _f === void 0 ? void 0 : _f.columns) !== null && _g !== void 0 ? _g : {};
        // `provisioned` marks whether the full schema (incl. connect/mirror) succeeded;
        // the frontend sends false for a partial save so a later open resumes the repair.
        const provisioned = ((_h = req.body) === null || _h === void 0 ? void 0 : _h.provisioned) !== false;
        if (!boards || typeof boards !== 'object' || !Object.keys(boards).length) {
            return res.status(400).json({ error: 'boards mapping is required' });
        }
        const config = { provisioned, boards, columns };
        yield (0, account_store_1.saveAccountConfig)(String(accountId), config);
        console.log(`✅ [provision/save] account "${accountId}" (provisioned=${provisioned}) boards:`, JSON.stringify(boards));
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// Clear the caller account's stored board/column config so the next app open
// re-provisions from scratch. Use after manually deleting duplicate/partial boards
// created by a failed run. accountId comes from the verified session.
router.post('/api/provision/reset', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _j;
    try {
        const accountId = (_j = req.session) === null || _j === void 0 ? void 0 : _j.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        yield (0, account_store_1.deleteAccountConfig)(String(accountId));
        console.log(`♻️ Reset provisioning config for account ${accountId}`);
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// "Finish setup" — the safety-net the Multi-Order view calls when it opens and the
// account isn't provisioned yet (install-time setup still running, or a test/share-link
// install where OAuth didn't run). The view itself NEVER creates boards; it just asks the
// backend to run/await the SAME server-side provisioning (idempotent, self-locked, so it
// coalesces with any install-time run). Returns the boards once ready.
router.post('/api/provision/ensure', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _k, _l;
    try {
        const accountId = (_k = req.session) === null || _k === void 0 ? void 0 : _k.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const existing = yield (0, account_store_1.getAccountConfig)(String(accountId));
        if ((existing === null || existing === void 0 ? void 0 : existing.provisioned) && (existing === null || existing === void 0 ? void 0 : existing.boards) && Object.keys(existing.boards).length) {
            return res.json({ provisioned: true, boards: existing.boards, alreadyProvisioned: true });
        }
        // Prefer the account's STORED OAuth token (created at install — the reliable API
        // token); fall back to the session's short-lived token for test installs with no
        // OAuth yet.
        const token = (yield (0, account_store_1.resolveMondayToken)(String(accountId))) || ((_l = req.session) === null || _l === void 0 ? void 0 : _l.shortLivedToken);
        if (!token) {
            return res.status(400).json({
                error: 'no monday token available to finish setup — the account must complete the install (OAuth) first',
            });
        }
        const config = yield (0, board_provisioning_1.provisionAccount)(String(accountId), token);
        return res.json({ provisioned: config.provisioned, boards: config.boards });
    }
    catch (err) {
        console.error('❌ /api/provision/ensure failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
}));
// Register which Shopify store belongs to the caller's monday account, so the
// (session-less) Shopify order webhook can be routed to the right account token.
// Authenticated via the monday session — accountId comes from the verified JWT.
router.post('/api/config/shopify-store', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _m, _o;
    try {
        const accountId = (_m = req.session) === null || _m === void 0 ? void 0 : _m.accountId;
        const shopDomain = (_o = req.body) === null || _o === void 0 ? void 0 : _o.shopDomain;
        if (!accountId || !shopDomain) {
            return res.status(400).json({ error: 'accountId (session) and shopDomain are required' });
        }
        yield (0, account_store_1.mapShopToAccount)(String(shopDomain), String(accountId));
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
// Returns the board IDs the Multi-Order Processing frontend needs, so it no longer
// has to hardcode them. Prefers the caller's provisioned board config (set up during
// install — see board-provisioning.ts); falls back to env vars for accounts that
// haven't been auto-provisioned yet (e.g. this legacy/tunnel-testing board).
router.get('/api/config/board-ids', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _p;
    try {
        const accountId = accountFromRequest(req);
        const provisioned = accountId ? (_p = (yield (0, account_store_1.getAccountConfig)(String(accountId)))) === null || _p === void 0 ? void 0 : _p.boards : null;
        if (provisioned) {
            return res.json({ boards: provisioned });
        }
        // Env board IDs are a single-tenant fallback tied to ONE account. Apply them only
        // when there's no session (tunnel/local dev) or the caller IS that legacy account
        // (LEGACY_ACCOUNT_ID). Any OTHER account gets empty boards, which signals the
        // frontend to auto-provision instead of borrowing the legacy account's boards.
        const legacyId = process.env.LEGACY_ACCOUNT_ID;
        const useEnvFallback = !accountId || !legacyId || String(accountId) === String(legacyId);
        return res.json({ boards: useEnvFallback ? envBoardIds() : {} });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}));
exports.default = router;
