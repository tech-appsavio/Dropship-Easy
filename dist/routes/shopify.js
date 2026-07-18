"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shopify_controller_1 = require("../controllers/shopify-controller");
const router = (0, express_1.Router)();
// Shopify webhook endpoint
router.post('/api/shopify/order_create', shopify_controller_1.ShopifyController.orderCreate);
exports.default = router;
