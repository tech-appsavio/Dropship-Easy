"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shopify_controller_1 = require("../controllers/shopify-controller");
const router = (0, express_1.Router)();
// Primary: per-account webhook URL (account resolved from the token in the path).
router.post('/api/shopify/order_create/:token', shopify_controller_1.ShopifyController.orderCreateByToken);
// Legacy shared endpoint (routes by shop domain) — kept for backward compatibility.
router.post('/api/shopify/order_create', shopify_controller_1.ShopifyController.orderCreate);
exports.default = router;
