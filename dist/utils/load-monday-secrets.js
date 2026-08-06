"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMondaySecretsIntoEnv = void 0;
const apps_sdk_1 = require("@mondaycom/apps-sdk");
// On monday-code, values set via `mapps code:env` ARE injected into process.env, but
// values set via `mapps code:secret` are NOT — they're only readable through the SDK's
// SecretsManager. Our code reads every credential via `process.env.*`, so at startup we
// pull each secret and copy it into process.env. This keeps all existing process.env
// reads working identically on monday-code (secrets → here) and locally (.env → dotenv),
// with no changes needed anywhere else.
//
// getKeys()/get() are synchronous. Existing process.env values are never overwritten,
// so a matching `code:env` var (or a local .env value) still wins over a secret.
function loadMondaySecretsIntoEnv() {
    try {
        const secrets = new apps_sdk_1.SecretsManager();
        const keys = secrets.getKeys();
        let loaded = 0;
        for (const key of keys) {
            const val = secrets.get(key);
            if (typeof val === 'string' && val.length > 0 && !process.env[key]) {
                process.env[key] = val;
                loaded++;
            }
        }
        // Log key NAMES only (never values) so a misconfiguration is visible in logs.
        console.log(`🔐 Loaded ${loaded} secret(s) from monday-code into process.env (available keys: ${keys.join(', ') || 'none'})`);
    }
    catch (err) {
        // Not running on monday-code (e.g. local dev) — secrets come from .env via dotenv.
        console.log('ℹ️ monday-code SecretsManager unavailable — relying on .env / process.env:', err === null || err === void 0 ? void 0 : err.message);
    }
}
exports.loadMondaySecretsIntoEnv = loadMondaySecretsIntoEnv;
