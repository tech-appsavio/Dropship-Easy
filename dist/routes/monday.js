"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const transformationController = __importStar(require("../controllers/monday-controller"));
const invocable_actions_1 = require("../controllers/invocable-actions");
const whatsapp_webhook_1 = require("../controllers/whatsapp-webhook");
const authentication_1 = __importDefault(require("../middlewares/authentication"));
router.post('/api/monday/execute_action', authentication_1.default, transformationController.executeAction);
router.post('/api/monday/reverse_string', authentication_1.default, transformationController.reverseString);
router.post('/api/monday/action_send_message', authentication_1.default, invocable_actions_1.InvocableActions.actionSendMessage);
router.post('/api/monday/get_columns_options', invocable_actions_1.InvocableActions.getColumnsDropdownOptions);
router.get('/api/monday/get_columns_options', invocable_actions_1.InvocableActions.getColumnsDropdownOptions);
// New UI view routes
router.get('/multi_order_processing', (req, res) => {
    res.sendFile('index.html', { root: 'client/build/' });
});
router.get('/order_tracking', (req, res) => {
    res.sendFile('index.html', { root: 'client/build/' });
});
// WhatsApp incoming message webhook
router.get('/api/whatsapp/webhook', whatsapp_webhook_1.WhatsappWebhook.verify);
router.post('/api/whatsapp/webhook', whatsapp_webhook_1.WhatsappWebhook.receive);
exports.default = router;
