import jwt from "jsonwebtoken";

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
export function verifyMondayJwt(token: string): any {
    const candidateSecrets = [process.env.MONDAY_SIGNING_SECRET, process.env.MONDAY_CLIENT_SECRET]
        .filter((s): s is string => typeof s === "string" && s.length > 0);

    if (candidateSecrets.length === 0) {
        throw new Error("Missing MONDAY_SIGNING_SECRET and MONDAY_CLIENT_SECRET (at least one must be set)");
    }

    let lastErr: any;
    for (const secret of candidateSecrets) {
        try {
            return jwt.verify(token, secret) as any;
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

// Pulls { accountId, userId, backToUrl, shortLivedToken } out of a decoded token,
// supporting both the flat-claim shape (action/webhook tokens) and the nested `dat`
// shape (monday.get("sessionToken") tokens: { dat: { account_id, user_id, ... } }).
export function sessionFromDecoded(decoded: any): {
    accountId: string; userId: string; backToUrl: string | undefined; shortLivedToken: string | undefined;
} {
    return {
        accountId: decoded.accountId ?? decoded.dat?.account_id,
        userId: decoded.userId ?? decoded.dat?.user_id,
        backToUrl: decoded.backToUrl ?? decoded.dat?.back_to_url,
        shortLivedToken: decoded.shortLivedToken ?? decoded.dat?.short_lived_token,
    };
}
