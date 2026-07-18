import express from "express";
import crypto from "crypto";

export async function handleShopifyWebhook(req: express.Request, res: express.Response) {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'] as string;
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

    if (!secret) {
      return res.status(500).json({ error: "Missing SHOPIFY_WEBHOOK_SECRET" });
    }

    // Verify webhook authenticity
    const hash = crypto.createHmac('sha256', secret).update(req.body, 'utf8').digest('base64');
    if (hash !== hmac) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const data = JSON.parse(req.body);
    
    // Handle webhook data here
    console.log("Shopify webhook received:", data);

    res.status(200).send();
  } catch (error) {
    console.error("Shopify webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
