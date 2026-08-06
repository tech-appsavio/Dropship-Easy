import { Router } from 'express';
import authenticationMiddleware from '../middlewares/authentication';
import { getAccountSettings, saveAccountSettings, mapShopToAccount, getAccountToken, deleteAccountToken, getAccountConfig, getOrCreateWebhookToken, regenerateWebhookToken, AccountSettings } from '../services/account-store';
import MondayService from '../services/monday-service';
import { logAccountError } from '../services/error-log';

const router = Router();

// Builds the account's per-account webhook URLs from its token. APP_URL is the stable
// monday-code hosting URL; the same token secures every webhook for the account.
const appBase = () => (process.env.APP_URL || '').replace(/\/$/, '');
function webhookUrl(token: string): string {
    return `${appBase()}/api/shopify/order_create/${token}`;
}
function cancelShipmentUrl(token: string): string {
    return `${appBase()}/api/shiprocket/webhook/cancel_shipment/${token}`;
}

// Fields the Settings screen can read/write. Keeps the API tight and predictable.
const ALLOWED_FIELDS: (keyof AccountSettings)[] = [
    'whatsappAccessToken', 'whatsappPhoneId', 'whatsappBusinessAccountId',
    'whatsappWebhookVerifyToken', 'whatsappTemplateLanguage',
    'shiprocketEmail', 'shiprocketPassword', 'shiprocketApiToken', 'shiprocketPickupLocation',
    'shopifyStoreDomain',
];

// A one-glance setup health check for the Settings screen: is THIS account connected
// (OAuth), provisioned (boards created), and is its Shopify store correctly routed to
// it? Surfaces the exact mismatch (e.g. shop mapped to a different account) that silently
// breaks order webhooks.
router.get('/api/settings/status', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId ? String(req.session.accountId) : '';
        if (!accountId) return res.status(401).json({ error: 'no account session' });

        const [token, config, settings] = await Promise.all([
            getAccountToken(accountId),
            getAccountConfig(accountId),
            getAccountSettings(accountId),
        ]);

        // A stored token can be stale (revoked on uninstall). Verify it's still live so the
        // panel shows the truth; clear it if dead so the user is prompted to reconnect.
        let oauthConnected = !!token;
        if (token && !(await MondayService.isTokenValid(token))) {
            await deleteAccountToken(accountId);
            oauthConnected = false;
        }

        const whToken = await getOrCreateWebhookToken(accountId);

        // Report which REQUIRED per-account settings are still missing, so the app can prompt
        // the user to fill them in the Settings tab (there is no dev-credential fallback).
        const missingSettings: string[] = [];
        const s = settings || {};
        const hasShiprocket = !!s.shiprocketApiToken || (!!s.shiprocketEmail && !!s.shiprocketPassword);
        if (!hasShiprocket) missingSettings.push('Shiprocket credentials (Email & Password, or API Token)');
        const hasWhatsapp = !!s.whatsappAccessToken && !!s.whatsappPhoneId && !!s.whatsappBusinessAccountId;
        if (!hasWhatsapp) missingSettings.push('WhatsApp credentials (Access Token, Phone Number ID, Business Account ID)');

        return res.json({
            accountId,
            oauthConnected,
            provisioned: !!config?.provisioned && !!config?.boards && Object.keys(config.boards).length > 0,
            boardCount: config?.boards ? Object.keys(config.boards).length : 0,
            webhookUrl: whToken ? webhookUrl(whToken) : '',
            cancelShipmentWebhookUrl: whToken ? cancelShipmentUrl(whToken) : '',
            missingSettings,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Issues a fresh Shopify webhook URL for this account (old one stops working). The user
// must update the URL in their Shopify webhook settings after regenerating.
router.post('/api/settings/webhook-url/regenerate', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId ? String(req.session.accountId) : '';
        if (!accountId) return res.status(401).json({ error: 'no account session' });
        const token = await regenerateWebhookToken(accountId);
        if (!token) return res.status(500).json({ error: 'could not regenerate token' });
        return res.json({ webhookUrl: webhookUrl(token) });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// The shop→account mapping is maintained automatically when the Shopify Store Domain is
// saved via POST /api/settings (see below), and the API token comes from OAuth — so the
// old manual "bootstrap-shop" endpoint (which took a pasted monday API token) is gone.

// Load the caller account's saved settings (for populating the form).
router.get('/api/settings', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        if (!accountId) return res.status(401).json({ error: 'no account session' });
        const settings = (await getAccountSettings(String(accountId))) || {};
        return res.json({ settings });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Save the caller account's settings (merged with existing).
router.post('/api/settings', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        if (!accountId) return res.status(401).json({ error: 'no account session' });

        // Input validation: only allow whitelisted fields, only accept string/number
        // primitives (reject objects/arrays), trim, and cap length so a client can't store
        // oversized or unexpected payloads.
        const MAX_LEN = 4096;
        const incoming = req.body?.settings || {};
        const settings: AccountSettings = {};
        for (const field of ALLOWED_FIELDS) {
            const v = incoming[field];
            if (v === undefined || v === null) continue;
            if (typeof v !== 'string' && typeof v !== 'number') continue; // ignore non-primitives
            const str = String(v).trim();
            if (str.length > MAX_LEN) {
                return res.status(400).json({ error: `Value for "${field}" is too long (max ${MAX_LEN} characters).` });
            }
            settings[field] = str;
        }

        await saveAccountSettings(String(accountId), settings);

        // Keep the Shopify shop → account mapping in sync so the (session-less) Shopify
        // webhook can route to this account.
        if (settings.shopifyStoreDomain) {
            await mapShopToAccount(settings.shopifyStoreDomain, String(accountId));
        }

        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Records an error from the frontend to the account's Error Logs board. Best-effort:
// the app calls this from its stage error handlers; the backend resolves the board and
// column IDs and writes the record.
router.post('/api/error-log', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        if (!accountId) return res.status(401).json({ error: 'no account session' });
        const b = req.body || {};
        if (!b.stage || !b.message) return res.status(400).json({ error: 'stage and message are required' });
        await logAccountError(String(accountId), {
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
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Serve the SPA for the Settings board view.
router.get('/settings', (_req, res) => {
    res.sendFile('index.html', { root: 'client/build/' });
});

export default router;
