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
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookAuthenticationMiddleware = exports.webhookTokenAuthMiddleware = void 0;
const account_store_1 = require("../services/account-store");
const verify_monday_jwt_1 = require("../utils/verify-monday-jwt");
// Auth for a per-account webhook URL that carries an unguessable token in its path
// (/…/:token) — the same pattern as the Shopify order webhook. The token maps to a
// monday account; its stored OAuth token is loaded into req.session. No account ID is
// exposed in the URL, so it can't be spoofed by guessing an account.
function webhookTokenAuthMiddleware(req, res, next) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        // monday's setup challenge carries no token context — let it through so the
        // controller can echo it back and the webhook verifies on save.
        if ((_a = req.body) === null || _a === void 0 ? void 0 : _a.challenge)
            return next();
        try {
            const token = req.params.token;
            const accountId = token ? yield (0, account_store_1.getAccountByWebhookToken)(token) : null;
            if (!accountId) {
                res.status(404).json({ error: "Unknown webhook token" });
                return;
            }
            const mondayToken = yield (0, account_store_1.resolveMondayToken)(accountId);
            req.session = {
                accountId: String(accountId),
                userId: "",
                backToUrl: undefined,
                shortLivedToken: mondayToken !== null && mondayToken !== void 0 ? mondayToken : undefined,
            };
            next();
        }
        catch (err) {
            res.status(500).json({ error: "authentication failed" });
        }
    });
}
exports.webhookTokenAuthMiddleware = webhookTokenAuthMiddleware;
// Auth for session-less webhooks (e.g. monday board webhooks). If the request carries
// a valid monday JWT, its account-scoped shortLivedToken is used. Otherwise the account
// is taken from an `?account=<id>` param (or `accountId` in the body) — set on the webhook
// URL at configuration time — and that account's own stored OAuth token is resolved via
// resolveMondayToken (which is strictly per-account; it does NOT fall back to any shared/
// env token for real accounts — see account-store.ts).
function webhookAuthenticationMiddleware(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        const resolveByAccount = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const accountId = req.query.account || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.accountId) || '';
            const token = yield (0, account_store_1.resolveMondayToken)(accountId);
            req.session = {
                accountId: String(accountId),
                userId: '',
                backToUrl: undefined,
                shortLivedToken: token !== null && token !== void 0 ? token : undefined
            };
            next();
        });
        try {
            const authorization = req.headers.authorization;
            if (!authorization) {
                yield resolveByAccount();
                return;
            }
            const decoded = (0, verify_monday_jwt_1.verifyMondayJwt)(authorization);
            req.session = (0, verify_monday_jwt_1.sessionFromDecoded)(decoded);
            next();
        }
        catch (err) {
            // JWT missing/invalid — fall back to account-based token resolution.
            yield resolveByAccount();
        }
    });
}
exports.webhookAuthenticationMiddleware = webhookAuthenticationMiddleware;
