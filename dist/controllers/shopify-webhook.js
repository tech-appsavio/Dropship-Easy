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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleShopifyWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
function handleShopifyWebhook(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const hmac = req.headers['x-shopify-hmac-sha256'];
            const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
            if (!secret) {
                return res.status(500).json({ error: "Missing SHOPIFY_WEBHOOK_SECRET" });
            }
            // Verify webhook authenticity
            const hash = crypto_1.default.createHmac('sha256', secret).update(req.body, 'utf8').digest('base64');
            if (hash !== hmac) {
                return res.status(401).json({ error: "Invalid webhook signature" });
            }
            const data = JSON.parse(req.body);
            // Handle webhook data here
            res.status(200).send();
        }
        catch (error) {
            console.error("Shopify webhook error:", error);
            res.status(500).json({ error: "Webhook processing failed" });
        }
    });
}
exports.handleShopifyWebhook = handleShopifyWebhook;
