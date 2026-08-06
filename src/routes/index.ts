import express from 'express';
const router = express.Router();
import mondayRoutes from './monday';
import shopifyRoutes from './shopify';
import shiprocketRoutes from './shiprocket';
import oauthRoutes from './oauth';
import settingsRoutes from './settings';

// monday marketplace domain-association file — served at the app root so monday can
// verify the app ↔ domain link. Uses the configured OAuth Client ID, so it's always
// correct and nothing sensitive is hardcoded. Publicly accessible by design.
router.get('/monday-app-association.json', (_req, res) => {
    res.json({ apps: [{ clientID: process.env.MONDAY_CLIENT_ID || '' }] });
});

// Route modules declare their own full paths internally (e.g. /api/shiprocket/*),
// so each is mounted once at the root.
router.use(mondayRoutes);
router.use(shiprocketRoutes);
router.use(shopifyRoutes);
router.use(oauthRoutes);
router.use(settingsRoutes);

// serve client app
router.use(express.static('client/build'));

router.get('/health', function(req, res) {
  res.json(getHealth());
  res.end();
});

router.get('/view', function(req, res) {
    res.sendFile('index.html', { root: 'client/build/' });
});

function getHealth() {
  return {
    ok: true,
    message: 'Healthy'
  };
}

export default router;