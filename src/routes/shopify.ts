import { Router } from 'express';
import { ShopifyController } from '../controllers/shopify-controller';

const router = Router();

// Primary: per-account webhook URL (account resolved from the token in the path).
router.post('/api/shopify/order_create/:token', ShopifyController.orderCreateByToken);
// Legacy shared endpoint (routes by shop domain) kept for backward compatibility.
router.post('/api/shopify/order_create', ShopifyController.orderCreate);

export default router;
