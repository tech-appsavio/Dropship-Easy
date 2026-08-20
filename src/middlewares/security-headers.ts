import { Request, Response, NextFunction } from 'express';

// Adds security headers for Burp/OWASP ZAP while keeping monday iframe support.
// - CSP uses only frame-ancestors to prevent clickjacking without breaking inline scripts/styles.
// - Allows monday to embed the app but blocks other sites.
// - Does not use X-Frame-Options: DENY because it would break monday embedding.
// - Adds HSTS for extra security; monday-code also sets it at the edge.

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
    // Who is allowed to iframe this app: monday only (plus itself).
    res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'self' https://*.monday.com https://*.monday.app"
    );
    // Stop MIME-type sniffing.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Don't leak full URLs (which may carry tokens) in the Referer header cross-origin.
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Enforce HTTPS for a year, including subdomains.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Disable browser features the app never uses (defense-in-depth; also greens the
    // "Permissions-Policy" check in header scanners). Empty allowlist = feature blocked.
    res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
    );
    // Don't advertise the server stack.
    res.removeHeader('X-Powered-By');
    next();
}

export default securityHeaders;
