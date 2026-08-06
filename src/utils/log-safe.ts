// Returns a concise, PII-safe error string for logging.
//
// graphql-request's ClientError.message embeds the FULL request query + variables — which
// for our mutations include user data (customer names, addresses, phone numbers). Logging
// it verbatim would leak PII into server logs. This prefers the GraphQL error messages
// (the actual failure reason) and never includes the request variables.
export function safeError(err: any): string {
    const gqlErrors = err?.response?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length) {
        return gqlErrors.map((e: any) => e?.message).filter(Boolean).join('; ') || 'GraphQL error';
    }
    // For non-GraphQL errors, err.message is our own (PII-free) message text.
    return err?.message || String(err);
}
