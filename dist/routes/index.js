"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const monday_1 = __importDefault(require("./monday"));
const shopify_1 = __importDefault(require("./shopify"));
const shiprocket_1 = __importDefault(require("./shiprocket"));
// Route modules declare their own full paths internally (e.g. /api/shiprocket/*),
// so each is mounted once at the root.
router.use(monday_1.default);
router.use(shiprocket_1.default);
router.use(shopify_1.default);
// serve client app
router.use(express_1.default.static('client/build'));
router.get('/health', function (req, res) {
    res.json(getHealth());
    res.end();
});
router.get('/view', function (req, res) {
    res.sendFile('index.html', { root: 'client/build/' });
});
function getHealth() {
    return {
        ok: true,
        message: 'Healthy'
    };
}
exports.default = router;
