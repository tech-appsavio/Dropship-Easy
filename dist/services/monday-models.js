"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mondayModelsChat = void 0;
// Thin client for monday's **Models API** — an OpenAI-compatible AI gateway hosted by monday.
// The app authenticates with the ACCOUNT's own monday token, so usage draws down that
// account's monday AI tokens (no third-party key, no separate billing). Requires the token to
// carry the `ai:consume` scope and the account to be on a Pro/Enterprise plan with AI features.
// Docs: https://developer.monday.com/api-reference/docs/getting-started-with-the-models-api
const MODELS_API = 'https://api.monday.com/platform-ai-gateway/openai/v1/chat/completions';
// Best-effort chat completion. NEVER throws — returns { ok:false } on any failure so callers
// can fall back gracefully (existing behavior is preserved when AI is unavailable).
function mondayModelsChat(token, messages, opts) {
    var _a, _b, _c, _d, _e;
    return __awaiter(this, void 0, void 0, function* () {
        if (!token)
            return { ok: false, content: '', error: 'no token' };
        try {
            const body = {
                model: (opts === null || opts === void 0 ? void 0 : opts.model) || 'monday-fast',
                messages,
                temperature: (_a = opts === null || opts === void 0 ? void 0 : opts.temperature) !== null && _a !== void 0 ? _a : 0.2,
            };
            if (opts === null || opts === void 0 ? void 0 : opts.maxTokens)
                body.max_tokens = opts.maxTokens;
            if (opts === null || opts === void 0 ? void 0 : opts.responseJson)
                body.response_format = { type: 'json_object' };
            const r = yield fetch(MODELS_API, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!r.ok) {
                const t = yield r.text().catch(() => '');
                // 402/403 typically = no AI features / insufficient AI tokens on the account's plan.
                return { ok: false, content: '', error: `HTTP ${r.status}: ${String(t).slice(0, 300)}` };
            }
            const data = yield r.json();
            const content = String((_e = (_d = (_c = (_b = data === null || data === void 0 ? void 0 : data.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) !== null && _e !== void 0 ? _e : '').trim();
            return { ok: !!content, content, error: content ? undefined : 'empty response' };
        }
        catch (err) {
            return { ok: false, content: '', error: (err === null || err === void 0 ? void 0 : err.message) || 'request failed' };
        }
    });
}
exports.mondayModelsChat = mondayModelsChat;
