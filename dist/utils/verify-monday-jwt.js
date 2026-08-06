"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionFromDecoded = exports.verifyMondayJwt = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// monday issues TWO differently-signed JWT types that all land at our various auth
// checkpoints:
//   - the traditional board/item-view context token → signed with the app's
//     SIGNING SECRET (MONDAY_SIGNING_SECRET, from Basic Information)
//   - a token fetched via `monday.get("sessionToken")` (used by the Account Settings
//     screen, the Shiprocket proxy's auth, etc.) → signed with the app's OAuth
//     CLIENT SECRET (MONDAY_CLIENT_SECRET, from the OAuth tab), per
//     https://developer.monday.com/apps/docs/mondayget
//
// A single caller can't know in advance which type arrived, so this tries every
// configured secret in turn and returns the first successful decode. Throws the
// last error if none verify (mirrors jwt.verify's throwing behavior).
function verifyMondayJwt(token) {
    const candidateSecrets = [process.env.MONDAY_SIGNING_SECRET, process.env.MONDAY_CLIENT_SECRET]
        .filter((s) => typeof s === "string" && s.length > 0);
    if (candidateSecrets.length === 0) {
        throw new Error("Missing MONDAY_SIGNING_SECRET and MONDAY_CLIENT_SECRET (at least one must be set)");
    }
    let lastErr;
    for (const secret of candidateSecrets) {
        try {
            return jsonwebtoken_1.default.verify(token, secret);
        }
        catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}
exports.verifyMondayJwt = verifyMondayJwt;
// Pulls { accountId, userId, backToUrl, shortLivedToken } out of a decoded token,
// supporting both the flat-claim shape (action/webhook tokens) and the nested `dat`
// shape (monday.get("sessionToken") tokens: { dat: { account_id, user_id, ... } }).
function sessionFromDecoded(decoded) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
        accountId: (_a = decoded.accountId) !== null && _a !== void 0 ? _a : (_b = decoded.dat) === null || _b === void 0 ? void 0 : _b.account_id,
        userId: (_c = decoded.userId) !== null && _c !== void 0 ? _c : (_d = decoded.dat) === null || _d === void 0 ? void 0 : _d.user_id,
        backToUrl: (_e = decoded.backToUrl) !== null && _e !== void 0 ? _e : (_f = decoded.dat) === null || _f === void 0 ? void 0 : _f.back_to_url,
        shortLivedToken: (_g = decoded.shortLivedToken) !== null && _g !== void 0 ? _g : (_h = decoded.dat) === null || _h === void 0 ? void 0 : _h.short_lived_token,
    };
}
exports.sessionFromDecoded = sessionFromDecoded;
