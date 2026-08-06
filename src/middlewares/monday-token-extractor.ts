/**
 * monday-token-extractor.ts
 *
 * Shared utility: extracts the Monday.com shortLivedToken from a signed JWT.
 *
 * HOW IT WORKS
 * ─────────────
 * Monday.com sends a signed JWT in every request (Authorization header or
 * ?token query param). It's signed with EITHER your app's MONDAY_SIGNING_SECRET
 * (board/item-view context tokens) or MONDAY_CLIENT_SECRET (tokens fetched via
 * monday.get("sessionToken")) — this file tries both via verify-monday-jwt.ts.
 * The decoded payload contains:
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
