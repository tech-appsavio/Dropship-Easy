import { Router } from 'express';
import { ShopifyController } from '../controllers/shopify-controller';

const router = Router();

// Shopify webhook endpoint
router.post('/api/shopify/order_create', ShopifyController.orderCreate);

export default router;
