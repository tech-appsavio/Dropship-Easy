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
exports.pendingByItem = exports.pendingResponses = exports.WhatsappWebhook = void 0;
const monday_service_1 = __importDefault(require("../services/monday-service"));
const account_store_1 = require("../services/account-store");
class WhatsappWebhook {
    // Step 1: Meta calls this to verify your webhook URL. The customer configures the
    // callback URL with `?account=<their monday account id>`, so we verify STRICTLY against
    // that account's own saved verify token — never the app's env (multi-tenant isolation).
    static verify(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            const accountId = req.query.account;
            const settings = accountId ? yield (0, account_store_1.getAccountSettings)(accountId) : null;
            const VERIFY_TOKEN = settings === null || settings === void 0 ? void 0 : settings.whatsappWebhookVerifyToken;
            if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
                return res.status(200).send(challenge);
            }
            return res.status(403).send('Forbidden');
        });
    }
    // Step 2: Meta sends incoming messages here
    static receive(req, res) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const body = req.body;
                // Always respond 200 immediately to Meta
                res.status(200).send('EVENT_RECEIVED');
                const entry = (_a = body === null || body === void 0 ? void 0 : body.entry) === null || _a === void 0 ? void 0 : _a[0];
                const changes = (_b = entry === null || entry === void 0 ? void 0 : entry.changes) === null || _b === void 0 ? void 0 : _b[0];
                const value = changes === null || changes === void 0 ? void 0 : changes.value;
                const messages = value === null || value === void 0 ? void 0 : value.messages;
                if (!messages || messages.length === 0)
                    return;
                const message = messages[0];
                const fromPhone = message.from; // sender's phone number
                const messageType = message.type;
                // Raw payload carried by the tapped button, plus the human label of the reply.
                let payloadRaw = '';
                let label = '';
                if (messageType === 'interactive') {
                    const interactive = message.interactive;
                    if ((interactive === null || interactive === void 0 ? void 0 : interactive.type) === 'button_reply') {
                        payloadRaw = ((_c = interactive.button_reply) === null || _c === void 0 ? void 0 : _c.id) || '';
                        label = ((_d = interactive.button_reply) === null || _d === void 0 ? void 0 : _d.title) || '';
                    }
                    else if ((interactive === null || interactive === void 0 ? void 0 : interactive.type) === 'list_reply') {
                        payloadRaw = ((_e = interactive.list_reply) === null || _e === void 0 ? void 0 : _e.id) || '';
                        label = ((_f = interactive.list_reply) === null || _f === void 0 ? void 0 : _f.title) || '';
                    }
                }
                else if (messageType === 'button') {
                    // Quick-reply template button: `payload` is the value we set at send time.
                    payloadRaw = ((_g = message.button) === null || _g === void 0 ? void 0 : _g.payload) || '';
                    label = ((_h = message.button) === null || _h === void 0 ? void 0 : _h.text) || '';
                }
                else if (messageType === 'text') {
                    label = ((_j = message.text) === null || _j === void 0 ? void 0 : _j.body) || '';
                }
                // Primary path: the order identity is embedded in the button payload, so we
                // update the exact order regardless of phone reuse or elapsed time.
                const ref = WhatsappWebhook.parseOrderRef(payloadRaw);
                if (ref) {
                    yield WhatsappWebhook.updateOrderStatus(ref.itemId, ref.boardId, ref.statusColumnId, ref.status);
                    return;
                }
                // Fallback path: no payload (e.g. a typed text reply). Map the text to a
                // status and use the most recent phone-based mapping.
                const statusMap = {
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
                if (!mondayStatus)
                    return;
                yield WhatsappWebhook.updateMondayFromResponse(fromPhone, mondayStatus);
            }
            catch (error) {
                // Webhook error occurred
            }
        });
    }
    // Parses the JSON order reference we embed in quick-reply button payloads.
    static parseOrderRef(payloadRaw) {
        if (!payloadRaw)
            return null;
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
        }
        catch (_a) {
            // Not our JSON payload — fall back to text/phone handling.
        }
        return null;
    }
    // Updates a specific order's status using the account-scoped token captured when the
    // message was sent (looked up by order/item id) — no hardcoded token.
    static updateOrderStatus(itemId, boardId, statusColumnId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = exports.pendingByItem.get(String(itemId));
                if (!token || !itemId || !boardId) {
                    return;
                }
                yield monday_service_1.default.changeColumnValue(token, boardId, itemId, statusColumnId, JSON.stringify({ label: status }));
            }
            catch (error) {
                // Failed to update Monday
            }
        });
    }
    static updateMondayFromResponse(fromPhone, status) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mapping = exports.pendingResponses.get(fromPhone);
                if (!mapping) {
                    return;
                }
                // Uses the account-scoped token captured at send time (dynamic, not hardcoded).
                const { token, boardId, itemId, statusColumnId } = mapping;
                yield monday_service_1.default.changeColumnValue(token, boardId, itemId, statusColumnId, JSON.stringify({ label: status }));
                exports.pendingResponses.delete(fromPhone);
            }
            catch (error) {
                // Failed to update Monday
            }
        });
    }
}
exports.WhatsappWebhook = WhatsappWebhook;
// In-memory store: phone → { token, boardId, itemId, statusColumnId } (fallback for typed replies)
exports.pendingResponses = new Map();
// In-memory store: itemId → account-scoped token captured at send time. Used by the
// button-payload reply path so status updates run against the correct account
// without any hardcoded token.
exports.pendingByItem = new Map();
