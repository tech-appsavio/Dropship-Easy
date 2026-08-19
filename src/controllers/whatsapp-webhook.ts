import { Request, Response } from 'express';
import MondayService from '../services/monday-service';
import { getAccountSettings } from '../services/account-store';

export class WhatsappWebhook {

    // Step 1: Meta calls this to verify your webhook URL. The customer configures the
    // callback URL with `?account=<their monday account id>`, so we verify STRICTLY against
    // that account's own saved verify token — never the app's env (multi-tenant isolation).
    static async verify(req: Request, res: Response) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const accountId = req.query.account as string;
        const settings = accountId ? await getAccountSettings(accountId) : null;
        const VERIFY_TOKEN = settings?.whatsappWebhookVerifyToken;

        if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
        return res.status(403).send('Forbidden');
    }

    // Step 2: Meta sends incoming messages here
    static async receive(req: Request, res: Response) {
        try {
            const body = req.body;

            // Always respond 200 immediately to Meta
            res.status(200).send('EVENT_RECEIVED');

            const entry = body?.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const messages = value?.messages;

            if (!messages || messages.length === 0) return;

            const message = messages[0];
            const fromPhone = message.from; // sender's phone number
            const messageType = message.type;

            // Raw payload carried by the tapped button, plus the human label of the reply.
            let payloadRaw = '';
            let label = '';

            if (messageType === 'interactive') {
                const interactive = message.interactive;
                if (interactive?.type === 'button_reply') {
                    payloadRaw = interactive.button_reply?.id || '';
                    label = interactive.button_reply?.title || '';
                } else if (interactive?.type === 'list_reply') {
                    payloadRaw = interactive.list_reply?.id || '';
                    label = interactive.list_reply?.title || '';
                }
            } else if (messageType === 'button') {
                // Quick-reply template button: `payload` is the value we set at send time.
                payloadRaw = message.button?.payload || '';
                label = message.button?.text || '';
            } else if (messageType === 'text') {
                label = message.text?.body || '';
            }

            // Primary path: the order identity is embedded in the button payload, so we
            // update the exact order regardless of phone reuse or elapsed time.
            const ref = WhatsappWebhook.parseOrderRef(payloadRaw);
            if (ref) {
                await WhatsappWebhook.updateOrderStatus(ref.itemId, ref.boardId, ref.statusColumnId, ref.status);
                return;
            }

            // Fallback path: no payload (e.g. a typed text reply). Map the text to a
            // status and use the most recent phone-based mapping.
            const statusMap: Record<string, string> = {
                'approved': 'Confirmed',
                'approve': 'Confirmed',
                'yes': 'Confirmed',
                'confirm': 'Confirmed',
                'confirm order': 'Confirmed',
                'not approved': 'Cancelled',
                'rejected': 'Cancelled',
                'reject': 'Cancelled',
                'no': 'Cancelled',
                'cancel': 'Cancelled',
                'cancel order': 'Cancelled',
                'pending': 'Pending',
            };

            const mondayStatus = statusMap[(label || '').toLowerCase().trim()];
            if (!mondayStatus) return;

            await WhatsappWebhook.updateMondayFromResponse(fromPhone, mondayStatus);

        } catch (error: any) {
            // Webhook error occurred
        }
    }

    // Parses the JSON order reference we embed in quick-reply button payloads.
    static parseOrderRef(payloadRaw: string):
        { itemId: string; boardId: string; statusColumnId: string; status: string } | null {
        if (!payloadRaw) return null;
        try {
            const p = JSON.parse(payloadRaw);
            if (p && p.i && p.a) {
                return {
                    itemId: String(p.i),
                    boardId: String(p.b || ''),
                    statusColumnId: String(p.s || 'status'),
                    status: String(p.a)
                };
            }
        } catch {
            // Not our JSON payload — fall back to text/phone handling.
        }
        return null;
    }

    // Updates a specific order's status using the account-scoped token captured when the
    // message was sent (looked up by order/item id) — no hardcoded token.
    static async updateOrderStatus(itemId: string, boardId: string, statusColumnId: string, status: string) {
        try {
            const token = pendingByItem.get(String(itemId));
            if (!token || !itemId || !boardId) {
                return;
            }
            await MondayService.changeColumnValue(
                token,
                boardId,
                itemId,
                statusColumnId,
                JSON.stringify({ label: status })
            );
        } catch (error: any) {
            // Failed to update Monday
        }
    }

    static async updateMondayFromResponse(fromPhone: string, status: string) {
        try {
            const mapping = pendingResponses.get(fromPhone);
            if (!mapping) {
                return;
            }

            // Uses the account-scoped token captured at send time (dynamic, not hardcoded).
            const { token, boardId, itemId, statusColumnId } = mapping;

            await MondayService.changeColumnValue(
                token,
                boardId,
                itemId,
                statusColumnId,
                JSON.stringify({ label: status })
            );

            pendingResponses.delete(fromPhone);

        } catch (error: any) {
            // Failed to update Monday
        }
    }
}

// In-memory store: phone → { token, boardId, itemId, statusColumnId } (fallback for typed replies)
export const pendingResponses = new Map<string, {
    token: string;
    boardId: string;
    itemId: string;
    statusColumnId: string;
}>();

// In-memory store: itemId → account-scoped token captured at send time. Used by the
// button-payload reply path so status updates run against the correct account
// without any hardcoded token.
export const pendingByItem = new Map<string, string>();
