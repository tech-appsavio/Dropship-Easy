import {Router} from 'express';
const router = Router();

import * as transformationController from '../controllers/monday-controller';
import authenticationMiddleware from '../middlewares/authentication';

router.post('/api/monday/execute_action', authenticationMiddleware, transformationController.executeAction);
router.post('/api/monday/reverse_string', authenticationMiddleware, transformationController.reverseString);

// New UI view routes
router.get('/multi_order_processing', (req, res) => {
  res.sendFile('index.html', { root: 'client/build/' });
});

router.get('/order_tracking', (req, res) => {
  res.sendFile('index.html', { root: 'client/build/' });
});

export default router;
