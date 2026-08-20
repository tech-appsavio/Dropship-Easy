import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

export interface AiRankItem {
    id: string;
    label: string;
    price?: number;
    rating?: number;
    etd?: string;
    codCharges?: number;
    rtoCharges?: number;
    availableQty?: number;
}
export interface AiRankResult { id: string; tag: string; reason: string }

// Small in-memory cache so re-opening the same screen doesn't re-spend AI tokens on an
// identical option set. Keyed by kind + a stable signature of the items.
const cache = new Map<string, AiRankResult[] | null>();
const sig = (kind: string, items: AiRankItem[]) =>
    kind + "|" + items.map((i) => `${i.id}:${i.price ?? ""}:${i.rating ?? ""}:${i.availableQty ?? ""}`).sort().join(",");

// Asks the backend (monday Models API) to rank supplier/courier options. Returns null on ANY
// failure or when AI is unavailable callers MUST fall back to their existing ordering, so
// this is a pure progressive enhancement that never breaks or blocks the flow.
export async function aiRank(kind: "supplier" | "courier", items: AiRankItem[]): Promise<AiRankResult[] | null> {
    try {
        if (!items || items.length < 2) return null;
        const key = sig(kind, items);
        if (cache.has(key)) return cache.get(key) || null;

        const tokenRes: any = await monday.get("sessionToken");
        const sessionToken = tokenRes?.data;
        const resp = await fetch("/api/ai/rank", {
            method: "POST",
            headers: sessionToken
                ? { Authorization: sessionToken, "Content-Type": "application/json" }
                : { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, items }),
        });
        const data = await resp.json();
        const ranking: AiRankResult[] | null = Array.isArray(data?.ranking) ? data.ranking : null;
        cache.set(key, ranking);
        return ranking;
    } catch {
        return null; // never break the caller
    }
}

// Reorders `options` to match the AI ranking and overlays the AI tag + reason. Any option the
// AI didn't return is appended (in its original order), so the option set is never lost.
export function applyAiRanking<T extends { value: string; tag?: string }>(
    options: T[],
    ranking: AiRankResult[] | null,
): T[] {
    if (!ranking || !ranking.length) return options;
    const byId = new Map(options.map((o) => [String(o.value), o]));
    const ordered: T[] = [];
    for (const r of ranking) {
        const opt = byId.get(String(r.id));
        if (opt) {
            ordered.push({ ...opt, tag: r.tag, aiReason: r.reason } as T);
            byId.delete(String(r.id));
        }
    }
    // Append anything the AI omitted (shouldn't happen — backend validates — but stay safe).
    for (const opt of byId.values()) ordered.push(opt);
    return ordered;
}
