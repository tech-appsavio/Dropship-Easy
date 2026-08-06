import { SecureStorage } from '@mondaycom/apps-sdk';
import crypto from 'crypto';

// Per-account persistence for OAuth tokens and external-service → account mappings.
// Backed by monday-code SecureStorage (app-global, encrypted). All calls degrade
// gracefully (return null / no-op) when SecureStorage is unavailable — e.g. local dev
// without the monday-code environment — so nothing crashes during the transition.

const KEY_TOKEN    = (accountId: string) => `monday_token:${accountId}`;
const KEY_SHOP     = (shopDomain: string) => `shop_account:${shopDomain.toLowerCase()}`;
const KEY_CONFIG   = (accountId: string) => `account_config:${accountId}`;
const KEY_SETTINGS = (accountId: string) => `account_settings:${accountId}`;
// Per-account Shopify webhook token → account routing (Option A). Two keys form a
// bidirectional map: token→account (used by the incoming webhook) and account→token
// (so the Settings screen can show/regenerate the account's URL).
const KEY_WH_TOKEN = (token: string) => `webhook_token:${token}`;
const KEY_ACCT_WH  = (accountId: string) => `account_webhook:${accountId}`;

// Per-account third-party credentials the customer enters in the Settings screen.
export interface AccountSettings {
    // WhatsApp (Meta Cloud API)
    whatsappAccessToken?: string;
    whatsappPhoneId?: string;
    whatsappBusinessAccountId?: string;
    whatsappWebhookVerifyToken?: string;
    whatsappTemplateLanguage?: string;
    // Shiprocket
    shiprocketEmail?: string;
    shiprocketPassword?: string;
    shiprocketApiToken?: string;
    shiprocketPickupLocation?: string;
    // Shopify
    shopifyStoreDomain?: string;
}

// Per-account board/column IDs created during provisioning.
export interface AccountConfig {
    provisioned: boolean;
    boards: Record<string, string>;              // logical key → board id
    columns: Record<string, Record<string, string>>; // board key → { column title → column id }
    workspaceId?: string;                        // workspace the "Ship Easy" folder lives in
    folderId?: string;                           // the "Ship Easy" folder new boards are created in
}

let storage: any;

function getStorage(): any {
    if (storage !== undefined) return storage;
    try {
        storage = new SecureStorage();
    } catch (err: any) {
        console.error('⚠️ SecureStorage unavailable (falling back where possible):', err.message);
        storage = null;
    }
    return storage;
}

// ── monday OAuth tokens (per account) ─────────────────────────────────────────
export async function saveAccountToken(accountId: string, token: string): Promise<void> {
    const s = getStorage();
    if (!s) return;
    try {
        await s.set(KEY_TOKEN(String(accountId)), token);
    } catch (err: any) {
        console.error('❌ saveAccountToken failed:', err.message);
    }
}

export async function getAccountToken(accountId: string): Promise<string | null> {
    const s = getStorage();
    if (!s || !accountId) return null;
    try {
        return await s.get(KEY_TOKEN(String(accountId)));
    } catch (err: any) {
        console.error('❌ getAccountToken failed:', err.message);
        return null;
    }
}

// Removes a stored OAuth token — e.g. after monday rejects it (revoked on app uninstall),
// so the account shows as disconnected and the user is prompted to reconnect.
export async function deleteAccountToken(accountId: string): Promise<void> {
    const s = getStorage();
    if (!s || !accountId) return;
    try {
        await s.delete(KEY_TOKEN(String(accountId)));
        console.log(`🗑️ [token] cleared stale OAuth token for account "${accountId}"`);
    } catch (err: any) {
        console.error('❌ deleteAccountToken failed:', err.message);
    }
}

// ── Shopify shop-domain → monday account mapping ──────────────────────────────
export async function mapShopToAccount(shopDomain: string, accountId: string): Promise<void> {
    const s = getStorage();
    if (!s) return;
    try {
        await s.set(KEY_SHOP(shopDomain), String(accountId));
        console.log(`🔗 [mapShopToAccount] "${shopDomain.toLowerCase()}" → account "${accountId}"`);
    } catch (err: any) {
        console.error('❌ mapShopToAccount failed:', err.message);
    }
}

export async function getAccountByShop(shopDomain: string): Promise<string | null> {
    const s = getStorage();
    if (!s || !shopDomain) return null;
    try {
        return await s.get(KEY_SHOP(shopDomain));
    } catch (err: any) {
        console.error('❌ getAccountByShop failed:', err.message);
        return null;
    }
}

// ── Shopify webhook token → account routing (Option A) ────────────────────────
// Each account gets an unguessable token embedded in its own Shopify webhook URL, so
// the incoming order webhook identifies the account from the URL — no domain matching,
// no hijacking, no "stuck" mappings.

// Returns the account's existing webhook token, creating one on first call. Stable
// across calls so the URL shown in Settings never changes unless explicitly regenerated.
export async function getOrCreateWebhookToken(accountId: string): Promise<string | null> {
    const s = getStorage();
    if (!s || !accountId) return null;
    try {
        const existing = await s.get(KEY_ACCT_WH(String(accountId)));
        if (existing) return String(existing);
        const token = crypto.randomBytes(24).toString('hex');
        await s.set(KEY_ACCT_WH(String(accountId)), token);
        await s.set(KEY_WH_TOKEN(token), String(accountId));
        console.log(`🔑 [webhook] created token for account "${accountId}"`);
        return token;
    } catch (err: any) {
        console.error('❌ getOrCreateWebhookToken failed:', err.message);
        return null;
    }
}

// Resolves the monday account that owns a Shopify webhook token. null = unknown token.
export async function getAccountByWebhookToken(token: string): Promise<string | null> {
    const s = getStorage();
    if (!s || !token) return null;
    try {
        const acct = await s.get(KEY_WH_TOKEN(token));
        return acct ? String(acct) : null;
    } catch (err: any) {
        console.error('❌ getAccountByWebhookToken failed:', err.message);
        return null;
    }
}

// Issues a fresh token (invalidating the old one) — use if a URL was leaked. The old
// token stops routing immediately; the account must update its Shopify webhook URL.
export async function regenerateWebhookToken(accountId: string): Promise<string | null> {
    const s = getStorage();
    if (!s || !accountId) return null;
    try {
        const old = await s.get(KEY_ACCT_WH(String(accountId)));
        if (old) await s.delete(KEY_WH_TOKEN(String(old)));
        const token = crypto.randomBytes(24).toString('hex');
        await s.set(KEY_ACCT_WH(String(accountId)), token);
        await s.set(KEY_WH_TOKEN(token), String(accountId));
        console.log(`🔄 [webhook] regenerated token for account "${accountId}"`);
        return token;
    } catch (err: any) {
        console.error('❌ regenerateWebhookToken failed:', err.message);
        return null;
    }
}

// ── Per-account board/column configuration (from provisioning) ────────────────
export async function saveAccountConfig(accountId: string, config: AccountConfig): Promise<void> {
    const s = getStorage();
    if (!s) return;
    try {
        await s.set(KEY_CONFIG(String(accountId)), config);
    } catch (err: any) {
        console.error('❌ saveAccountConfig failed:', err.message);
    }
}

export async function getAccountConfig(accountId: string): Promise<AccountConfig | null> {
    const s = getStorage();
    if (!s || !accountId) return null;
    try {
        return await s.get(KEY_CONFIG(String(accountId)));
    } catch (err: any) {
        console.error('❌ getAccountConfig failed:', err.message);
        return null;
    }
}

// Clears an account's stored board/column config so the next app open re-provisions
// from scratch. Used by the reset endpoint after deleting duplicate/partial boards.
export async function deleteAccountConfig(accountId: string): Promise<void> {
    const s = getStorage();
    if (!s || !accountId) return;
    try {
        await s.delete(KEY_CONFIG(String(accountId)));
    } catch (err: any) {
        console.error('❌ deleteAccountConfig failed:', err.message);
    }
}

// ── Per-account third-party settings (from the Settings screen) ───────────────
export async function saveAccountSettings(accountId: string, settings: AccountSettings): Promise<void> {
    const s = getStorage();
    if (!s) return;
    try {
        // Merge with existing so partial saves don't wipe other fields.
        const existing = (await getAccountSettings(accountId)) || {};
        await s.set(KEY_SETTINGS(String(accountId)), { ...existing, ...settings });
    } catch (err: any) {
        console.error('❌ saveAccountSettings failed:', err.message);
    }
}

export async function getAccountSettings(accountId: string): Promise<AccountSettings | null> {
    const s = getStorage();
    if (!s || !accountId) return null;
    try {
        return await s.get(KEY_SETTINGS(String(accountId)));
    } catch (err: any) {
        console.error('❌ getAccountSettings failed:', err.message);
        return null;
    }
}

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
export async function resolveMondayToken(accountId?: string | null): Promise<string | null> {
    if (accountId) {
        const token = await getAccountToken(accountId);
        if (token) {
            console.log(`✅ Resolved OAuth token for account "${accountId}"`);
            return token;
        }
    }

    const legacyId = process.env.LEGACY_ACCOUNT_ID;
    const isLegacyOrUnknown = !accountId || (legacyId && String(accountId) === String(legacyId));
    const envToken = process.env.MONDAY_API_TOKEN;
    if (isLegacyOrUnknown && envToken) {
        console.warn(`⚠️ Using MONDAY_API_TOKEN env fallback (account: "${accountId ?? 'unknown'}").`);
        return envToken;
    }

    if (accountId) {
        console.error(`❌ No OAuth token for account "${accountId}" and it is not the legacy account — refusing MONDAY_API_TOKEN fallback (would write to the wrong account). This account must complete OAuth.`);
    } else {
        console.error(`❌ No token available and MONDAY_API_TOKEN not set.`);
    }
    return null;
}
