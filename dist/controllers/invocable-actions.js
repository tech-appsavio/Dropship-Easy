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
exports.InvocableActions = void 0;
const monday_service_1 = __importDefault(require("../services/monday-service"));
const whatsapp_service_1 = require("../services/whatsapp-service");
const account_store_1 = require("../services/account-store");
const error_log_1 = require("../services/error-log");
const whatsapp_webhook_1 = require("./whatsapp-webhook");
require("../middlewares/authentication"); // Import to ensure type declaration is loaded
const recentRequests = new Set();
const MESSAGE_BATCH_SIZE = 2;
const BATCH_DELAY_MS = 2000; // 2 seconds delay between batches
// Mask a phone number for logging — keep only the last 2 digits so logs never contain
// full PII. e.g. "919876543210" → "…10".
const maskPhone = (p) => {
    const d = String(p || "").replace(/\s/g, "");
    return d.length <= 2 ? "…" : `…${d.slice(-2)}`;
};
class InvocableActions {
    static actionSendMessage(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { payload } = req.body;
                const { shortLivedToken, accountId } = req.session;
                if (!shortLivedToken) {
                    throw new Error('Missing shortLivedToken');
                }
                const { itemId, boardId, toPhoneColumn, templateId, fromPhone, message, messageColumn, wanidColumn, statusColumn } = payload.inputFields;
                // Check if multiple items selected
                const itemIds = Array.isArray(itemId) ? itemId : [itemId];
                if (itemIds.length > 1) {
                    // Process in batches
                    InvocableActions.processBatchMessages(itemIds, payload, shortLivedToken, accountId, res);
                    return res.status(200).json({
                        success: true,
                        message: `Processing ${itemIds.length} messages in batches of ${MESSAGE_BATCH_SIZE}`
                    });
                }
                // Single message - process immediately
                yield InvocableActions.processSingleMessage(itemIds[0], payload, shortLivedToken, accountId);
                return res.status(200).json({ success: true });
            }
            catch (error) {
                console.error('❌ actionSendMessage error:', error.message);
                return res.status(200).json({ success: false, error: error.message });
            }
        });
    }
    static processBatchMessages(itemIds, payload, shortLivedToken, accountId, res) {
        return __awaiter(this, void 0, void 0, function* () {
            // Process in background to avoid timeout
            setImmediate(() => __awaiter(this, void 0, void 0, function* () {
                for (let i = 0; i < itemIds.length; i += MESSAGE_BATCH_SIZE) {
                    const batch = itemIds.slice(i, i + MESSAGE_BATCH_SIZE);
                    // Process batch in parallel
                    yield Promise.all(batch.map(itemId => InvocableActions.processSingleMessage(itemId, payload, shortLivedToken, accountId)
                        .catch(err => console.error(`❌ Error processing item ${itemId}:`, err.message))));
                    // Delay before next batch (except for last batch)
                    if (i + MESSAGE_BATCH_SIZE < itemIds.length) {
                        yield new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                    }
                }
            }));
        });
    }
    static processSingleMessage(itemId, payload, shortLivedToken, accountId) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            const { boardId, toPhoneColumn, templateId, fromPhone, message, messageColumn, wanidColumn, statusColumn } = payload.inputFields;
            // Deduplicate: ignore duplicate requests within 5 seconds
            const dedupKey = `${itemId}-${toPhoneColumn}-${Date.now() - (Date.now() % 5000)}`;
            if (recentRequests.has(dedupKey)) {
                return;
            }
            recentRequests.add(dedupKey);
            setTimeout(() => recentRequests.delete(dedupKey), 5000);
            // Extract string value from dropdown objects
            const resolveField = (field) => {
                if (!field)
                    return undefined;
                if (typeof field === 'object' && field.value)
                    return field.value;
                return field;
            };
            const finalTemplateName = resolveField(templateId) || 'hello_world';
            const finalPhoneColumn = resolveField(toPhoneColumn);
            // fromPhone may arrive as a dropdown object ({value}), an empty string, or be omitted.
            // Unwrap it to a plain string (or undefined) so the service can cleanly fall back to
            // the account's saved WhatsApp Phone Number ID instead of sending "[object Object]"
            // or an undefined id to Meta.
            const finalFromPhone = resolveField(fromPhone);
            if (!itemId || !finalPhoneColumn) {
                throw new Error('Missing itemId or toPhoneColumn');
            }
            const rawValue = yield monday_service_1.default.getColumnValue(shortLivedToken, itemId, finalPhoneColumn);
            if (!rawValue) {
                throw new Error(`No value found in column '${finalPhoneColumn}' for item ${itemId}.`);
            }
            let phoneNumber = rawValue;
            try {
                const parsed = JSON.parse(rawValue);
                phoneNumber = parsed.phone || rawValue;
            }
            catch ( /* not JSON, use as-is */_e) { /* not JSON, use as-is */ }
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            if (cleanPhone.length < 10) {
                throw new Error(`Invalid phone number: ${rawValue}`);
            }
            // Build the template body variables from the order item, in {{1}},{{2}},{{3}} order:
            //   {{1}} = order item name, {{2}} = "Total Price" column, {{3}} = connected line-item names
            // Resolve THIS account's line-items board so "products" isn't scanned on the wrong
            // board (env fallback) and come back empty.
            const lineItemsBoardId = accountId ? (_b = (_a = (yield (0, account_store_1.getAccountConfig)(accountId))) === null || _a === void 0 ? void 0 : _a.boards) === null || _b === void 0 ? void 0 : _b.lineItems : undefined;
            const orderParams = yield monday_service_1.default.getOrderWhatsappParams(shortLivedToken, itemId, lineItemsBoardId);
            // WhatsApp Cloud API rejects EMPTY body parameters ("Parameter of type text is
            // missing text value"), so substitute a dash for any blank value.
            const safe = (v) => (v && v.trim() ? v.trim() : '-');
            const bodyParams = [safe(orderParams.orderName), safe(orderParams.totalPrice), safe(orderParams.products)];
            // Resolve the order's board columns + Status column up front, so the Status
            // column id can be embedded in the reply-button payloads below.
            let boardColumns = [];
            let statusColumnId = 'status';
            if (boardId) {
                boardColumns = yield monday_service_1.default.getBoardColumns(shortLivedToken, boardId);
                const statusColData = boardColumns.find((col) => (col.title || '').toLowerCase() === 'status');
                statusColumnId = (resolveField((_c = payload.inputFields) === null || _c === void 0 ? void 0 : _c.statusColumnId) || (statusColData === null || statusColData === void 0 ? void 0 : statusColData.id) || 'status');
            }
            // Fetch actual template content from WhatsApp API
            let actualMessageSent = message || '';
            let templateLanguage = 'en'; // default; overwritten by the template's actual language below
            let templateButtons = [];
            try {
                const template = yield whatsapp_service_1.WhatsappService.getTemplateContent(finalTemplateName, accountId);
                templateLanguage = template.language;
                templateButtons = template.buttons || [];
                // Build a faithful log of what was sent by substituting each {{n}} with its param.
                actualMessageSent = bodyParams.reduce((text, param, i) => text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), param), template.text);
            }
            catch (err) {
            }
            // Encode the order identity + intended status into each quick-reply button's
            // payload. The reply webhook reads this back to update the exact order —
            // independent of phone-number reuse or how long the customer takes to respond.
            const orderRef = { i: String(itemId), b: String(boardId !== null && boardId !== void 0 ? boardId : ''), s: statusColumnId };
            const replyButtons = templateButtons
                .filter(b => String(b.type).toUpperCase() === 'QUICK_REPLY')
                .map(b => {
                const label = (b.text || '').toLowerCase();
                const action = /(cancel|reject|\bno\b)/.test(label) ? 'Cancelled'
                    : /(confirm|approve|\byes\b)/.test(label) ? 'Confirmed'
                        : b.text;
                return { index: b.index, payload: JSON.stringify(Object.assign(Object.assign({}, orderRef), { a: action })) };
            });
            if (replyButtons.length > 0) {
            }
            // Prepare logging values
            let statusMsg = 'Sent successfully';
            let wanid = '';
            try {
                // Send WhatsApp message with body variables + order-tracking button payloads.
                const waResponse = yield whatsapp_service_1.WhatsappService.sendTemplate(cleanPhone, finalTemplateName, templateLanguage, finalFromPhone, bodyParams, replyButtons, accountId);
                // Extract wamid from Meta response
                if (((_d = waResponse === null || waResponse === void 0 ? void 0 : waResponse.messages) === null || _d === void 0 ? void 0 : _d.length) > 0) {
                    wanid = waResponse.messages[0].id;
                }
            }
            catch (waError) {
                statusMsg = `Failed: ${waError.message}`.substring(0, 255);
                (0, error_log_1.logAccountError)(accountId, {
                    stage: 'WhatsApp', severity: 'Error',
                    message: `WhatsApp message failed to send: ${waError.message}`,
                    technicalDetails: String((waError === null || waError === void 0 ? void 0 : waError.stack) || waError),
                    orderId: String(itemId),
                    orderItemId: String(itemId),
                    suggestedSolution: 'Check the WhatsApp credentials in Account Settings and that the customer phone number is valid, then resend.',
                    retry: true,
                });
            }
            // Update Monday columns
            if (boardId) {
                // boardColumns was already fetched above (reused here to avoid a second call).
                const getColumnType = (colId) => {
                    const col = boardColumns.find((c) => c.id === colId);
                    return col === null || col === void 0 ? void 0 : col.type;
                };
                // Update each column separately to avoid batch errors
                try {
                    if (messageColumn && actualMessageSent) {
                        const colId = resolveField(messageColumn);
                        const colType = getColumnType(colId);
                        // Format value based on column type
                        let value;
                        if (colType === 'long_text') {
                            value = JSON.stringify({ text: actualMessageSent });
                        }
                        else {
                            value = JSON.stringify(actualMessageSent);
                        }
                        yield monday_service_1.default.changeColumnValue(shortLivedToken, boardId, itemId, colId, value);
                    }
                }
                catch (err) {
                    console.error(`❌ Message column error:`, err.message);
                }
                try {
                    if (wanidColumn && wanid) {
                        const colId = resolveField(wanidColumn);
                        const colType = getColumnType(colId);
                        // A text column takes a plain string; long_text needs {"text": "..."}.
                        // Previously this always used the {text} form, which is invalid for a
                        // text column, so the WANID silently never saved.
                        const columnValues = colType === 'long_text'
                            ? { [colId]: { text: wanid } }
                            : { [colId]: wanid };
                        yield monday_service_1.default.changeMultipleColumnValues(shortLivedToken, boardId, itemId, columnValues);
                    }
                }
                catch (err) {
                    console.error(`❌ WANID column error:`, err.message);
                }
                try {
                    if (statusColumn && statusMsg) {
                        const colId = resolveField(statusColumn);
                        const colType = getColumnType(colId);
                        // long_text needs {"text": "..."}, plain text/other take the raw string.
                        const value = colType === 'long_text'
                            ? JSON.stringify({ text: statusMsg })
                            : JSON.stringify(statusMsg);
                        yield monday_service_1.default.changeColumnValue(shortLivedToken, boardId, itemId, colId, value);
                    }
                }
                catch (err) {
                    console.error(`❌ Status column error:`, err.message);
                }
                // Capture the account-scoped token against this order so the reply webhook
                // (which has no monday session) can update the correct order dynamically.
                whatsapp_webhook_1.pendingByItem.set(String(itemId), shortLivedToken);
                // Fallback mapping for plain-text replies that carry no button payload
                // (statusColumnId was resolved above). Button replies do not rely on this.
                whatsapp_webhook_1.pendingResponses.set(cleanPhone, {
                    token: shortLivedToken,
                    boardId: String(boardId),
                    itemId: String(itemId),
                    statusColumnId: statusColumnId
                });
            }
        });
    }
    static getColumnsDropdownOptions(req, res) {
        var _a, _b, _c, _d, _e, _f;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const boardId = ((_c = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.payload) === null || _b === void 0 ? void 0 : _b.dependencyData) === null || _c === void 0 ? void 0 : _c.boardId)
                    || ((_e = (_d = req.body) === null || _d === void 0 ? void 0 : _d.payload) === null || _e === void 0 ? void 0 : _e.boardId);
                if (!boardId) {
                    return res.status(200).json({ options: [] });
                }
                // Use the account-scoped short-lived token from the signed monday request
                // (same dynamic approach the Multi-Order Processing views use) — no hardcoded token.
                const token = (_f = req.session) === null || _f === void 0 ? void 0 : _f.shortLivedToken;
                if (!token) {
                    return res.status(200).json({ options: [] });
                }
                const boardColumns = yield monday_service_1.default.getBoardColumns(token, boardId);
                const options = boardColumns.map((col) => ({
                    title: `${col.title} (${col.type})`,
                    value: col.id
                }));
                return res.status(200).json({ options });
            }
            catch (error) {
                console.error('❌ Error in getColumnsDropdownOptions:', error.message);
                return res.status(200).json({ options: [] });
            }
        });
    }
}
exports.InvocableActions = InvocableActions;
