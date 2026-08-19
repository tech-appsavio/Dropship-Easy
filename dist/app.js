"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const body_parser_1 = __importDefault(require("body-parser"));
const routes_1 = __importDefault(require("./routes"));
const security_headers_1 = __importDefault(require("./middlewares/security-headers"));
const load_monday_secrets_1 = require("./utils/load-monday-secrets");
dotenv_1.default.config();
// On monday-code, `code:secret` values aren't injected into process.env (only `code:env`
// vars are). Pull them in here so every `process.env.*` credential read works the same on
// monday-code and locally. Runs before app.listen, so requests always see the secrets.
(0, load_monday_secrets_1.loadMondaySecretsIntoEnv)();
const app = (0, express_1.default)();
const port = process.env.PORT;
app.disable('x-powered-by'); // don't advertise Express
app.use(security_headers_1.default); // security response headers on every route
app.use(body_parser_1.default.json());
app.use(routes_1.default);
app.listen(port);
exports.default = app;
