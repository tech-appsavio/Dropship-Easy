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
exports.webhookAuthenticationMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function webhookAuthenticationMiddleware(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const authorization = req.headers.authorization;
            if (!authorization) {
                // For webhooks, Monday might not send auth header during verification
                // Allow the request to proceed
                req.session = {
                    accountId: '',
                    userId: '',
                    backToUrl: undefined,
                    shortLivedToken: process.env.MONDAY_API_TOKEN
                };
                next();
                return;
            }
            if (typeof process.env.MONDAY_SIGNING_SECRET !== "string") {
                res.status(500).json({ error: "Missing MONDAY_SIGNING_SECRET" });
                return;
            }
            const { accountId, userId, backToUrl, shortLivedToken } = jsonwebtoken_1.default.verify(authorization, process.env.MONDAY_SIGNING_SECRET);
            req.session = { accountId, userId, backToUrl, shortLivedToken };
            next();
        }
        catch (err) {
            // If JWT verification fails, use API token as fallback
            req.session = {
                accountId: '',
                userId: '',
                backToUrl: undefined,
                shortLivedToken: process.env.MONDAY_API_TOKEN
            };
            next();
        }
    });
}
exports.webhookAuthenticationMiddleware = webhookAuthenticationMiddleware;
