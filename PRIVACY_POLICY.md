# Privacy Policy — Ship Easy (Multi-Order Processing for monday.com)

**Effective date:** 6 August 2026
**Last updated:** 6 August 2026

This Privacy Policy explains how **Appsavio** ("we", "us", "our") — the
publisher of **Ship Easy**, the Multi-Order Processing app for monday.com (the "App") — collects,
uses, stores, shares, and protects information when you install and use the App.

By installing or using the App, you agree to the practices described here.

---

## 1. Who this applies to

This policy applies to monday.com account administrators and users who install or use the App,
and to the end-customer order data processed by the App on your behalf.

## 2. What the App does

The App connects a monday.com account with Shopify, Shiprocket, and WhatsApp to automate
dropshipping order processing:

- Ingests Shopify orders and creates corresponding records on your monday.com boards.
- Sends order-confirmation messages to customers via WhatsApp.
- Assigns suppliers and couriers, creates shipments in Shiprocket, and generates manifests
  and shipping labels.

## 3. Information we process

### 3.1 Authentication and configuration data (stored)

Stored **encrypted** in **monday.com Secure Storage** (see Section 6), scoped to your account:

| Data | Purpose |
|---|---|
| monday.com OAuth access token | Perform actions on your monday.com boards on your behalf (e.g. create order records for incoming webhooks when no user session is present). |
| Board and column ID mapping | Locate the boards/columns the App reads and writes. |
| WhatsApp Business API credentials (access token, phone/business IDs, verify token) | Send order-confirmation messages from **your** WhatsApp number. |
| Shiprocket credentials (email/password or API token) and pickup location | Create shipments, assign AWBs, track and cancel shipments. |
| Shopify store domain and a per-account webhook token | Route your Shopify order webhooks to your monday.com account. |

### 3.2 Order and customer data (processed, not stored in a separate database)

When a Shopify order is received, the App processes order details — including **personal data**
such as customer name, shipping/billing address, phone number, and email — for the sole purpose
of creating the corresponding records on **your** monday.com boards and fulfilling the order
(WhatsApp confirmation and Shiprocket shipping).

**We do not store this order/customer data in our own separate database.** It is written to your
monday.com boards (which you control) and transmitted to the third-party services listed in
Section 5 as needed to fulfill the order. Any transient copies exist only for the duration of
processing a request.

## 4. How we use information

We use the information above only to:

- Provide the App's functionality (order intake, confirmation, supplier/courier selection,
  shipment creation, manifest and label generation, tracking, and cancellation).
- Route webhooks to the correct account and authenticate requests.
- Diagnose and fix operational issues.

We do **not** sell your data, and we do **not** use it for advertising or cross-site tracking.

## 5. Third-party services and domains (frontend and backend)

The App communicates with the following third-party domains/products **only as needed** to
deliver its features. Their handling of data is governed by their own policies. The App uses
**no** analytics, advertising, tracking, CDN, or error-monitoring third parties.

| Service / Domain | Used by | Data shared | Why |
|---|---|---|---|
| **monday.com API** — `api.monday.com` | Frontend (via `monday-sdk-js`) **and** Backend | Board/item/column data you configure; the account OAuth token (backend only) | Core platform: read and write the boards, items, and columns the App operates on. |
| **monday OAuth** — `auth.monday.com` | Backend | OAuth authorization code / client credentials | Obtain the per-account access token during app install. |
| **Shopify** (your store's webhooks) | Backend (inbound) | The App **receives** order data from your store via webhook; it sends nothing back to Shopify | Source of the orders the App processes. |
| **Shiprocket** — `apiv2.shiprocket.in` | Backend | Customer name, shipping address, phone, and order/shipment details | Check courier serviceability, create shipments, assign AWBs, track, and cancel shipments. |
| **Meta WhatsApp Cloud API** — `graph.facebook.com` | Backend | Customer phone number and order-confirmation message content | Send order-confirmation messages from **your** WhatsApp Business number. |
| **monday-code hosting & Secure Storage** — `*.monday.app` | Frontend + Backend (hosting) | App code hosting; encrypted storage of tokens/credentials/config (no order/customer data stored) | Runs and hosts the App and stores its configuration securely (see Section 6). |

Bundled client-side libraries (`@vibe/core` UI components, `jspdf` for label/manifest PDFs)
run entirely in the browser and make **no** network requests to third parties.

## 6. Data storage and security

- **Hosting:** The App backend and frontend are hosted on **monday.com's monday-code**
  infrastructure. All traffic is encrypted in transit using **HTTPS/TLS 1.2 or higher**.
- **Encryption at rest:** All tokens, credentials, and configuration are stored in
  **monday.com Secure Storage**, which encrypts data at rest. We do not operate a separate
  application database, so no personal data is persisted outside monday.com's managed storage.
- **Access tokens:** The monday.com access token is stored encrypted, used only server-side to
  perform the actions you authorize, and cleared automatically if it is detected to be revoked.
- **Least-privilege scopes:** The App requests only the monday.com scopes it needs (see Section 7).
- **Logging:** Operational logs contain no access tokens; personal data such as phone numbers is
  masked, and error logs are sanitized to exclude request payloads. Logs are retained per
  monday-code's default log retention.
- **Cookies:** The App does not use cookies for authentication and does not use tracking cookies.

## 7. monday.com permission scopes

| Scope | Why it is needed |
|---|---|
| `me:read` | Identify the installing account (account ID) to isolate each customer's data. |
| `boards:read` | Read your orders, line items, suppliers, and configuration. |
| `boards:write` | Create the required boards/columns and write order, shipment, and status data. |

We request only these scopes and nothing more.

## 8. Data retention and deletion

Configuration and credentials are retained for as long as the App is installed, so the App can
function. Because all such data lives in **monday.com Secure Storage**, its lifecycle is managed
by monday.com and tied to your installation. If you uninstall or de-authorize the App, associated
stored data is handled in accordance with monday.com's platform data-lifecycle for app storage.

Order/customer records the App creates live on **your** monday.com boards and remain under your
control; you can delete them at any time.

To request deletion of any data we may hold, contact us at the address in Section 11.

## 9. Your rights

Depending on your jurisdiction (e.g. GDPR/CCPA), you may have rights to access, correct, delete,
or restrict processing of personal data, and to data portability. To exercise these rights,
contact us at the address in Section 11. As the App acts as a **data processor** for order data
on your behalf, requests from end customers should generally be directed to you (the merchant /
monday.com account holder) as the data controller.

## 10. Changes to this policy

We may update this policy from time to time. Material changes will be reflected by updating the
"Last updated" date above and, where appropriate, notifying account administrators.

## 11. Contact

**Appsavio**
Support email: **info@appsavio.com**
Website: **https://www.appsavio.com**
