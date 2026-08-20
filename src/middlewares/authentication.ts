import express from "express";
import { verifyMondayJwt, sessionFromDecoded } from "../utils/verify-monday-jwt";

/** Define the session property on the request object   */
declare global {
  namespace Express {
    interface Request {
      session: {
        accountId: string;
        userId: string;
        backToUrl: string | undefined;
        shortLivedToken: string | undefined;
      };
    }
  }
}

export default async function authenticationMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const authorization = req.headers.authorization ?? req.query?.token;

    if (typeof authorization !== "string") {
      res
        .status(401)
        .json({ error: "not authenticated, no credentials in request" });
      return;
    }

    // monday issues TWO differently-signed JWT types that both land here a
    // traditional board/item-view context token (Signing Secret) and a token from
    // monday.get("sessionToken") used by Account Settings / the Shiprocket proxy
    // (OAuth Client Secret). verifyMondayJwt tries both so either type verifies
    // correctly; see src/utils/verify-monday-jwt.ts for why this matters.
    const decoded = verifyMondayJwt(authorization);
    const { accountId, userId, backToUrl, shortLivedToken } = sessionFromDecoded(decoded);

    req.session = { accountId, userId, backToUrl, shortLivedToken };

    next();
  } catch (err: any) {
    // Don't leak internal JWT error detail (invalid signature, missing secret, etc.)
    // to the client log server-side, return a generic 401.
    console.error("Authentication failed:", err?.message);
    return res.status(401).json({
      error: "authentication error, could not verify credentials",
    });
  }
}
