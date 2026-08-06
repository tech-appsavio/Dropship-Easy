import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// monday enforces both a request rate limit (HTTP 429) and a per-minute GraphQL COMPLEXITY
// budget. On large boards / bulk operations these are easy to hit, so all heavy calls should
// go through this wrapper, which detects a rate-limit / complexity error and retries with
// backoff (honoring monday's suggested wait when it provides one).
// See: https://developer.monday.com/api-reference/docs/rate-limits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pull a "retry after N seconds" hint out of whatever shape monday returned.
function retryAfterSeconds(x: any): number | null {
    const fromErrors = (errs: any[]): number | null => {
        for (const e of errs || []) {
            const s = e?.extensions?.retry_in_seconds ?? e?.extensions?.retryInSeconds ?? e?.retry_in_seconds;
            if (typeof s === "number" && s > 0) return s;
        }
        return null;
    };
    if (Array.isArray(x?.errors)) { const s = fromErrors(x.errors); if (s) return s; }
    if (Array.isArray(x?.response?.errors)) { const s = fromErrors(x.response.errors); if (s) return s; }
    const ra = x?.retry_after ?? x?.retryAfter ?? x?.headers?.["retry-after"];
    const n = Number(ra);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// True if this thrown error or this (resolved) response represents a rate-limit / complexity
// / throttling condition that is worth retrying.
function isRateLimited(x: any): boolean {
    const status = x?.status ?? x?.statusCode ?? x?.response?.status;
    if (status === 429) return true;
    const msgs: string[] = [];
    if (typeof x?.message === "string") msgs.push(x.message);
    const errs = x?.errors || x?.response?.errors;
    if (Array.isArray(errs)) for (const e of errs) {
        if (e?.message) msgs.push(String(e.message));
        if (e?.extensions?.code) msgs.push(String(e.extensions.code));
    }
    const blob = msgs.join(" ").toLowerCase();
    return /rate limit|ratelimit|complexity|budget|throttl|too many requests|429/.test(blob);
}

export interface RetryOpts { maxRetries?: number; baseDelayMs?: number }

// Drop-in replacement for `monday.api(query, options)` that retries on rate-limit/complexity.
export async function mondayApi(query: string, options?: any, retry?: RetryOpts): Promise<any> {
    const maxRetries = retry?.maxRetries ?? 5;
    const baseDelayMs = retry?.baseDelayMs ?? 800;

    for (let attempt = 0; ; attempt++) {
        let res: any;
        try {
            res = await monday.api(query, options);
        } catch (err: any) {
            if (isRateLimited(err) && attempt < maxRetries) {
                const hinted = retryAfterSeconds(err);
                const wait = hinted != null ? hinted * 1000 : baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
                console.warn(`[mondayApi] rate-limited (thrown) — retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
                await sleep(wait);
                continue;
            }
            throw err;
        }

        // monday.api usually RESOLVES with { data, errors } even for GraphQL errors, so a
        // rate-limit shows up here rather than as a throw.
        if (isRateLimited(res) && attempt < maxRetries) {
            const hinted = retryAfterSeconds(res);
            const wait = hinted != null ? hinted * 1000 : baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
            console.warn(`[mondayApi] rate-limited (response) — retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
            await sleep(wait);
            continue;
        }
        return res;
    }
}

export default mondayApi;
