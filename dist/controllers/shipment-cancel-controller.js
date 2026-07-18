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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipmentCancelController = void 0;
const monday_service_1 = __importDefault(require("../services/monday-service"));
const SHIPROCKET_API_URL = 'https://apiv2.shiprocket.in/v1/external';
class ShipmentCancelController {
    static onStatusChange(req, res) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (req.body.challenge) {
                    return res.status(200).json({ challenge: req.body.challenge });
                }
                const { event } = req.body;
                if ((event === null || event === void 0 ? void 0 : event.type) !== 'update_column_value') {
                    return res.status(200).json({ message: 'Not a column change event' });
                }
                const { boardId, pulseId, value } = event;
                const itemId = pulseId;
                const shortLivedToken = (_a = req.session) === null || _a === void 0 ? void 0 : _a.shortLivedToken;
                if (!shortLivedToken) {
                    throw new Error('Missing authentication token');
                }
                const statusLabel = ((_b = value === null || value === void 0 ? void 0 : value.label) === null || _b === void 0 ? void 0 : _b.text) || '';
                if (statusLabel.toLowerCase() !== 'cancel') {
                    return res.status(200).json({ message: 'Status not cancel' });
                }
                // Fetch AWB code from Monday
                const awbCode = yield ShipmentCancelController.fetchAWBCode(shortLivedToken, boardId, itemId);
                if (!awbCode) {
                    throw new Error('AWB code not found');
                }
                // Authenticate with Shiprocket
                const shiprocketToken = yield ShipmentCancelController.authenticateShiprocket();
                // Cancel shipment in Shiprocket
                yield ShipmentCancelController.cancelShipment(awbCode, shiprocketToken);
                // Update Monday with cancellation status
                yield ShipmentCancelController.updateMondayStatus(shortLivedToken, boardId, itemId, '✅ Shipment Cancelled');
                return res.status(200).json({
                    success: true,
                    message: 'Shipment cancelled successfully'
                });
            }
            catch (error) {
                try {
                    const shortLivedToken = (_c = req.session) === null || _c === void 0 ? void 0 : _c.shortLivedToken;
                    const { boardId, pulseId } = req.body.event;
                    if (shortLivedToken && boardId && pulseId) {
                        yield ShipmentCancelController.updateMondayStatus(shortLivedToken, boardId, pulseId, `❌ Cancellation Failed: ${error.message}`);
                    }
                }
                catch (updateError) {
                    // Failed to update Monday with error
                }
                return res.status(500).json({ error: error.message });
            }
        });
    }
    static fetchAWBCode(token, boardId, itemId) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const mondayClient = new (yield Promise.resolve().then(() => __importStar(require('@mondaydotcomorg/api')))).ApiClient({ token });
            const query = `query ($itemId: [ID!]) {
            items(ids: $itemId) {
                column_values {
                    id
                    text
                    column {
                        title
                    }
                }
            }
        }`;
            const response = yield mondayClient.request(query, { itemId: [itemId] });
            const item = (_a = response === null || response === void 0 ? void 0 : response.items) === null || _a === void 0 ? void 0 : _a[0];
            if (!item) {
                throw new Error('Shipment not found');
            }
            const awbColumn = item.column_values.find((col) => { var _a, _b; return ((_a = col.column) === null || _a === void 0 ? void 0 : _a.title) === 'AWB Code' || ((_b = col.column) === null || _b === void 0 ? void 0 : _b.title) === 'AWB'; });
            return (awbColumn === null || awbColumn === void 0 ? void 0 : awbColumn.text) || '';
        });
    }
    static authenticateShiprocket() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            // Check if API token is directly provided
            const apiToken = process.env.SHIPROCKET_API_TOKEN;
            if (apiToken && apiToken !== 'paste_your_api_token_here') {
                return apiToken;
            }
            // Otherwise, authenticate with email/password
            const email = process.env.SHIPROCKET_EMAIL;
            const password = process.env.SHIPROCKET_PASSWORD;
            if (!email || !password) {
                throw new Error('Shiprocket credentials not configured');
            }
            const response = yield fetch(`${SHIPROCKET_API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!response.ok) {
                const errorData = yield response.json();
                if ((_a = errorData.message) === null || _a === void 0 ? void 0 : _a.includes('blocked')) {
                    throw new Error('Shiprocket account is blocked. Please wait 1-2 hours or contact support.');
                }
                throw new Error(`Shiprocket auth failed: ${errorData.message || response.statusText}`);
            }
            const data = yield response.json();
            return data.token;
        });
    }
    static cancelShipment(awbCode, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`${SHIPROCKET_API_URL}/orders/cancel/shipment/awbs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ awbs: [awbCode] })
            });
            if (!response.ok) {
                const error = yield response.text();
                throw new Error(`Shiprocket cancellation failed: ${error}`);
            }
            return yield response.json();
        });
    }
    static updateMondayStatus(token, boardId, itemId, statusMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            const columns = yield monday_service_1.default.getBoardColumns(token, boardId);
            const responseCol = columns.find((c) => c.title === 'Cancellation Response');
            if (responseCol) {
                yield monday_service_1.default.changeMultipleColumnValues(token, boardId, itemId, {
                    [responseCol.id]: statusMessage
                });
            }
        });
    }
}
exports.ShipmentCancelController = ShipmentCancelController;
