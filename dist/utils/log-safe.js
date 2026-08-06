"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeError = void 0;
// Returns a concise, PII-safe error string for logging.
//
// graphql-request's ClientError.message embeds the FULL request query + variables — which
// for our mutations include user data (customer names, addresses, phone numbers). Logging
// it verbatim would leak PII into server logs. This prefers the GraphQL error messages
// (the actual failure reason) and never includes the request variables.
function safeError(err) {
    var _a;
    const gqlErrors = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length) {
        return gqlErrors.map((e) => e === null || e === void 0 ? void 0 : e.message).filter(Boolean).join('; ') || 'GraphQL error';
    }
    // For non-GraphQL errors, err.message is our own (PII-free) message text.
    return (err === null || err === void 0 ? void 0 : err.message) || String(err);
}
exports.safeError = safeError;
