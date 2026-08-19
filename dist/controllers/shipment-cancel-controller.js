"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.ShipmentCancelController = void 0;
const monday_service_1 = __importDefault(require("../services/monday-service"));
const account_store_1 = require("../services/account-store");
const log_safe_1 = require("../utils/log-safe");
const error_log_1 = require("../services/error-log");
const SHIPROCKET_API_URL = 'https://apiv2.shiprocket.in/v1/external';
// Cache Shiprocket tokens per account (+ dedupe concurrent logins). When several shipments
// are cancelled at once, monday fires one webhook per item — without this, each would log
// in to Shiprocket separately and hit the rate limit / "blocked" error, so some cancels
// would silently fail. Tokens are valid ~10 days; we refresh well before that.
const srTokenCache = new Map();
const srLoginInFlight = new Map();
const SR_TOKEN_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days
class ShipmentCancelController {
    static onStatusChange(req, res) {
        var _a, _b, _c, _d, _e, _f;
        return __awaiter(this, void 0, void 0, function* () {
            // monday's webhook setup challenge — echo it so the automation verifies on save.
            if ((_a = req.body) === null || _a === void 0 ? void 0 : _a.challenge) {
                return res.status(200).json({ challenge: req.body.challenge });
            }
            const event = (_b = req.body) === null || _b === void 0 ? void 0 : _b.event;
            const statusLabel = ((_d = (_c = event === null || event === void 0 ? void 0 : event.value) === null || _c === void 0 ? void 0 : _c.label) === null || _d === void 0 ? void 0 : _d.text) || '';
            // Acknowledge IMMEDIATELY. monday marks the automation "failed" if we return non-2xx
            // or respond slowly — but cancelling in Shiprocket takes several API calls. So we
            // ack now and do the work in the background, writing the outcome to the board.
            res.status(200).json({ received: true });
            if ((event === null || event === void 0 ? void 0 : event.type) !== 'update_column_value')
                return;
            if (statusLabel.toLowerCase() !== 'cancel') {
                return;
            }
            const { boardId, pulseId: itemId } = event;
            const shortLivedToken = (_e = req.session) === null || _e === void 0 ? void 0 : _e.shortLivedToken;
            const accountId = (_f = req.session) === null || _f === void 0 ? void 0 : _f.accountId;
            setImmediate(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    if (!shortLivedToken) {
                        throw new Error('No monday token for this account — open Account Settings and Connect (OAuth).');
                    }
                    const awbCode = yield ShipmentCancelController.fetchAWBCode(shortLivedToken, boardId, itemId);
                    if (!awbCode)
                        throw new Error('AWB code not found on this shipment (Shiprocket AWB ID column is empty).');
                    const shiprocketToken = yield ShipmentCancelController.authenticateShiprocket(accountId);
                    // Only reaches here if Shiprocket CONFIRMED the cancellation (else it throws).
                    const confirmation = yield ShipmentCancelController.cancelShipment(awbCode, shiprocketToken);
                    // cancelShipment() has already verified Shiprocket actually cancelled (it throws
                    // otherwise), so report a clear completed message — not Shiprocket's raw
                    // "in progress" text, which reads as if the operation hasn't finished.
                    yield ShipmentCancelController.updateMondayStatus(shortLivedToken, boardId, itemId, `✅ Shipment(s) cancelled successfully.`);
                }
                catch (error) {
                    console.error(`❌ [cancel] failed for item ${itemId}:`, (0, log_safe_1.safeError)(error));
                    (0, error_log_1.logAccountError)(accountId, {
                        stage: 'Shipment Creation', severity: 'Error',
                        message: `Shipment cancellation failed: ${(0, log_safe_1.safeError)(error)}`,
                        technicalDetails: String((error === null || error === void 0 ? void 0 : error.stack) || error),
                        suggestedSolution: 'Verify the shipment has a valid AWB and your Shiprocket credentials in Account Settings, then set the status to Cancel again.',
                        retry: true,
                    });
                    try {
                        if (shortLivedToken && boardId && itemId) {
                            yield ShipmentCancelController.updateMondayStatus(shortLivedToken, boardId, itemId, `❌ Cancellation Failed: ${error.message}`);
                        }
                    }
                    catch ( /* couldn't write the error back — already logged above */_g) { /* couldn't write the error back — already logged above */ }
                }
            }));
        });
    }
    static fetchAWBCode(token, boardId, itemId) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const mondayClient = new (yield Promise.resolve().then(() => __importStar(require('@mondaydotcomorg/api')))).ApiClient({ token });
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
            const response = yield mondayClient.request(query, { itemId: [itemId] });
            const item = (_a = response === null || response === void 0 ? void 0 : response.items) === null || _a === void 0 ? void 0 : _a[0];
            if (!item) {
                throw new Error('Shipment not found');
            }
            const awbColumn = item.column_values.find((col) => {
                var _a, _b, _c;
                return ((_a = col.column) === null || _a === void 0 ? void 0 : _a.title) === 'Shiprocket AWB ID' ||
                    ((_b = col.column) === null || _b === void 0 ? void 0 : _b.title) === 'AWB Code' ||
                    ((_c = col.column) === null || _c === void 0 ? void 0 : _c.title) === 'AWB';
            });
            return ((awbColumn === null || awbColumn === void 0 ? void 0 : awbColumn.display_value) || (awbColumn === null || awbColumn === void 0 ? void 0 : awbColumn.text) || '').trim();
        });
    }
    static authenticateShiprocket(accountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const settings = accountId ? yield (0, account_store_1.getAccountSettings)(accountId) : null;
            // Multi-tenant: credentials come STRICTLY from this account's saved Settings, never
            // the app's env (which would route a tenant's cancellations through the developer's
            // Shiprocket account). Use the account's API token if present, else email/password.
            const apiToken = settings === null || settings === void 0 ? void 0 : settings.shiprocketApiToken;
            if (apiToken && apiToken !== 'paste_your_api_token_here') {
                return apiToken;
            }
            const email = settings === null || settings === void 0 ? void 0 : settings.shiprocketEmail;
            const password = settings === null || settings === void 0 ? void 0 : settings.shiprocketPassword;
            if (!email || !password) {
                throw new Error('Shiprocket is not configured for this account. Add your Shiprocket Email and Password (or API Token) in Account Settings → Shiprocket.');
            }
            const cacheKey = accountId || email;
            const cached = srTokenCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now())
                return cached.token;
            // Dedupe concurrent logins (bulk cancel): everyone awaits the same request.
            const inFlight = srLoginInFlight.get(cacheKey);
            if (inFlight)
                return inFlight;
            const loginPromise = (() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const response = yield fetch(`${SHIPROCKET_API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                if (!response.ok) {
                    const errorData = yield response.json().catch(() => ({}));
                    if ((_a = errorData.message) === null || _a === void 0 ? void 0 : _a.includes('blocked')) {
                        throw new Error('Shiprocket account is blocked. Please wait 1-2 hours or contact support.');
                    }
                    throw new Error(`Shiprocket auth failed: ${errorData.message || response.statusText}`);
                }
                const data = yield response.json();
                srTokenCache.set(cacheKey, { token: data.token, expiresAt: Date.now() + SR_TOKEN_TTL_MS });
                return data.token;
            }))().finally(() => srLoginInFlight.delete(cacheKey));
            srLoginInFlight.set(cacheKey, loginPromise);
            return loginPromise;
        });
    }
    // Cancels the AWB in Shiprocket and VERIFIES the response actually confirms it — a bare
    // HTTP 200 is not enough (Shiprocket can return 200 with a "could not cancel / already
    // shipped" message). Returns the confirmation message; throws with the real reason
    // otherwise, so the board reflects the true Shiprocket outcome instead of a false "done".
    static cancelShipment(awbCode, token) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`${SHIPROCKET_API_URL}/orders/cancel/shipment/awbs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ awbs: [awbCode] })
            });
            const raw = yield response.text();
            let data = {};
            try {
                data = JSON.parse(raw);
            }
            catch (_c) {
                data = { message: raw };
            }
            if (!response.ok) {
                throw new Error(`Shiprocket cancellation failed (HTTP ${response.status}): ${(data === null || data === void 0 ? void 0 : data.message) || raw || 'no response'}`);
            }
            const message = String((_a = data === null || data === void 0 ? void 0 : data.message) !== null && _a !== void 0 ? _a : '').trim();
            const lower = message.toLowerCase();
            const statusCode = (_b = data === null || data === void 0 ? void 0 : data.status_code) !== null && _b !== void 0 ? _b : data === null || data === void 0 ? void 0 : data.status;
            // Treat as failure when Shiprocket explicitly says it couldn't cancel — even on a 200.
            const failureSignals = /(can\s?not|cannot|could not|unable|already shipped|already delivered|not allowed|invalid|failed|error|no awb)/i;
            const numericFailure = typeof statusCode === 'number' && statusCode !== 200 && statusCode !== 1;
            if (numericFailure || (failureSignals.test(lower) && !lower.includes('cancel'))) {
                throw new Error(`Shiprocket did not cancel AWB ${awbCode}: ${message || `status ${statusCode}`}`);
            }
            return message || 'Cancelled in Shiprocket';
        });
    }
    static updateMondayStatus(token, boardId, itemId, statusMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            const columns = yield monday_service_1.default.getBoardColumns(token, boardId);
            const responseCol = columns.find((c) => c.title === 'Cancellation Response');
            if (responseCol) {
                yield monday_service_1.default.changeMultipleColumnValues(token, boardId, itemId, {
                    [responseCol.id]: statusMessage
                });
            }
        });
    }
}
exports.ShipmentCancelController = ShipmentCancelController;
