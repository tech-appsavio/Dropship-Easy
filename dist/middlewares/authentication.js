"use strict";
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
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authenticationMiddleware(req, res, next) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const authorization = (_a = req.headers.authorization) !== null && _a !== void 0 ? _a : (_b = req.query) === null || _b === void 0 ? void 0 : _b.token;
            if (typeof authorization !== "string") {
                res
                    .status(401)
                    .json({ error: "not authenticated, no credentials in request" });
                return;
            }
            if (typeof process.env.MONDAY_SIGNING_SECRET !== "string") {
                res.status(500).json({ error: "Missing MONDAY_SIGNING_SECRET (should be in .env file)" });
                return;
            }
            const { accountId, userId, backToUrl, shortLivedToken } = jsonwebtoken_1.default.verify(authorization, process.env.MONDAY_SIGNING_SECRET);
            req.session = { accountId, userId, backToUrl, shortLivedToken };
            next();
        }
        catch (err) {
            res
                .status(401)
                .json({ error: "authentication error, could not verify credentials" });
        }
    });
}
exports.default = authenticationMiddleware;
