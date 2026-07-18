import jwt from "jsonwebtoken";
import express from "express";

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
    console.log('🔐 Authentication middleware called');
    const authorization = req.headers.authorization ?? req.query?.token;

    if (typeof authorization !== "string") {
      console.log('❌ No authorization token found');
      res
        .status(401)
        .json({ error: "not authenticated, no credentials in request" });
      return;
    }

    if (typeof process.env.MONDAY_SIGNING_SECRET !== "string") {
      console.log('❌ Missing MONDAY_SIGNING_SECRET');
      res.status(500).json({ error: "Missing MONDAY_SIGNING_SECRET (should be in .env file)" });
      return;
    }
    
    console.log('🔑 Verifying JWT token...');
    const { accountId, userId, backToUrl, shortLivedToken } = jwt.verify(
      authorization,
      process.env.MONDAY_SIGNING_SECRET
    ) as any;

    console.log('✅ JWT verified successfully');
    console.log('👤 User ID:', userId);
    console.log('🏢 Account ID:', accountId);
    console.log('🎫 Has shortLivedToken:', !!shortLivedToken);

    req.session = { accountId, userId, backToUrl, shortLivedToken };

    next();
  } catch (err: any) {
    console.error('❌ Authentication error:', err.message);
    res
      .status(401)
      .json({ error: "authentication error, could not verify credentials" });
  }
}
