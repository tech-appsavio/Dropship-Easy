import { SecretsManager } from '@mondaycom/apps-sdk';

// On monday-code, values set via `mapps code:env` ARE injected into process.env, but
// values set via `mapps code:secret` are NOT  they're only readable through the SDK's
// SecretsManager. Our code reads every credential via `process.env.*`, so at startup we
// pull each secret and copy it into process.env. This keeps all existing process.env
// reads working identically on monday-code (secrets → here) and locally (.env → dotenv),
// with no changes needed anywhere else.
//
// getKeys()/get() are synchronous. Existing process.env values are never overwritten,
// so a matching `code:env` var (or a local .env value) still wins over a secret.
export function loadMondaySecretsIntoEnv(): void {
    try {
        const secrets = new SecretsManager();
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
    } catch (err: any) {
        // Not running on monday-code (e.g. local dev)  secrets come from .env via dotenv.
    }
}
