import express from 'express';
const router = express.Router();
import mondayRoutes from './monday';
import shopifyRoutes from './shopify';
import shiprocketRoutes from './shiprocket';

// Route modules declare their own full paths internally (e.g. /api/shiprocket/*),
// so each is mounted once at the root.
router.use(mondayRoutes);
router.use(shiprocketRoutes);
router.use(shopifyRoutes);

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