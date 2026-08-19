# Dropship Easy — Security & Privacy Review Evidence (monday Marketplace)

**App:** Dropship Easy (Multi-Order Processing for monday.com)
**Publisher:** Appsavio
**Support email:** info@appsavio.com  ·  **Website:** https://www.appsavio.com
**Backend/Frontend domain:** `live1-service-29650221-e76f8f79.us.monday.app` (monday-code hosting)
**Date:** 7 August 2026

> This document collects the evidence for each item on monday's privacy-and-security checklist.
> For every section, paste the screenshot where indicated (**📎 Attach screenshot**) and keep the
> short answer. These artifacts are for the app review only.

---

## 1. HTTPS certificate, HSTS, and TLS 1.2+

**Answer:** The app is hosted on monday-code, which serves it over valid HTTPS with HSTS enabled
and TLS 1.2/1.3 only. Independently verified by Qualys SSL Labs — **grade A+** on all endpoints
(IPv4 and IPv6).

**SSL Labs link:** https://www.ssllabs.com/ssltest/analyze.html?d=live1-service-29650221-e76f8f79.us.monday.app

**📎 Attach screenshot:** _SSL Labs A+ report_

---

## 2. Malware / domain reputation scan (domain + subdomain)

**Answer:** The domain was scanned with two independent reputation services and is clean:
- **Palo Alto URL Filtering** — Category *Business-and-Economy*, **Risk Level: Low-Risk**.
- **Google Safe Browsing** — **"No unsafe content found."**

**📎 Attach screenshot 1:** _Palo Alto URL Filtering result (Low-Risk)_
**📎 Attach screenshot 2:** _Google Safe Browsing "No unsafe content found"_

---

## 3. Security response headers

**Answer:** The app sets clickjacking/hardening headers on every response, configured to remain
embeddable inside monday: `Content-Security-Policy: frame-ancestors 'self' https://*.monday.com
https://*.monday.app`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Strict-Transport-Security`, and `X-Powered-By` removed.
Evidence: `src/middlewares/security-headers.ts`.

Verify command:
`curl -sI https://live1-service-29650221-e76f8f79.us.monday.app/ | grep -iE "content-security-policy|x-content-type-options|referrer-policy|strict-transport-security"`

**📎 Attach screenshot:** _curl output showing the response headers live_

---

## 4. Authentication & authorization (all requests)

**Answer:** Every backend request is authenticated and authorized.
- Interactive views/API use the monday **session JWT**, whose signature is verified (against the
  Signing Secret / OAuth Client Secret) before the request proceeds; unauthenticated requests get
  a 401.
- Session-less webhooks (Shopify order-create, Shiprocket cancel) are authorized by an **unguessable
  per-account token** in the URL.
- OAuth is used for background, server-to-server actions; the `redirect_uri` is a fixed, app-owned
  callback (never a user-supplied URL).

Evidence: `src/middlewares/authentication.ts`, `src/middlewares/webhook-authentication.ts`,
`src/utils/verify-monday-jwt.ts`, `src/controllers/oauth-controller.ts`.

**📎 Attach screenshot:** _`src/middlewares/authentication.ts` (the authorization code)_

---

## 5. Secrets management

**Answer:** App-level secrets (monday OAuth client secret, WhatsApp and Shiprocket credentials) are
stored as **monday-code secrets** (`mapps code:secret`) and loaded into the process environment at
startup via the monday SDK `SecretsManager`. They are **not** committed to the repository.
Evidence: `src/utils/load-monday-secrets.ts`.

> ⚠️ **Action before submitting:** rotate any secret that was ever committed to git and remove it
> from git history / the `code.tar.gz` artifact, so this statement is fully accurate.

**📎 Attach screenshot (optional):** _`load-monday-secrets.ts` and/or `mapps code:secret` list_

---

## 6. Token encryption & encryption at rest

**Answer:** The monday user access token (and all config/credentials) is stored **encrypted at rest**
in **monday Secure Storage**, keyed per account. Controls: used **server-side only**, never returned
to the frontend, transmitted only over TLS 1.2+, and **automatically cleared** if monday reports it
revoked. We do not run our own datastore, so no separate encryption-at-rest implementation is needed.
Evidence: `src/services/account-store.ts`.

**📎 Attach screenshot (optional):** _`account-store.ts` (SecureStorage usage)_

---

## 7. User data stored (what / why / where)

**Answer:** No separate application database. Configuration and credentials (OAuth token,
board/column mapping, WhatsApp/Shiprocket credentials, Shopify domain, per-account webhook token)
are stored **encrypted in monday Secure Storage**. Order/customer personal data (name, address,
phone, email) is **processed transiently** to create records on the customer's own monday boards and
to fulfill the order (WhatsApp + Shiprocket) — it is **not** persisted by us.

_(No screenshot required — text answer.)_

---

## 8. monday permission scopes (least privilege)

**Answer:** Only three scopes are requested:
- `me:read` — identify the installing account (account ID) to isolate each customer's data.
- `boards:read` — read orders, line items, suppliers, and configuration.
- `boards:write` — create the required boards/columns and write order, shipment, and status data.

_(No screenshot required — text answer.)_

---

## 9. Logging & retention (monday logger enabled)

**Answer:** Logs record account IDs, board/item IDs, order IDs, and processing steps/errors. They
contain **no access tokens**; personal data such as phone numbers is **masked**, and error logs are
**sanitized** to exclude request payloads. The app writes to stdout, which monday-code captures — the
**monday logger is enabled** (viewable via `mapps code:logs`). Retention: monday-code default.
Evidence: `src/utils/log-safe.ts`, `maskPhone` in `src/controllers/invocable-actions.ts`.

**📎 Attach screenshot:** _`mapps code:logs` output showing logs streaming (logger enabled)_

---

## 10. Injection protection & input validation

**Answer:** There is no SQL / external database. All monday API calls are **parameterized with
GraphQL variables** (`$boardId`, `$itemName`, `$columnValues`, `$ids`, …) — no user/external data is
string-interpolated into queries. Settings input is restricted to a **field whitelist**, accepts
only string/number primitives, is trimmed, and is **length-capped (4096 chars)**. Incoming Shopify
payloads are validated for shape before processing. Frontend output is **HTML-encoded by React**
(no raw HTML / `dangerouslySetInnerHTML`).
Evidence: `src/services/monday-service.ts`, `src/routes/settings.ts`, `src/controllers/shopify-controller.ts`.

**📎 Attach screenshot (optional):** _a parameterized query (e.g. `monday-service.ts`) and the settings validation_

---

## 11. Third-party domains / products (frontend + backend)

**Answer:** (Also listed in the public privacy policy.)

| Party / Domain | Where | Why |
|---|---|---|
| monday.com API — `api.monday.com` | backend + frontend | Core platform: read/write boards and items. |
| monday OAuth — `auth.monday.com` | backend | Obtain the per-account access token at install. |
| Shiprocket — `apiv2.shiprocket.in` | backend (frontend via proxy) | Create shipments, assign AWBs, tracking, cancellation. |
| Meta WhatsApp Cloud API — `graph.facebook.com` | backend | Send order-confirmation messages. |
| Shopify | backend (inbound webhook) | Source of orders (Shopify calls our webhook URL). |
| monday-code + Secure Storage — `*.monday.app` | hosting | Hosts the app; encrypted config storage. |

No analytics, advertising, tracking, CDN, or error-monitoring third parties. Bundled libraries
(`@vibe/core`, `jspdf`) make no network calls.

_(No screenshot required — text answer.)_

---

## 12. Cookies

**Answer:** The app does **not** use cookies for authentication (auth is via the monday session JWT
in request headers) and uses **no tracking cookies**.

_(No screenshot required — text answer.)_

---

## 13. Domain association & data deletion on termination

**Answer:**
- **Domain association:** the app serves `monday-app-association.json` (`{"apps":[{"clientID":"…"}]}`)
  from its host. Evidence: `src/routes/index.ts`.
  ⚠️ *Confirm with the review team whether hosting on the monday-code domain suffices, or whether the
  file should also be hosted at `https://www.appsavio.com/monday-app-association.json` to match the
  support-email domain.*
- **Data deletion:** the app uses **monday Secure Storage**, so stored data follows monday's platform
  data-lifecycle; the app also clears stored tokens when detected revoked. (No separate 10-day
  deletion process required for monday-storage apps.)

**📎 Attach screenshot (optional):** _the served `/monday-app-association.json` response_

---

## 14. Privacy policy

**Answer:** Public privacy policy covering data processed, third-party services, storage/security,
scopes, retention, and contact.

**Privacy policy URL:** _[PASTE the public HTTPS URL once hosted, e.g. https://www.appsavio.com/ship-easy/privacy]_

_(No screenshot required — provide the link.)_

---

### Outstanding actions before submitting (checklist)
- [ ] Rotate + purge any secret ever committed to git (section 5)
- [ ] Capture `mapps code:logs` screenshot (section 9)
- [ ] Confirm domain-association hosting / support-email rule with monday (section 13)
- [ ] Host the privacy policy and paste its URL (section 14)
- [ ] Run OWASP ZAP self-test before monday's Burp scan
