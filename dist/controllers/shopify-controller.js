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
const account_store_1 = require("../services/account-store");
const log_safe_1 = require("../utils/log-safe");
const error_log_1 = require("../services/error-log");
class ShopifyController {
    // Primary (Option A): the account is identified by the unguessable token in the URL
    // (/api/shopify/order_create/:token), so there is no domain matching and no way to
    // route to the wrong account. Each account pastes its own URL into Shopify.
    static orderCreateByToken(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = req.params.token;
            const shopifyOrder = req.body;
            console.log('🛒 Shopify Order Webhook Received (token route)');
            // Validate the payload shape before doing anything with it.
            if (!shopifyOrder || typeof shopifyOrder !== 'object' || Array.isArray(shopifyOrder) || !shopifyOrder.id) {
                return res.status(400).json({ error: 'Invalid Shopify order payload' });
            }
            const accountId = token ? yield (0, account_store_1.getAccountByWebhookToken)(token) : null;
            if (!accountId) {
                console.warn('❌ [shopify] unknown/invalid webhook token — rejecting');
                return res.status(404).json({ error: 'Unknown webhook token' });
            }
            // Acknowledge IMMEDIATELY (Shopify retries on >5s). Processing runs after.
            res.status(200).json({ received: true, orderId: shopifyOrder.id });
            const shopDomain = req.headers['x-shopify-shop-domain'] || shopifyOrder.shop_domain || '';
            shopify_service_1.ShopifyService.processOrderCreate(shopifyOrder, { accountId, shopDomain })
                .then((result) => console.log(`✅ Order processed:`, result))
                .catch((error) => {
                console.error('❌ Shopify order processing error:', (0, log_safe_1.safeError)(error));
                (0, error_log_1.logAccountError)(accountId, {
                    stage: 'Shopify Sync', severity: 'Error',
                    message: `Failed to import Shopify order ${shopifyOrder.id}: ${(0, log_safe_1.safeError)(error)}`,
                    technicalDetails: String((error === null || error === void 0 ? void 0 : error.stack) || error),
                    orderId: String(shopifyOrder.id),
                    suggestedSolution: 'Check the order in Shopify and that your account is Connected (OAuth) with valid board configuration, then retry.',
                    retry: true,
                });
            });
        });
    }
    // Legacy shared endpoint kept for backward compatibility — routes by shop domain.
    // New installs use the token route above.
    static orderCreate(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🛒 Shopify Order Webhook Received (legacy domain route)');
            const shopifyOrder = req.body;
            // Validate the payload shape before doing anything with it.
            if (!shopifyOrder || typeof shopifyOrder !== 'object' || Array.isArray(shopifyOrder) || !shopifyOrder.id) {
                return res.status(400).json({ error: 'Invalid Shopify order payload' });
            }
            const shopDomain = req.headers['x-shopify-shop-domain'] || shopifyOrder.shop_domain || '';
            console.log(`🏪 Shopify shop domain from webhook: "${shopDomain}"`);
            res.status(200).json({ received: true, orderId: shopifyOrder.id });
            shopify_service_1.ShopifyService.processOrderCreate(shopifyOrder, { shopDomain })
                .then((result) => console.log(`✅ Order processed:`, result))
                .catch((error) => console.error('❌ Shopify order processing error:', (0, log_safe_1.safeError)(error)));
        });
    }
}
exports.ShopifyController = ShopifyController;
