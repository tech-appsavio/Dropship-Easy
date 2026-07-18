import { Request, Response } from 'express';
import { ShopifyService } from '../services/shopify-service';

export class ShopifyController {
    static async orderCreate(req: Request, res: Response) {
        try {
            console.log('🛒 Shopify Order Webhook Received');
            console.log('📦 Payload:', JSON.stringify(req.body, null, 2));
            const shopifyOrder = req.body;

            if (!shopifyOrder.id) {
                return res.status(400).json({ error: 'Invalid Shopify order payload' });
            }

            const result = await ShopifyService.processOrderCreate(shopifyOrder);

            console.log(`✅ Order processed: customerId=${result.customerId} orderId=${result.orderId}`);
            return res.status(200).json(result);

        } catch (error: any) {
            console.error('❌ Shopify webhook error:', error);
            return res.status(500).json({ error: error.message });
        }
    }
}
