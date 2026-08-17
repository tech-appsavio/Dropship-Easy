"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityHeaders = void 0;
// Adds the standard security response headers that automated scanners (Burp / OWASP ZAP)
// expect, WITHOUT breaking the fact that this app is designed to run inside a monday iframe.
//
// Deliberate choices:
// - CSP is limited to `frame-ancestors` only. We DON'T set script-src/style-src, because the
//   app (and the OAuth success page) rely on inline styles/scripts — a restrictive CSP would
//   break them. frame-ancestors still hardens against clickjacking.
// - `frame-ancestors` ALLOWS monday to embed us (that's required) but blocks everyone else,
//   so this is a security win that keeps the board views + how-to page embeddable.
// - We intentionally do NOT send `X-Frame-Options: DENY` — that would break monday embedding.
//   (frame-ancestors is the modern replacement and is respected by current browsers.)
// - HSTS is asserted here too; monday-code also sets it at the edge (harmless to reinforce).
function securityHeaders(_req, res, next) {
    // Who is allowed to iframe this app: monday only (plus itself).
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.monday.com https://*.monday.app");
    // Stop MIME-type sniffing.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Don't leak full URLs (which may carry tokens) in the Referer header cross-origin.
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Enforce HTTPS for a year, including subdomains.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Disable browser features the app never uses (defense-in-depth; also greens the
    // "Permissions-Policy" check in header scanners). Empty allowlist = feature blocked.
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()');
    // Don't advertise the server stack.
    res.removeHeader('X-Powered-By');
    next();
}
exports.securityHeaders = securityHeaders;
exports.default = securityHeaders;
