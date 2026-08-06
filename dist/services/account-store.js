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
exports.resolveMondayToken = exports.getAccountSettings = exports.saveAccountSettings = exports.deleteAccountConfig = exports.getAccountConfig = exports.saveAccountConfig = exports.regenerateWebhookToken = exports.getAccountByWebhookToken = exports.getOrCreateWebhookToken = exports.getAccountByShop = exports.mapShopToAccount = exports.deleteAccountToken = exports.getAccountToken = exports.saveAccountToken = void 0;
const apps_sdk_1 = require("@mondaycom/apps-sdk");
const crypto_1 = __importDefault(require("crypto"));
// Per-account persistence for OAuth tokens and external-service → account mappings.
// Backed by monday-code SecureStorage (app-global, encrypted). All calls degrade
// gracefully (return null / no-op) when SecureStorage is unavailable — e.g. local dev
// without the monday-code environment — so nothing crashes during the transition.
const KEY_TOKEN = (accountId) => `monday_token:${accountId}`;
const KEY_SHOP = (shopDomain) => `shop_account:${shopDomain.toLowerCase()}`;
const KEY_CONFIG = (accountId) => `account_config:${accountId}`;
const KEY_SETTINGS = (accountId) => `account_settings:${accountId}`;
// Per-account Shopify webhook token → account routing (Option A). Two keys form a
// bidirectional map: token→account (used by the incoming webhook) and account→token
// (so the Settings screen can show/regenerate the account's URL).
const KEY_WH_TOKEN = (token) => `webhook_token:${token}`;
const KEY_ACCT_WH = (accountId) => `account_webhook:${accountId}`;
let storage;
function getStorage() {
    if (storage !== undefined)
        return storage;
    try {
        storage = new apps_sdk_1.SecureStorage();
    }
    catch (err) {
        console.error('⚠️ SecureStorage unavailable (falling back where possible):', err.message);
        storage = null;
    }
    return storage;
}
// ── monday OAuth tokens (per account) ─────────────────────────────────────────
function saveAccountToken(accountId, token) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s)
            return;
        try {
            yield s.set(KEY_TOKEN(String(accountId)), token);
        }
        catch (err) {
            console.error('❌ saveAccountToken failed:', err.message);
        }
    });
}
exports.saveAccountToken = saveAccountToken;
function getAccountToken(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !accountId)
            return null;
        try {
            return yield s.get(KEY_TOKEN(String(accountId)));
        }
        catch (err) {
            console.error('❌ getAccountToken failed:', err.message);
            return null;
        }
    });
}
exports.getAccountToken = getAccountToken;
// Removes a stored OAuth token — e.g. after monday rejects it (revoked on app uninstall),
// so the account shows as disconnected and the user is prompted to reconnect.
function deleteAccountToken(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !accountId)
            return;
        try {
            yield s.delete(KEY_TOKEN(String(accountId)));
            console.log(`🗑️ [token] cleared stale OAuth token for account "${accountId}"`);
        }
        catch (err) {
            console.error('❌ deleteAccountToken failed:', err.message);
        }
    });
}
exports.deleteAccountToken = deleteAccountToken;
// ── Shopify shop-domain → monday account mapping ──────────────────────────────
function mapShopToAccount(shopDomain, accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s)
            return;
        try {
            yield s.set(KEY_SHOP(shopDomain), String(accountId));
            console.log(`🔗 [mapShopToAccount] "${shopDomain.toLowerCase()}" → account "${accountId}"`);
        }
        catch (err) {
            console.error('❌ mapShopToAccount failed:', err.message);
        }
    });
}
exports.mapShopToAccount = mapShopToAccount;
function getAccountByShop(shopDomain) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !shopDomain)
            return null;
        try {
            return yield s.get(KEY_SHOP(shopDomain));
        }
        catch (err) {
            console.error('❌ getAccountByShop failed:', err.message);
            return null;
        }
    });
}
exports.getAccountByShop = getAccountByShop;
// ── Shopify webhook token → account routing (Option A) ────────────────────────
// Each account gets an unguessable token embedded in its own Shopify webhook URL, so
// the incoming order webhook identifies the account from the URL — no domain matching,
// no hijacking, no "stuck" mappings.
// Returns the account's existing webhook token, creating one on first call. Stable
// across calls so the URL shown in Settings never changes unless explicitly regenerated.
function getOrCreateWebhookToken(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !accountId)
            return null;
        try {
            const existing = yield s.get(KEY_ACCT_WH(String(accountId)));
            if (existing)
                return String(existing);
            const token = crypto_1.default.randomBytes(24).toString('hex');
            yield s.set(KEY_ACCT_WH(String(accountId)), token);
            yield s.set(KEY_WH_TOKEN(token), String(accountId));
            console.log(`🔑 [webhook] created token for account "${accountId}"`);
            return token;
        }
        catch (err) {
            console.error('❌ getOrCreateWebhookToken failed:', err.message);
            return null;
        }
    });
}
exports.getOrCreateWebhookToken = getOrCreateWebhookToken;
// Resolves the monday account that owns a Shopify webhook token. null = unknown token.
function getAccountByWebhookToken(token) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !token)
            return null;
        try {
            const acct = yield s.get(KEY_WH_TOKEN(token));
            return acct ? String(acct) : null;
        }
        catch (err) {
            console.error('❌ getAccountByWebhookToken failed:', err.message);
            return null;
        }
    });
}
exports.getAccountByWebhookToken = getAccountByWebhookToken;
// Issues a fresh token (invalidating the old one) — use if a URL was leaked. The old
// token stops routing immediately; the account must update its Shopify webhook URL.
function regenerateWebhookToken(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !accountId)
            return null;
        try {
            const old = yield s.get(KEY_ACCT_WH(String(accountId)));
            if (old)
                yield s.delete(KEY_WH_TOKEN(String(old)));
            const token = crypto_1.default.randomBytes(24).toString('hex');
            yield s.set(KEY_ACCT_WH(String(accountId)), token);
            yield s.set(KEY_WH_TOKEN(token), String(accountId));
            console.log(`🔄 [webhook] regenerated token for account "${accountId}"`);
            return token;
        }
        catch (err) {
            console.error('❌ regenerateWebhookToken failed:', err.message);
            return null;
        }
    });
}
exports.regenerateWebhookToken = regenerateWebhookToken;
// ── Per-account board/column configuration (from provisioning) ────────────────
function saveAccountConfig(accountId, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s)
            return;
        try {
            yield s.set(KEY_CONFIG(String(accountId)), config);
        }
        catch (err) {
            console.error('❌ saveAccountConfig failed:', err.message);
        }
    });
}
exports.saveAccountConfig = saveAccountConfig;
function getAccountConfig(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !accountId)
            return null;
        try {
            return yield s.get(KEY_CONFIG(String(accountId)));
        }
        catch (err) {
            console.error('❌ getAccountConfig failed:', err.message);
            return null;
        }
    });
}
exports.getAccountConfig = getAccountConfig;
// Clears an account's stored board/column config so the next app open re-provisions
// from scratch. Used by the reset endpoint after deleting duplicate/partial boards.
function deleteAccountConfig(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !accountId)
            return;
        try {
            yield s.delete(KEY_CONFIG(String(accountId)));
        }
        catch (err) {
            console.error('❌ deleteAccountConfig failed:', err.message);
        }
    });
}
exports.deleteAccountConfig = deleteAccountConfig;
// ── Per-account third-party settings (from the Settings screen) ───────────────
function saveAccountSettings(accountId, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s)
            return;
        try {
            // Merge with existing so partial saves don't wipe other fields.
            const existing = (yield getAccountSettings(accountId)) || {};
            yield s.set(KEY_SETTINGS(String(accountId)), Object.assign(Object.assign({}, existing), settings));
        }
        catch (err) {
            console.error('❌ saveAccountSettings failed:', err.message);
        }
    });
}
exports.saveAccountSettings = saveAccountSettings;
function getAccountSettings(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = getStorage();
        if (!s || !accountId)
            return null;
        try {
            return yield s.get(KEY_SETTINGS(String(accountId)));
        }
        catch (err) {
            console.error('❌ getAccountSettings failed:', err.message);
            return null;
        }
    });
}
exports.getAccountSettings = getAccountSettings;
// Resolves a usable monday API token for an account. Prefers that account's own stored
// OAuth token.
//
// MULTI-TENANT SAFETY: the MONDAY_API_TOKEN env fallback belongs to ONE specific account
// (the dev/legacy account). Using it for a DIFFERENT account would run every API call —
// board queries, item creation — against the WRONG account, silently writing one
// customer's orders into another's boards. So the fallback is allowed ONLY when there is
// no account, or the account IS the legacy one (LEGACY_ACCOUNT_ID). Any other account
// with no OAuth token returns null → the caller must fail and prompt OAuth, never borrow
// a foreign token.
function resolveMondayToken(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (accountId) {
            const token = yield getAccountToken(accountId);
            if (token) {
                console.log(`✅ Resolved OAuth token for account "${accountId}"`);
                return token;
            }
        }
        const legacyId = process.env.LEGACY_ACCOUNT_ID;
        const isLegacyOrUnknown = !accountId || (legacyId && String(accountId) === String(legacyId));
        const envToken = process.env.MONDAY_API_TOKEN;
        if (isLegacyOrUnknown && envToken) {
            console.warn(`⚠️ Using MONDAY_API_TOKEN env fallback (account: "${accountId !== null && accountId !== void 0 ? accountId : 'unknown'}").`);
            return envToken;
        }
        if (accountId) {
            console.error(`❌ No OAuth token for account "${accountId}" and it is not the legacy account — refusing MONDAY_API_TOKEN fallback (would write to the wrong account). This account must complete OAuth.`);
        }
        else {
            console.error(`❌ No token available and MONDAY_API_TOKEN not set.`);
        }
        return null;
    });
}
exports.resolveMondayToken = resolveMondayToken;
