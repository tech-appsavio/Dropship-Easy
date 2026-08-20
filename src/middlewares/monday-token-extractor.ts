//Shared utility: extracts the Monday.com shortLivedToken from a signed JWT.

import express from "express";
import { verifyMondayJwt, sessionFromDecoded } from "../utils/verify-monday-jwt";

export interface MondaySession {
  accountId: string;
  userId: string;
  shortLivedToken: string | undefined;
  backToUrl: string | undefined;
}

type ExtractResult =
  | { ok: true; session: MondaySession }
  | { ok: false; error: string; status: 401 | 500 };

/**
 * Pure function — no side effects, no Express dependency.
 * Pass the raw Authorization header value (or ?token query string).
 */
export function extractMondayToken(
  authorization: string | undefined
): ExtractResult {
  if (typeof authorization !== "string") {
    return { ok: false, error: "not authenticated, no credentials in request", status: 401 };
  }

  try {
    // Tries both the Signing Secret (board/item-view tokens) and the OAuth Client
    // Secret (monday.get("sessionToken") tokens) — see verify-monday-jwt.ts.
    const decoded = verifyMondayJwt(authorization);
    return { ok: true, session: sessionFromDecoded(decoded) };
  } catch (err: any) {
    if (err?.message?.startsWith("Missing MONDAY_SIGNING_SECRET")) {
      return { ok: false, error: err.message, status: 500 };
    }
    return { ok: false, error: "authentication error, could not verify credentials", status: 401 };
  }
}

/**
 * Express middleware — drop-in replacement / companion to authentication.ts.
 * Populates req.session with the decoded Monday session fields.
 */
export function mondayTokenMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authorization = (req.headers.authorization ?? req.query?.token) as string | undefined;
  const result = extractMondayToken(authorization);

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  req.session = result.session;
  next();
}
