import { Router } from 'express';
import { OAuthController } from '../controllers/oauth-controller';
import authenticationMiddleware from '../middlewares/authentication';
import { getAccountConfig, saveAccountConfig, deleteAccountConfig, mapShopToAccount, resolveMondayToken, AccountConfig } from '../services/account-store';
import { provisionAccount } from '../services/board-provisioning';
import { PROVISIONING_SCHEMA } from '../services/provisioning-schema';
import { verifyMondayJwt, sessionFromDecoded } from '../utils/verify-monday-jwt';

const router = Router();

// Leniently resolve the monday account from the session token if one is present.
// Never throws — returns undefined so callers can still fall back to env board IDs.
// Tries both the Signing Secret and the OAuth Client Secret (see verify-monday-jwt.ts) —
// a monday.get("sessionToken") value (what the frontend actually sends here) is signed
// with the Client Secret, not the Signing Secret.
function accountFromRequest(req: any): string | undefined {
    try {
        const auth = (req.headers.authorization ?? req.query?.token) as string | undefined;
        if (auth) {
            const decoded = verifyMondayJwt(auth);
            return sessionFromDecoded(decoded).accountId;
        }
    } catch { /* invalid/absent token → env fallback */ }
    return undefined;
}

// Board IDs are numeric — strip anything else (stray spaces, a trailing ";" copied
// from TS, quotes) so a malformed .env value can't break a GraphQL query like
// `boards(ids: 2028904077;)`. Empty/absent → undefined (frontend leaves it unset).
const cleanBoardId = (v?: string): string | undefined => {
    const digits = (v || '').replace(/\D/g, '');
    return digits || undefined;
};

// Read env board IDs at REQUEST time — not module load. `import routes` in app.ts
// runs before dotenv.config(), so anything read at module-load would be undefined.
// These are the tunnel/local fallback; a provisioned account's config wins over them.
const envBoardIds = (): Record<string, string | undefined> => ({
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
router.get('/oauth/authorize', OAuthController.authorize);
router.get('/oauth/callback', OAuthController.callback);

// Manually (re)provision boards for the caller's account — useful for testing or if
// install-time provisioning was interrupted. Idempotent: no-op if already provisioned.
router.post('/api/provision', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        const token = req.session?.shortLivedToken;
        if (!accountId || !token) {
            return res.status(401).json({ error: 'missing account session' });
        }
        const config = await provisionAccount(String(accountId), token);
        return res.json({ success: true, config });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// The board/column schema to provision. The FRONTEND creates the boards client-side via
// monday.api() (runs in the user's monday session — no token/OAuth needed for setup), so
// it needs the schema. Kept here as the single source of truth (titles + relationships).
router.get('/api/provision/schema', (_req, res) => {
    return res.json({ schema: PROVISIONING_SCHEMA });
});

// Tells the frontend whether THIS account still needs provisioning. Legacy account
// (LEGACY_ACCOUNT_ID) and local/tunnel dev report as provisioned with the env boards so
// they never re-create boards; any other account with no stored config → needs setup.
router.get('/api/provision/status', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        if (!accountId) return res.status(401).json({ error: 'no account session' });

        console.log(`🔎 [provision/status] accountId="${accountId}"`);
        const stored = await getAccountConfig(String(accountId));
        if (stored?.boards && Object.keys(stored.boards).length) {
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
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Persist the board/column mapping the frontend created via monday.api(), so the
// session-less webhooks (Shopify order-create, etc.) and board-ids can resolve this
// account's real boards. accountId comes from the verified session — never the body.
router.post('/api/provision/save', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        if (!accountId) return res.status(401).json({ error: 'no account session' });

        const boards = req.body?.boards;
        const columns = req.body?.columns ?? {};
        // `provisioned` marks whether the full schema (incl. connect/mirror) succeeded;
        // the frontend sends false for a partial save so a later open resumes the repair.
        const provisioned = req.body?.provisioned !== false;
        if (!boards || typeof boards !== 'object' || !Object.keys(boards).length) {
            return res.status(400).json({ error: 'boards mapping is required' });
        }

        const config: AccountConfig = { provisioned, boards, columns };
        await saveAccountConfig(String(accountId), config);
        console.log(`✅ [provision/save] account "${accountId}" (provisioned=${provisioned}) boards:`, JSON.stringify(boards));
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Clear the caller account's stored board/column config so the next app open
// re-provisions from scratch. Use after manually deleting duplicate/partial boards
// created by a failed run. accountId comes from the verified session.
router.post('/api/provision/reset', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        if (!accountId) return res.status(401).json({ error: 'no account session' });
        await deleteAccountConfig(String(accountId));
        console.log(`♻️ Reset provisioning config for account ${accountId}`);
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// "Finish setup" — the safety-net the Multi-Order view calls when it opens and the
// account isn't provisioned yet (install-time setup still running, or a test/share-link
// install where OAuth didn't run). The view itself NEVER creates boards; it just asks the
// backend to run/await the SAME server-side provisioning (idempotent, self-locked, so it
// coalesces with any install-time run). Returns the boards once ready.
router.post('/api/provision/ensure', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        if (!accountId) return res.status(401).json({ error: 'no account session' });

        const existing = await getAccountConfig(String(accountId));
        if (existing?.provisioned && existing?.boards && Object.keys(existing.boards).length) {
            return res.json({ provisioned: true, boards: existing.boards, alreadyProvisioned: true });
        }

        // Prefer the account's STORED OAuth token (created at install — the reliable API
        // token); fall back to the session's short-lived token for test installs with no
        // OAuth yet.
        const token = (await resolveMondayToken(String(accountId))) || req.session?.shortLivedToken;
        if (!token) {
            return res.status(400).json({
                error: 'no monday token available to finish setup — the account must complete the install (OAuth) first',
            });
        }

        const config = await provisionAccount(String(accountId), token);
        return res.json({ provisioned: config.provisioned, boards: config.boards });
    } catch (err: any) {
        console.error('❌ /api/provision/ensure failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// Register which Shopify store belongs to the caller's monday account, so the
// (session-less) Shopify order webhook can be routed to the right account token.
// Authenticated via the monday session — accountId comes from the verified JWT.
router.post('/api/config/shopify-store', authenticationMiddleware, async (req, res) => {
    try {
        const accountId = req.session?.accountId;
        const shopDomain = req.body?.shopDomain;
        if (!accountId || !shopDomain) {
            return res.status(400).json({ error: 'accountId (session) and shopDomain are required' });
        }
        await mapShopToAccount(String(shopDomain), String(accountId));
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Returns the board IDs the Multi-Order Processing frontend needs, so it no longer
// has to hardcode them. Prefers the caller's provisioned board config (set up during
// install — see board-provisioning.ts); falls back to env vars for accounts that
// haven't been auto-provisioned yet (e.g. this legacy/tunnel-testing board).
router.get('/api/config/board-ids', async (req, res) => {
    try {
        const accountId = accountFromRequest(req);
        const provisioned = accountId ? (await getAccountConfig(String(accountId)))?.boards : null;
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
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
