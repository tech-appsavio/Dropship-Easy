import { Request, Response } from 'express';
import { ShopifyService } from '../services/shopify-service';
import { getAccountByWebhookToken } from '../services/account-store';
import { safeError } from '../utils/log-safe';
import { logAccountError } from '../services/error-log';

export class ShopifyController {
    // Primary (Option A): the account is identified by the unguessable token in the URL
    // (/api/shopify/order_create/:token), so there is no domain matching and no way to
    // route to the wrong account. Each account pastes its own URL into Shopify.
    static async orderCreateByToken(req: Request, res: Response) {
        const token = req.params.token;
        const shopifyOrder = req.body;

        // Validate the payload shape before doing anything with it.
        if (!shopifyOrder || typeof shopifyOrder !== 'object' || Array.isArray(shopifyOrder) || !shopifyOrder.id) {
            return res.status(400).json({ error: 'Invalid Shopify order payload' });
        }

        const accountId = token ? await getAccountByWebhookToken(token) : null;
        if (!accountId) {
            console.warn('[shopify] unknown/invalid webhook token rejecting');
            return res.status(404).json({ error: 'Unknown webhook token' });
        }

        // Acknowledge IMMEDIATELY (Shopify retries on >5s). Processing runs after.
        res.status(200).json({ received: true, orderId: shopifyOrder.id });

        const shopDomain = (req.headers['x-shopify-shop-domain'] as string) || shopifyOrder.shop_domain || '';
        ShopifyService.processOrderCreate(shopifyOrder, { accountId, shopDomain })
            .catch((error) => {
                console.error('❌ Shopify order processing error:', safeError(error));
                logAccountError(accountId, {
                    stage: 'Shopify Sync', severity: 'Error',
                    message: `Failed to import Shopify order ${shopifyOrder.id}: ${safeError(error)}`,
                    technicalDetails: String(error?.stack || error),
                    orderId: String(shopifyOrder.id),
                    suggestedSolution: 'Check the order in Shopify and that your account is Connected (OAuth) with valid board configuration, then retry.',
                    retry: true,
                });
            });
    }

    // Legacy shared endpoint kept for backward compatibility routes by shop domain.
    // New installs use the token route above.
    static async orderCreate(req: Request, res: Response) {
        const shopifyOrder = req.body;

        // Validate the payload shape before doing anything with it.
        if (!shopifyOrder || typeof shopifyOrder !== 'object' || Array.isArray(shopifyOrder) || !shopifyOrder.id) {
            return res.status(400).json({ error: 'Invalid Shopify order payload' });
        }

        const shopDomain = (req.headers['x-shopify-shop-domain'] as string) || shopifyOrder.shop_domain || '';

        res.status(200).json({ received: true, orderId: shopifyOrder.id });

        ShopifyService.processOrderCreate(shopifyOrder, { shopDomain })
            .catch((error) => console.error('❌ Shopify order processing error:', safeError(error)));
    }
}
