import { Router } from 'express';
import { LifecycleController } from '../controllers/lifecycle-controller';

const router = Router();

// monday app-lifecycle webhook (install / uninstall / subscription events). Set this URL
// as the "App events" subscription URL in the Developer Center. On uninstall it purges the
// account's stored data (credentials, token, board config, webhook routing).
router.post('/api/monday/lifecycle', LifecycleController.onEvent);

export default router;
