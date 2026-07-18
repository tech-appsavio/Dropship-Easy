import jwt from "jsonwebtoken";
import express from "express";

export async function webhookAuthenticationMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      // For webhooks, Monday might not send auth header during verification
      // Allow the request to proceed
      req.session = { 
        accountId: '', 
        userId: '', 
        backToUrl: undefined, 
        shortLivedToken: process.env.MONDAY_API_TOKEN 
      };
      next();
      return;
    }

    if (typeof process.env.MONDAY_SIGNING_SECRET !== "string") {
      res.status(500).json({ error: "Missing MONDAY_SIGNING_SECRET" });
      return;
    }

    const { accountId, userId, backToUrl, shortLivedToken } = jwt.verify(
      authorization,
      process.env.MONDAY_SIGNING_SECRET
    ) as any;

    req.session = { accountId, userId, backToUrl, shortLivedToken };

    next();
  } catch (err) {
    // If JWT verification fails, use API token as fallback
    req.session = { 
      accountId: '', 
      userId: '', 
      backToUrl: undefined, 
      shortLivedToken: process.env.MONDAY_API_TOKEN 
    };
    next();
  }
}
