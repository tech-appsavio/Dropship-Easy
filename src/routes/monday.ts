import {Router} from 'express';
const router = Router();

import * as transformationController from '../controllers/monday-controller';
import { InvocableActions } from '../controllers/invocable-actions';
import { WhatsappWebhook } from '../controllers/whatsapp-webhook';
import authenticationMiddleware from '../middlewares/authentication';

router.post('/api/monday/execute_action', authenticationMiddleware, transformationController.executeAction);
router.post('/api/monday/reverse_string', authenticationMiddleware, transformationController.reverseString);
router.post('/api/monday/action_send_message', authenticationMiddleware, InvocableActions.actionSendMessage);
router.post('/api/monday/get_columns_options', authenticationMiddleware, InvocableActions.getColumnsDropdownOptions);
router.get('/api/monday/get_columns_options', authenticationMiddleware, InvocableActions.getColumnsDropdownOptions);

// New UI view routes
router.get('/multi_order_processing', (req, res) => {
  res.sendFile('index.html', { root: 'client/build/' });
});

router.get('/order_tracking', (req, res) => {
  res.sendFile('index.html', { root: 'client/build/' });
});

// WhatsApp incoming message webhook
router.get('/api/whatsapp/webhook', WhatsappWebhook.verify);
router.post('/api/whatsapp/webhook', WhatsappWebhook.receive);

export default router;