"use strict";
/**
 * monday-token-extractor.ts
 *
 * Shared utility: extracts the Monday.com shortLivedToken from a signed JWT.
 *
 * HOW IT WORKS
 * ─────────────
 * Monday.com sends a signed JWT in every request (Authorization header or
 * ?token query param).  The JWT is signed with your app's MONDAY_SIGNING_SECRET
 * and contains:
 *   • accountId       – the monday.com account making the request
 *   • userId          – the user who triggered the action
 *   • shortLivedToken – a temporary OAuth token you can use to call the
 *                       monday.com API on behalf of that user
 *   • backToUrl       – (optional) redirect URL
 *
 * USAGE IN ANOTHER PROJECT
 * ─────────────────────────
 * 1. Copy this file (or publish it as a shared package).
 * 2. Make sure `jsonwebtoken` is installed:
 *      npm install jsonwebtoken
 *      npm install -D @types/jsonwebtoken
 * 3. Set MONDAY_SIGNING_SECRET in your .env (same secret as this app).
 * 4. Import and call extractMondayToken(req) in your route/middleware:
 *
 *      import { extractMondayToken } from "./monday-token-extractor";
 *
 *      app.post("/my-route", (req, res) => {
 *        const result = extractMondayToken(req);
 *        if (!result.ok) return res.status(401).json({ error: result.error });
 *
 *        const { shortLivedToken, accountId, userId } = result.session;
 *        // use shortLivedToken with @mondaydotcomorg/api or monday-sdk-js
 *      });
 *
 * 5. Or drop it in as Express middleware (same shape as authentication.ts):
 *
 *      import { mondayTokenMiddleware } from "./monday-token-extractor";
 *      router.post("/my-route", mondayTokenMiddleware, myController);
 *      // then access req.session.shortLivedToken inside myController
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mondayTokenMiddleware = exports.extractMondayToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
/**
 * Pure function — no side effects, no Express dependency.
 * Pass the raw Authorization header value (or ?token query string).
 */
function extractMondayToken(authorization, signingSecret = process.env.MONDAY_SIGNING_SECRET) {
    if (typeof authorization !== "string") {
        return { ok: false, error: "not authenticated, no credentials in request", status: 401 };
    }
    if (typeof signingSecret !== "string") {
        return { ok: false, error: "Missing MONDAY_SIGNING_SECRET", status: 500 };
    }
    try {
        const { accountId, userId, backToUrl, shortLivedToken } = jsonwebtoken_1.default.verify(authorization, signingSecret);
        return { ok: true, session: { accountId, userId, backToUrl, shortLivedToken } };
    }
    catch (_a) {
        return { ok: false, error: "authentication error, could not verify credentials", status: 401 };
    }
}
exports.extractMondayToken = extractMondayToken;
/**
 * Express middleware — drop-in replacement / companion to authentication.ts.
 * Populates req.session with the decoded Monday session fields.
 */
function mondayTokenMiddleware(req, res, next) {
    var _a, _b;
    const authorization = ((_a = req.headers.authorization) !== null && _a !== void 0 ? _a : (_b = req.query) === null || _b === void 0 ? void 0 : _b.token);
    const result = extractMondayToken(authorization);
    if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
    }
    req.session = result.session;
    next();
}
exports.mondayTokenMiddleware = mondayTokenMiddleware;
