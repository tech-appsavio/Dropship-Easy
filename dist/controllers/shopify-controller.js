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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyController = void 0;
const shopify_service_1 = require("../services/shopify-service");
class ShopifyController {
    static orderCreate(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('🛒 Shopify Order Webhook Received');
                console.log('📦 Payload:', JSON.stringify(req.body, null, 2));
                const shopifyOrder = req.body;
                if (!shopifyOrder.id) {
                    return res.status(400).json({ error: 'Invalid Shopify order payload' });
                }
                const result = yield shopify_service_1.ShopifyService.processOrderCreate(shopifyOrder);
                console.log(`✅ Order processed: customerId=${result.customerId} orderId=${result.orderId}`);
                return res.status(200).json(result);
            }
            catch (error) {
                console.error('❌ Shopify webhook error:', error);
                return res.status(500).json({ error: error.message });
            }
        });
    }
}
exports.ShopifyController = ShopifyController;
