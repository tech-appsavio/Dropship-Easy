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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authentication_1 = __importDefault(require("../middlewares/authentication"));
const account_store_1 = require("../services/account-store");
const monday_models_1 = require("../services/monday-models");
const router = (0, express_1.Router)();
// Serve the SPA shell for the board-header AI assistant surface. monday loads this URL in the
// assistant iframe; the React app then routes to <AiAssistant/> and authenticates via the
// session token. No auth here — it's just the HTML shell (same pattern as /settings, /view).
router.get(['/ai_assistant', '/ai-assistant'], (_req, res) => {
    res.sendFile('index.html', { root: 'client/build/' });
});
// ── Board-header AI assistant ────────────────────────────────────────────────
// Answers a question using board context the caller passes in (non-PII attributes). Uses the
// account's own monday token via the Models API — draws on the account's monday AI tokens.
router.post('/api/ai/assistant', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const accountId = (_a = req.session) === null || _a === void 0 ? void 0 : _a.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const prompt = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.prompt) || '').slice(0, 4000);
        const context = String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.context) || '').slice(0, 8000);
        const boardName = String(((_d = req.body) === null || _d === void 0 ? void 0 : _d.boardName) || '').slice(0, 200);
        if (!prompt)
            return res.status(400).json({ error: 'prompt required' });
        const token = yield (0, account_store_1.resolveMondayToken)(String(accountId));
        if (!token)
            return res.status(200).json({ answer: 'Please reconnect your monday account in Account Settings to use the assistant.' });
        // Board-aware system prompt: the assistant works on ANY of the app's boards, so it must
        // refer to the records by what they actually are (line items, customers, suppliers,
        // shipments, errors…) based on the board name — NOT always call them "orders".
        const sys = `You are the Ship Easy assistant embedded in a monday.com board` +
            (boardName ? ` named "${boardName}"` : '') + `. ` +
            `Refer to the board's records by what they actually are, inferred from the board name ` +
            `(e.g. "Order Line Items" → line items; "Customers" → customers; "Suppliers" → suppliers; ` +
            `"Shipments" → shipments; "Error Logs" → errors; "Orders" → orders). Do NOT call everything "orders". ` +
            `Answer using ONLY the provided board data. Be clear and genuinely helpful: give a well-structured answer ` +
            `using light markdown — an optional short heading, **bold** labels, and "- " bullet points — and end with a ` +
            `one-line takeaway when useful. If the data does not contain the answer, say so plainly and suggest what to check. ` +
            `Keep it under ~180 words.`;
        const result = yield (0, monday_models_1.mondayModelsChat)(token, [
            { role: 'system', content: sys },
            { role: 'user', content: context ? `Board data (JSON):\n${context}\n\nQuestion: ${prompt}` : prompt },
        ], { model: 'monday-standard', maxTokens: 900 });
        if (!result.ok) {
            console.warn('[ai/assistant] model unavailable:', result.error);
            return res.status(200).json({ answer: 'The AI assistant is unavailable right now. It requires a monday Pro/Enterprise plan with AI features enabled. Please try again later.' });
        }
        return res.json({ answer: result.content });
    }
    catch (err) {
        console.error('[ai/assistant] error:', err === null || err === void 0 ? void 0 : err.message);
        return res.status(200).json({ answer: 'The assistant hit an error. Please try again.' });
    }
}));
// ── AI ranking for supplier / courier dropdowns ──────────────────────────────
// Returns { ranking: [{id, tag, reason}] } ordered best→worst, or { ranking: null } on ANY
// failure so the client keeps its existing (weighted) ordering. AI never blocks the flow.
router.post('/api/ai/rank', authentication_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _e, _f, _g;
    try {
        const accountId = (_e = req.session) === null || _e === void 0 ? void 0 : _e.accountId;
        if (!accountId)
            return res.status(401).json({ error: 'no account session' });
        const kind = ((_f = req.body) === null || _f === void 0 ? void 0 : _f.kind) === 'courier' ? 'courier' : 'supplier';
        const items = Array.isArray((_g = req.body) === null || _g === void 0 ? void 0 : _g.items) ? req.body.items.slice(0, 25) : [];
        if (items.length < 2)
            return res.json({ ranking: null }); // nothing to rank
        const token = yield (0, account_store_1.resolveMondayToken)(String(accountId));
        if (!token)
            return res.json({ ranking: null });
        const criteria = kind === 'courier'
            ? 'lower freight/price is better; higher rating is better; faster ETD is better; lower RTO charges are better'
            : 'lower price is better; higher rating is better; higher available quantity is better';
        const sys = `You rank ${kind} options for fulfilling a dropshipping order. Criteria: ${criteria}. ` +
            `Return STRICT JSON only, no prose: {"ranking":[{"id":"<id>","tag":"Best|Good|Average|Poor","reason":"<=12 words"}]} ` +
            `ordered best-to-worst and including every provided id EXACTLY once.`;
        const result = yield (0, monday_models_1.mondayModelsChat)(token, [
            { role: 'system', content: sys },
            { role: 'user', content: JSON.stringify({ items }) },
        ], { model: 'monday-fast', maxTokens: 800, temperature: 0, responseJson: true });
        if (!result.ok)
            return res.json({ ranking: null });
        let parsed = null;
        try {
            parsed = JSON.parse(result.content);
        }
        catch (_h) {
            return res.json({ ranking: null });
        }
        const ranking = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.ranking) ? parsed.ranking : null;
        if (!ranking)
            return res.json({ ranking: null });
        // Safety: every returned id must exist in the input, exactly once — else discard so the
        // client falls back to its own ordering (never trust a malformed AI reordering).
        const inputIds = items.map((i) => String(i.id));
        const returnedIds = ranking.map((r) => String(r === null || r === void 0 ? void 0 : r.id));
        const sameSet = returnedIds.length === inputIds.length
            && new Set(returnedIds).size === returnedIds.length
            && returnedIds.every((id) => inputIds.includes(id));
        if (!sameSet)
            return res.json({ ranking: null });
        const clean = ranking.map((r) => ({
            id: String(r.id),
            tag: ['Best', 'Good', 'Average', 'Poor'].includes(r === null || r === void 0 ? void 0 : r.tag) ? r.tag : 'Good',
            reason: String((r === null || r === void 0 ? void 0 : r.reason) || '').slice(0, 80),
        }));
        return res.json({ ranking: clean });
    }
    catch (err) {
        console.error('[ai/rank] error:', err === null || err === void 0 ? void 0 : err.message);
        return res.json({ ranking: null });
    }
}));
exports.default = router;
