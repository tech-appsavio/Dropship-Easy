import { Request, Response } from 'express';
import MondayService from '../services/monday-service';
import { getAccountSettings } from '../services/account-store';
import { safeError } from '../utils/log-safe';
import { logAccountError } from '../services/error-log';

const SHIPROCKET_API_URL = 'https://apiv2.shiprocket.in/v1/external';

// Cache Shiprocket tokens per account (+ dedupe concurrent logins). When several shipments
// are cancelled at once, monday fires one webhook per item — without this, each would log
// in to Shiprocket separately and hit the rate limit / "blocked" error, so some cancels
// would silently fail. Tokens are valid ~10 days; we refresh well before that.
const srTokenCache = new Map<string, { token: string; expiresAt: number }>();
const srLoginInFlight = new Map<string, Promise<string>>();
const SR_TOKEN_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

export class ShipmentCancelController {
    
    static async onStatusChange(req: Request, res: Response) {
        // monday's webhook setup challenge — echo it so the automation verifies on save.
        if (req.body?.challenge) {
            return res.status(200).json({ challenge: req.body.challenge });
        }

        const event = req.body?.event;
        const statusLabel = event?.value?.label?.text || '';

        // Acknowledge IMMEDIATELY. monday marks the automation "failed" if we return non-2xx
        // or respond slowly — but cancelling in Shiprocket takes several API calls. So we
        // ack now and do the work in the background, writing the outcome to the board.
        res.status(200).json({ received: true });

        if (event?.type !== 'update_column_value') return;
        if (statusLabel.toLowerCase() !== 'cancel') {
            return;
        }

        const { boardId, pulseId: itemId } = event;
        const shortLivedToken = (req as any).session?.shortLivedToken;
        const accountId = (req as any).session?.accountId;

        setImmediate(async () => {
            try {
                if (!shortLivedToken) {
                    throw new Error('No monday token for this account — open Account Settings and Connect (OAuth).');
                }
                const awbCode = await ShipmentCancelController.fetchAWBCode(shortLivedToken, boardId, itemId);
                if (!awbCode) throw new Error('AWB code not found on this shipment (Shiprocket AWB ID column is empty).');

                const shiprocketToken = await ShipmentCancelController.authenticateShiprocket(accountId);
                // Only reaches here if Shiprocket CONFIRMED the cancellation (else it throws).
                const confirmation = await ShipmentCancelController.cancelShipment(awbCode, shiprocketToken);

                // cancelShipment() has already verified Shiprocket actually cancelled (it throws
                // otherwise), so report a clear completed message — not Shiprocket's raw
                // "in progress" text, which reads as if the operation hasn't finished.
                await ShipmentCancelController.updateMondayStatus(shortLivedToken, boardId, itemId, `✅ Shipment(s) cancelled successfully.`);
            } catch (error: any) {
                console.error(`❌ [cancel] failed for item ${itemId}:`, safeError(error));
                logAccountError(accountId, {
                    stage: 'Shipment Creation', severity: 'Error',
                    message: `Shipment cancellation failed: ${safeError(error)}`,
                    technicalDetails: String(error?.stack || error),
                    suggestedSolution: 'Verify the shipment has a valid AWB and your Shiprocket credentials in Account Settings, then set the status to Cancel again.',
                    retry: true,
                });
                try {
                    if (shortLivedToken && boardId && itemId) {
                        await ShipmentCancelController.updateMondayStatus(shortLivedToken, boardId, itemId, `❌ Cancellation Failed: ${error.message}`);
                    }
                } catch { /* couldn't write the error back — already logged above */ }
            }
        });
    }

    private static async fetchAWBCode(token: string, boardId: string, itemId: string): Promise<string> {
        const mondayClient = new (await import('@mondaydotcomorg/api')).ApiClient({ token });
        
        // The "Shiprocket AWB ID" on the Shipments board is a MIRROR of the Order board's
        // AWB — mirror values come back via `display_value`, not `text`. Request both so
        // it works whether the column is a mirror, a text, or a board-relation value.
        const query = `query ($itemId: [ID!]) {
            items(ids: $itemId) {
                column_values {
                    id
                    text
                    column { title }
                    ... on MirrorValue { display_value }
                }
            }
        }`;

        const response: any = await mondayClient.request(query, { itemId: [itemId] });
        const item = response?.items?.[0];

        if (!item) {
            throw new Error('Shipment not found');
        }

        const awbColumn = item.column_values.find((col: any) =>
            col.column?.title === 'Shiprocket AWB ID' ||
            col.column?.title === 'AWB Code' ||
            col.column?.title === 'AWB'
        );

        return (awbColumn?.display_value || awbColumn?.text || '').trim();
    }

    private static async authenticateShiprocket(accountId?: string): Promise<string> {
        const settings = accountId ? await getAccountSettings(accountId) : null;

        // Multi-tenant: credentials come STRICTLY from this account's saved Settings, never
        // the app's env (which would route a tenant's cancellations through the developer's
        // Shiprocket account). Use the account's API token if present, else email/password.
        const apiToken = settings?.shiprocketApiToken;
        if (apiToken && apiToken !== 'paste_your_api_token_here') {
            return apiToken;
        }

        const email = settings?.shiprocketEmail;
        const password = settings?.shiprocketPassword;

        if (!email || !password) {
            throw new Error('Shiprocket is not configured for this account. Add your Shiprocket Email and Password (or API Token) in Account Settings → Shiprocket.');
        }

        const cacheKey = accountId || email;
        const cached = srTokenCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.token;

        // Dedupe concurrent logins (bulk cancel): everyone awaits the same request.
        const inFlight = srLoginInFlight.get(cacheKey);
        if (inFlight) return inFlight;

        const loginPromise = (async () => {
            const response = await fetch(`${SHIPROCKET_API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!response.ok) {
                const errorData: any = await response.json().catch(() => ({}));
                if (errorData.message?.includes('blocked')) {
                    throw new Error('Shiprocket account is blocked. Please wait 1-2 hours or contact support.');
                }
                throw new Error(`Shiprocket auth failed: ${errorData.message || response.statusText}`);
            }
            const data: any = await response.json();
            srTokenCache.set(cacheKey, { token: data.token, expiresAt: Date.now() + SR_TOKEN_TTL_MS });
            return data.token as string;
        })().finally(() => srLoginInFlight.delete(cacheKey));

        srLoginInFlight.set(cacheKey, loginPromise);
        return loginPromise;
    }

    // Cancels the AWB in Shiprocket and VERIFIES the response actually confirms it — a bare
    // HTTP 200 is not enough (Shiprocket can return 200 with a "could not cancel / already
    // shipped" message). Returns the confirmation message; throws with the real reason
    // otherwise, so the board reflects the true Shiprocket outcome instead of a false "done".
    private static async cancelShipment(awbCode: string, token: string): Promise<string> {
        const response = await fetch(`${SHIPROCKET_API_URL}/orders/cancel/shipment/awbs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ awbs: [awbCode] })
        });

        const raw = await response.text();
        let data: any = {};
        try { data = JSON.parse(raw); } catch { data = { message: raw }; }

        if (!response.ok) {
            throw new Error(`Shiprocket cancellation failed (HTTP ${response.status}): ${data?.message || raw || 'no response'}`);
        }

        const message = String(data?.message ?? '').trim();
        const lower = message.toLowerCase();
        const statusCode = data?.status_code ?? data?.status;

        // Treat as failure when Shiprocket explicitly says it couldn't cancel — even on a 200.
        const failureSignals = /(can\s?not|cannot|could not|unable|already shipped|already delivered|not allowed|invalid|failed|error|no awb)/i;
        const numericFailure = typeof statusCode === 'number' && statusCode !== 200 && statusCode !== 1;
        if (numericFailure || (failureSignals.test(lower) && !lower.includes('cancel'))) {
            throw new Error(`Shiprocket did not cancel AWB ${awbCode}: ${message || `status ${statusCode}`}`);
        }

        return message || 'Cancelled in Shiprocket';
    }

    private static async updateMondayStatus(
        token: string,
        boardId: string,
        itemId: string,
        statusMessage: string
    ) {
        const columns = await MondayService.getBoardColumns(token, boardId);
        const responseCol = columns.find((c: any) => c.title === 'Cancellation Response');

        if (responseCol) {
            await MondayService.changeMultipleColumnValues(token, boardId, itemId, {
                [responseCol.id]: statusMessage
            });
        }
    }
}
