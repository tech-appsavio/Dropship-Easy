import express from "express";
import { resolveMondayToken, getAccountByWebhookToken } from "../services/account-store";
import { verifyMondayJwt, sessionFromDecoded } from "../utils/verify-monday-jwt";

// Auth for a per-account webhook URL that carries an unguessable token in its path
// (/…/:token) the same pattern as the Shopify order webhook. The token maps to a
// monday account; its stored OAuth token is loaded into req.session. No account ID is
// exposed in the URL, so it can't be spoofed by guessing an account.
export async function webhookTokenAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // monday's setup challenge carries no token context let it through so the
  // controller can echo it back and the webhook verifies on save.
  if (req.body?.challenge) return next();

  try {
    const token = req.params.token;
    const accountId = token ? await getAccountByWebhookToken(token) : null;
    if (!accountId) {
      res.status(404).json({ error: "Unknown webhook token" });
      return;
    }
    const mondayToken = await resolveMondayToken(accountId);
    req.session = {
      accountId: String(accountId),
      userId: "",
      backToUrl: undefined,
      shortLivedToken: mondayToken ?? undefined,
    };
    next();
  } catch (err: any) {
    res.status(500).json({ error: "authentication failed" });
  }
}

// Auth for session-less webhooks (e.g. monday board webhooks). If the request carries
// a valid monday JWT, its account-scoped shortLivedToken is used. Otherwise the account
// is taken from an `?account=<id>` param (or `accountId` in the body) set on the webhook
// URL at configuration time and that account's own stored OAuth token is resolved via
// resolveMondayToken (which is strictly per-account; it does NOT fall back to any shared/
// env token for real accounts see account-store.ts).
export async function webhookAuthenticationMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const resolveByAccount = async () => {
    const accountId = (req.query.account as string) || req.body?.accountId || '';
    const token = await resolveMondayToken(accountId);
    req.session = {
      accountId: String(accountId),
      userId: '',
      backToUrl: undefined,
      shortLivedToken: token ?? undefined
    };
    next();
  };

  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      await resolveByAccount();
      return;
    }

    const decoded = verifyMondayJwt(authorization);
    req.session = sessionFromDecoded(decoded);
    next();
  } catch (err) {
    // JWT missing/invalid fall back to account-based token resolution.
    await resolveByAccount();
  }
}
