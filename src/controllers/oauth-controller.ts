import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';
import { saveAccountToken } from '../services/account-store';
import { provisionAccount } from '../services/board-provisioning';

const AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize';
const TOKEN_URL = 'https://auth.monday.com/oauth2/token';
// Scopes needed for the server-to-server flows (create/update board items) plus `ai:consume`
// for the monday Models API (the AI assistant + AI-ranked dropdowns). Adding a scope requires
// existing users to re-authorize (Reconnect) to grant it.
const SCOPES = 'me:read boards:read boards:write ai:consume';

function redirectUri(): string {
    return process.env.MONDAY_OAUTH_REDIRECT_URI
        || `${(process.env.APP_URL || '').replace(/\/$/, '')}/oauth/callback`;
}

export class OAuthController {
    // Step 1: send the installing admin to monday's consent screen.
    static authorize(req: Request, res: Response) {
        const clientId = process.env.MONDAY_CLIENT_ID;
        if (!clientId) {
            return res.status(500).send('Missing MONDAY_CLIENT_ID');
        }
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri(),
            scope: SCOPES
        });
        // monday may append its own state; we simply forward the user to consent.
        return res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
    }

    // Step 2: monday redirects back here with ?code=... — exchange it for an
    // account-scoped access token and persist it keyed by account id.
    static async callback(req: Request, res: Response) {
        try {
            const code = req.query.code as string;
            if (!code) {
                return res.status(400).send('Missing authorization code');
            }

            const tokenRes = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: process.env.MONDAY_CLIENT_ID,
                    client_secret: process.env.MONDAY_CLIENT_SECRET,
                    redirect_uri: redirectUri(),
                    code
                })
            });

            if (!tokenRes.ok) {
                const err = await tokenRes.text();
                console.error('❌ OAuth token exchange failed:', err);
                return res.status(500).send('OAuth token exchange failed');
            }

            const tokenData: any = await tokenRes.json();
            const accessToken = tokenData.access_token;
            if (!accessToken) {
                return res.status(500).send('No access token returned');
            }

            // The token response has no account id — resolve it from the API.
            const client = new GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: accessToken }
            });
            const meResp: any = await client.request(`query { me { account { id } } }`);
            const accountId = String(meResp?.me?.account?.id || '');
            if (!accountId) {
                return res.status(500).send('Could not resolve monday account');
            }

            await saveAccountToken(accountId, accessToken);

            // Run the FULL workspace setup now — on install, right after "Add App" (which
            // triggers this OAuth flow) — so boards, all columns, connect + mirror columns,
            // and the saved mapping are ready before the user opens any view. provisionAccount
            // is idempotent (reuses existing boards on reinstall, recreates only what's
            // missing) and self-locks against concurrent runs.
            //
            // We AWAIT it here (not fire-and-forget): work started after the HTTP response
            // is sent is not guaranteed to keep running on hosted platforms, which was
            // leaving the setup half-finished. Awaiting keeps the request alive until every
            // board/column is created. Column creation is parallelized so this stays fast.
            try {
                await provisionAccount(accountId, accessToken);
            } catch (err: any) {
                // Don't fail the install if setup hiccups — the view's "finish setup" path
                // will reconcile whatever is missing on first open.
                console.error(`❌ Install-time setup failed for account ${accountId}:`, err.message);
            }

            // Return a small self-closing success page. The Account Settings tab polls its
            // own status and flips to "Connected" on its own; this popup just closes.
            return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>Connected</title>
<style>body{font-family:Inter,-apple-system,'Segoe UI',sans-serif;background:#f6f7fb;color:#323338;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;background:#fff;border:1px solid #e6e8ef;border-radius:12px;padding:32px 40px;box-shadow:0 1px 6px rgba(29,41,57,.06)}
.check{font-size:40px}</style></head>
<body><div class="box"><div class="check">✅</div><h2>App installed</h2><p style="color:#676879">Setting up your workspace… You can return to monday — your boards will be ready in a moment.</p></div>
<script>try{if(window.opener){window.opener.postMessage({type:'oauth-connected'},'*');setTimeout(function(){window.close();},1500);}else{/* install flow (main window): return the user to monday */setTimeout(function(){window.location.href='https://monday.com';},2000);}}catch(e){}</script>
</body></html>`);
        } catch (err: any) {
            console.error('❌ OAuth callback error:', err.message);
            return res.status(500).send('OAuth error');
        }
    }
}
