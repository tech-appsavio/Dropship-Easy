# Marketplace security review — short answers

Paste these into the review form. Replace _[BRACKETS]_. Items marked ⚠️ require you to finish an
action first, or the answer isn't yet truthful.

---

### Secrets storage — "how does the app store secrets; are secrets in the repo?"
App-level secrets (monday OAuth client secret, WhatsApp and Shiprocket credentials) are stored as
**monday-code secrets** (`mapps code:secret`) and loaded into the process environment at startup
via the monday SDK `SecretsManager`. They are **not** committed to the code repository.
Evidence: `src/utils/load-monday-secrets.ts`.
⚠️ *Before submitting: rotate any secret that was ever committed to git and remove it from git
history / the `code.tar.gz` artifact, so this statement is fully accurate.*

### Token encryption — "how are tokens stored; controls for the monday user access token?"
The monday.com user access token is stored **encrypted at rest** in **monday.com Secure Storage**,
keyed per account. Controls: it is used **server-side only**, never returned to the frontend,
transmitted only over TLS 1.2+, and **automatically cleared** if monday reports it as revoked.
Evidence: `src/services/account-store.ts` (`SecureStorage`, `saveAccountToken`/`getAccountToken`/
`deleteAccountToken`).

### User data in a database — "are you storing user data; what and why?"
We do **not** operate a separate application database. Configuration and credentials
(OAuth token, board/column mapping, WhatsApp/Shiprocket credentials, Shopify domain, webhook
token) are stored **encrypted in monday Secure Storage**. Order/customer personal data
(name, address, phone, email) is **processed transiently** to create records on the customer's own
monday boards and to fulfill the order (WhatsApp + Shiprocket); it is **not** persisted by us.

### Scopes — "describe each scope and why it's needed"
- `me:read` — identify the installing account (account ID) to isolate each customer's data.
- `boards:read` — read orders, line items, suppliers, and configuration.
- `boards:write` — create the required boards/columns and write order, shipment, and status data.
Only these three scopes are requested.

### Logging — "what is logged; retention; is the monday logger enabled?"
Operational logs record account IDs, board/item IDs, order IDs, and processing steps/errors.
They contain **no access tokens**; personal data such as phone numbers is **masked**, and error
logs are **sanitized** to exclude request payloads. The app writes to stdout, which monday-code
captures — the **monday logger is enabled** (viewable via `mapps code:logs`). Retention: monday-code
default _[state a specific period if you enforce one]_.
Evidence: `src/utils/log-safe.ts`, `maskPhone` in `src/controllers/invocable-actions.ts`.

### Encryption at rest — "how / what algorithm?"
**Skipped — the app uses monday storage.** All data at rest is stored in monday Secure Storage,
which handles encryption; we do not operate our own datastore.

### Injection protection — "how do you protect against injection?"
There is no SQL or external database. All monday.com API calls are **parameterized with GraphQL
variables** (`$boardId`, `$itemName`, `$columnValues`, `$ids`, …) — no user or external data is
string-interpolated into queries.
Evidence: `src/services/monday-service.ts`, `src/services/board-provisioning.ts`.

### Input validation — "what validation do you perform on user-supplied data?"
Settings input is restricted to a **field whitelist**, accepts only string/number primitives,
is trimmed, and is **length-capped (4096 chars)**. Incoming Shopify webhook payloads are validated
for shape (object with an `id`) before processing. Output is **HTML-encoded by React** on the
frontend (no raw HTML rendering / `dangerouslySetInnerHTML`).
Evidence: `src/routes/settings.ts`, `src/controllers/shopify-controller.ts`.

### De-authorization / data deletion
**Not relevant — the app uses monday storage.** Stored data lives in monday Secure Storage and
follows monday's platform data-lifecycle for app storage; the app also clears stored tokens when
they are detected revoked.

---

## Authentication flow — OAuth

**Why OAuth instead of Seamless Authentication?**
The app must act on monday boards for **session-less, server-to-server events** — Shopify
order-create webhooks and Shiprocket shipment-cancellation webhooks — where no user or monday
session is present. Seamless authentication only yields a token during an active user session;
OAuth provides a stored, account-scoped token for this background processing. (We additionally use
Seamless Authentication via the monday SDK for the interactive board/item views.)

**Does the app redirect to any malicious URLs during the OAuth/API token flow?**
No. The OAuth `redirect_uri` is a fixed, app-owned callback on our own monday-code domain. The app
never redirects to user-supplied URLs; after the callback it renders a static success page.
Evidence: `src/controllers/oauth-controller.ts`.

**Does the app handle the OAuth flow for users with multiple accounts?**
Yes. After the token exchange we resolve the account via `me { account { id } }` and store the
token **keyed by that account ID**. Every stored key (token, config, settings, mappings) is
namespaced by account ID, so multiple accounts are fully isolated.

## Authentication flow — Seamless (monday SDK for views)

- **Backend hosting:** monday-code (monday's hosting). Full domain:
  `live1-service-29650221-e76f8f79.us.monday.app`
  _(Note: this is a monday.app hosting subdomain provided by monday-code; confirm with the review
  team how the "domain must not contain 'monday'" rule applies to monday-code-hosted apps.)_
- **Frontend hosting:** served from the same monday-code URL above (custom URL).
- **Framework:** React (Create React App), using the **@vibe/core** component library and
  **monday-sdk-js**.
- **Request auth:** every backend request is authenticated — the monday session JWT is verified
  against the app's Signing Secret / OAuth Client Secret, and session-less webhooks are
  authenticated by an unguessable per-account token in the URL. Evidence:
  `src/middlewares/authentication.ts`, `src/middlewares/webhook-authentication.ts`,
  `src/utils/verify-monday-jwt.ts`.

## Third-party domains/products (front + back)

| Party | Where | Why |
|---|---|---|
| monday.com API — `api.monday.com` | backend + frontend | Core platform: read/write boards and items. |
| Shiprocket — `apiv2.shiprocket.in` | backend + frontend (via proxy) | Create shipments, assign AWBs, tracking, cancellation. |
| WhatsApp / Meta — `graph.facebook.com` | backend | Send order-confirmation messages. |
| Shopify | backend (inbound webhook) | Source of orders (Shopify calls our webhook URL). |

_[Add any analytics/error-monitoring/CDN you use. All of these must also appear in the privacy
policy.]_
