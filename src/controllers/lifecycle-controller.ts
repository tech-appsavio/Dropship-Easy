import { Request, Response } from 'express';
import { verifyMondayJwt, sessionFromDecoded } from '../utils/verify-monday-jwt';
import { purgeAccountData } from '../services/account-store';

// Handles monday's app-lifecycle webhooks (install / uninstall / subscription events),
// configured in the Developer Center under "App events". monday signs each request with a
// JWT in the Authorization header (verifiable with the app's Signing or Client Secret) and
// puts the event in the body: { type, data: { account_id, ... } }.
//
// The one we MUST act on is `uninstall`: monday-code SecureStorage is scoped to the app +
// account and SURVIVES an uninstall, so without this the account's saved credentials would
// reappear on reinstall. On uninstall we purge everything we stored for that account.
export class LifecycleController {
    static async onEvent(req: Request, res: Response) {
        try {
            // Authenticate: the request must carry a monday-signed JWT. Reject anything else
            // so this endpoint can't be used to wipe an account's data by a forged POST.
            const auth = (req.headers.authorization ?? (req.query?.token as string)) as string | undefined;
            let tokenAccountId: string | undefined;
            try {
                if (!auth) throw new Error('missing authorization token');
                const decoded = verifyMondayJwt(auth);
                tokenAccountId = sessionFromDecoded(decoded).accountId ?? decoded?.dat?.account_id ?? decoded?.account_id;
            } catch (e: any) {
                return res.status(401).json({ error: 'invalid or missing monday signature' });
            }

            const type: string | undefined = req.body?.type;
            const bodyAccountId = req.body?.data?.account_id;
            const accountId = String(tokenAccountId ?? bodyAccountId ?? '');

            if ((type === 'uninstall' || type === 'app_uninstalled') && accountId) {
                await purgeAccountData(accountId);
            }

            // Always 200 for authenticated events so monday doesn't retry. Other event types
            // (install, subscription changes) are acknowledged as no-ops.
            return res.status(200).json({ ok: true });
        } catch (err: any) {
            console.error('❌ lifecycle webhook failed:', err?.message);
            // 200 so monday doesn't hammer retries for a transient purge error; the purge is
            // best-effort and idempotent, so a later manual reset can finish the job.
            return res.status(200).json({ ok: false });
        }
    }
}
