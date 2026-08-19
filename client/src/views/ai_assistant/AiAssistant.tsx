import React, { useEffect, useRef, useState } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// ── Minimal, SAFE markdown renderer ──────────────────────────────────────────
// Renders the assistant's markdown (headings, bold/italic, inline code, bullet lists,
// paragraphs) as React elements — NO dangerouslySetInnerHTML, so there is no HTML-injection
// surface. This is why the raw "**" / "##" no longer show up as literal characters.
function renderInline(text: string, kp: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter((p) => p !== "");
    parts.forEach((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) out.push(<strong key={`${kp}b${i}`}>{part.slice(2, -2)}</strong>);
        else if (/^\*[^*]+\*$/.test(part)) out.push(<em key={`${kp}i${i}`}>{part.slice(1, -1)}</em>);
        else if (/^`[^`]+`$/.test(part)) out.push(<code key={`${kp}c${i}`} style={{ background: "var(--ds-neutral-bg)", padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" }}>{part.slice(1, -1)}</code>);
        else out.push(part);
    });
    return out;
}

function renderMarkdown(md: string): React.ReactNode {
    const lines = md.replace(/\r/g, "").split("\n");
    const blocks: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let k = 0;
    const flush = () => {
        if (listItems.length) {
            blocks.push(<ul key={`ul${k++}`} style={{ margin: "6px 0", paddingLeft: 20 }}>{listItems}</ul>);
            listItems = [];
        }
    };
    for (const raw of lines) {
        const line = raw.replace(/\s+$/, "");
        if (!line.trim()) { flush(); continue; }
        const h = line.match(/^(#{1,4})\s+(.*)$/);
        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        if (h) {
            flush();
            const lvl = h[1].length;
            const size = lvl <= 1 ? 16 : lvl === 2 ? 15 : 14;
            blocks.push(<div key={`h${k++}`} style={{ fontSize: size, fontWeight: 700, margin: "10px 0 4px", color: "var(--ds-text)" }}>{renderInline(h[2], `h${k}`)}</div>);
        } else if (bullet) {
            listItems.push(<li key={`li${k++}`} style={{ margin: "2px 0" }}>{renderInline(bullet[1], `li${k}`)}</li>);
        } else {
            flush();
            blocks.push(<p key={`p${k++}`} style={{ margin: "6px 0" }}>{renderInline(line, `p${k}`)}</p>);
        }
    }
    flush();
    return <div>{blocks}</div>;
}

// Board-specific starter questions (5–6 each). Matched by board name, most specific first
// (e.g. "line item" and "supplier product" before "order"/"supplier"). Falls back to generic.
function pickSuggestions(boardName: string): string[] {
    const n = (boardName || "").toLowerCase();
    if (n.includes("line item")) return [
        "Summarize this board.",
        "How many line items are pending supplier selection?",
        "How many are ready for manifest generation?",
        "How many line items are shipped?",
        "Break down line items by status.",
        "What needs my attention?",
    ];
    if (n.includes("error")) return [
        "Summarize this board.",
        "Break down errors by severity.",
        "How many critical errors are there?",
        "Which process stage has the most errors?",
        "How many errors are still open?",
        "What needs my attention?",
    ];
    if (n.includes("supplier product")) return [
        "Summarize this board.",
        "How many supplier-product links are there?",
        "Break down the items by status.",
        "What needs my attention?",
        "Are there items missing a status?",
    ];
    if (n.includes("supplier manifest") || n.includes("manifest")) return [
        "Summarize this board.",
        "How many manifests are ready to send?",
        "How many have been emailed to suppliers?",
        "How many still need to be sent?",
        "Break down manifests by status.",
        "What needs my attention?",
    ];
    if (n.includes("supplier")) return [
        "Summarize this board.",
        "How many suppliers are Active?",
        "Which suppliers are Inactive or Defaulters?",
        "How many are still onboarding?",
        "Break down suppliers by status.",
        "What needs my attention?",
    ];
    if (n.includes("customer")) return [
        "Summarize this board.",
        "How many customers are Active?",
        "How many new customers are there?",
        "Break down customers by status.",
        "What needs my attention?",
    ];
    if (n.includes("shipment")) return [
        "Summarize this board.",
        "How many shipments are Active?",
        "How many are marked for cancellation?",
        "How many have been cancelled?",
        "Break down shipments by status.",
        "What needs my attention?",
    ];
    if (n.includes("product")) return [
        "Summarize this board.",
        "How many products are Available for Sale?",
        "How many are Onboarding or Discarded?",
        "Break down products by status.",
        "What needs my attention?",
    ];
    if (n.includes("order")) return [
        "Summarize this board.",
        "How many orders are Confirmed vs New?",
        "How many orders are pending processing?",
        "How many orders are cancelled?",
        "Break down orders by status.",
        "What needs my attention?",
    ];
    return [
        "Summarize this board.",
        "Break down the items by status.",
        "How many items are there?",
        "What needs my attention?",
    ];
}

// Board-header AI assistant. Answers questions about the CURRENT board using monday's Models
// API (via our backend). It sends a NON-PII summary (item counts + status breakdowns — never
// customer names/addresses) plus the board NAME so answers use the right terminology.
const AiAssistant: React.FC = () => {
    const [prompt, setPrompt] = useState("");
    const [answer, setAnswer] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [boardName, setBoardName] = useState("");
    const boardIdRef = useRef<string>("");

    useEffect(() => {
        const grab = async (res: any) => {
            const bId = String(res?.data?.boardId || res?.data?.boardIds?.[0] || "");
            boardIdRef.current = bId;
            if (!bId) return;
            try {
                const r: any = await monday.api(`query { boards(ids: [${bId}]) { name } }`);
                setBoardName(r?.data?.boards?.[0]?.name || "");
            } catch { /* board-specific chips just fall back to generic */ }
        };
        monday.listen("context", grab);
        monday.get("context").then(grab).catch(() => {});
    }, []);

    // Compact, PII-free board summary + the board name. Excludes item names (which can be
    // customer names on some boards).
    const buildContext = async (bId: string): Promise<{ context: string; boardName: string }> => {
        try {
            if (!bId) return { context: "", boardName: "" };
            const res: any = await monday.api(`query {
                boards(ids: [${bId}]) {
                    name
                    items_page(limit: 500) {
                        items { column_values { text column { title type } } }
                    }
                }
            }`);
            const board = res?.data?.boards?.[0];
            if (!board) return { context: "", boardName: "" };
            const items: any[] = board.items_page?.items || [];
            const statusCounts: Record<string, Record<string, number>> = {};
            for (const it of items) {
                for (const cv of it.column_values || []) {
                    if (cv?.column?.type === "status" || cv?.column?.type === "color") {
                        const title = cv.column.title || "Status";
                        const label = (cv.text || "(blank)").trim() || "(blank)";
                        statusCounts[title] = statusCounts[title] || {};
                        statusCounts[title][label] = (statusCounts[title][label] || 0) + 1;
                    }
                }
            }
            return {
                context: JSON.stringify({ board: board.name, totalItems: items.length, statusBreakdown: statusCounts }),
                boardName: board.name || "",
            };
        } catch {
            return { context: "", boardName: "" };
        }
    };

    const ask = async (q?: string) => {
        const question = (q ?? prompt).trim();
        if (!question || loading) return;
        if (q) setPrompt(q);
        setLoading(true);
        setAnswer("");
        try {
            const { context, boardName } = await buildContext(boardIdRef.current);
            const tokenRes: any = await monday.get("sessionToken");
            const sessionToken = tokenRes?.data;
            const resp = await fetch("/api/ai/assistant", {
                method: "POST",
                headers: sessionToken
                    ? { Authorization: sessionToken, "Content-Type": "application/json" }
                    : { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: question, context, boardName, boardId: boardIdRef.current }),
            });
            const data = await resp.json();
            setAnswer(data?.answer || "No response.");
        } catch {
            setAnswer("The assistant hit an error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Suggestions adapt to the current board (falls back to generic until the name loads).
    const suggestions = pickSuggestions(boardName);

    return (
        <div style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 16, color: "var(--ds-text)", background: "var(--ds-bg)", minHeight: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Dropship Easy AI Assistant</h3>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ds-text-faint)" }}>
                Ask about this board's items and statuses. Powered by monday AI — no data leaves your account.
            </p>

            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ask(); }}
                placeholder="Ask a question about this board…"
                rows={3}
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 13.5, color: "var(--ds-text)", background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: 8, outline: "none", resize: "vertical", fontFamily: "inherit" }}
            />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                {suggestions.map((s) => (
                    <button key={s} onClick={() => ask(s)}
                        style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 20, border: "1px solid var(--ds-border-light)", background: "var(--ds-surface)", color: "var(--ds-text-muted)", cursor: "pointer" }}>
                        {s}
                    </button>
                ))}
            </div>

            <button onClick={() => ask()} disabled={loading || !prompt.trim()}
                style={{ background: loading || !prompt.trim() ? "var(--ds-disabled-bg)" : "var(--ds-primary)", color: loading || !prompt.trim() ? "var(--ds-disabled-text)" : "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13.5, fontWeight: 600, cursor: loading || !prompt.trim() ? "default" : "pointer" }}>
                {loading ? "Thinking…" : "Ask"}
            </button>

            {answer && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--ds-surface)", border: "1px solid var(--ds-border-light)", borderRadius: 8, fontSize: 13.5, lineHeight: 1.55 }}>
                    {renderMarkdown(answer)}
                </div>
            )}
        </div>
    );
};

export default AiAssistant;
