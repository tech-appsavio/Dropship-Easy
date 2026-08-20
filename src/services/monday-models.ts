
const MODELS_API = 'https://api.monday.com/platform-ai-gateway/openai/v1/chat/completions';

export type ModelAlias = 'monday-fast' | 'monday-standard' | 'monday-powerful';
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface ModelsChatResult { ok: boolean; content: string; error?: string }

// Best-effort chat completion. NEVER throws  returns { ok:false } on any failure so callers
// can fall back gracefully (existing behavior is preserved when AI is unavailable).
export async function mondayModelsChat(
    token: string,
    messages: ChatMessage[],
    opts?: { model?: ModelAlias; temperature?: number; maxTokens?: number; responseJson?: boolean },
): Promise<ModelsChatResult> {
    if (!token) return { ok: false, content: '', error: 'no token' };
    try {
        const body: any = {
            model: opts?.model || 'monday-fast',        // Claude Haiku 4.5  lowest AI-token cost
            messages,
            temperature: opts?.temperature ?? 0.2,
        };
        if (opts?.maxTokens) body.max_tokens = opts.maxTokens;
        if (opts?.responseJson) body.response_format = { type: 'json_object' };

        const r = await fetch(MODELS_API, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const t = await r.text().catch(() => '');
            // 402/403 typically = no AI features / insufficient AI tokens on the account's plan.
            return { ok: false, content: '', error: `HTTP ${r.status}: ${String(t).slice(0, 300)}` };
        }
        const data: any = await r.json();
        const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
        return { ok: !!content, content, error: content ? undefined : 'empty response' };
    } catch (err: any) {
        return { ok: false, content: '', error: err?.message || 'request failed' };
    }
}
