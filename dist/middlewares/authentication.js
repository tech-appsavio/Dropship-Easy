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
const verify_monday_jwt_1 = require("../utils/verify-monday-jwt");
function authenticationMiddleware(req, res, next) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const authorization = (_a = req.headers.authorization) !== null && _a !== void 0 ? _a : (_b = req.query) === null || _b === void 0 ? void 0 : _b.token;
            if (typeof authorization !== "string") {
                res
                    .status(401)
                    .json({ error: "not authenticated, no credentials in request" });
                return;
            }
            // monday issues TWO differently-signed JWT types that both land here — a
            // traditional board/item-view context token (Signing Secret) and a token from
            // monday.get("sessionToken") used by Account Settings / the Shiprocket proxy
            // (OAuth Client Secret). verifyMondayJwt tries both so either type verifies
            // correctly; see src/utils/verify-monday-jwt.ts for why this matters.
            const decoded = (0, verify_monday_jwt_1.verifyMondayJwt)(authorization);
            const { accountId, userId, backToUrl, shortLivedToken } = (0, verify_monday_jwt_1.sessionFromDecoded)(decoded);
            req.session = { accountId, userId, backToUrl, shortLivedToken };
            next();
        }
        catch (err) {
            // Don't leak internal JWT error detail (invalid signature, missing secret, etc.)
            // to the client — log server-side, return a generic 401.
            console.error("Authentication failed:", err === null || err === void 0 ? void 0 : err.message);
            return res.status(401).json({
                error: "authentication error, could not verify credentials",
            });
        }
    });
}
exports.default = authenticationMiddleware;
