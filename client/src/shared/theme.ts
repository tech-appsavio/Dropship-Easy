import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// monday reports its theme as "light" | "dark" | "black" (and occasionally "hacker_theme").
// We map anything non-light to our dark palette. The value is written to
// document.documentElement's data-theme attribute, which drives the CSS variables in
// theme.css. Applied on mount AND kept live via monday.listen so toggling the monday theme
// updates the app instantly.
function normalize(theme: unknown): "light" | "dark" | "black" {
    const t = String(theme || "").toLowerCase();
    if (t === "black") return "black";
    if (t.includes("dark") || t === "hacker_theme" || t === "night") return "dark";
    return "light";
}

const VIBE_CLASSES = ["light-app-theme", "dark-app-theme", "black-app-theme"];

function apply(theme: unknown) {
    try {
        const t = normalize(theme);
        // 1. Drive OUR CSS variables (theme.css) via data-theme on <html>.
        document.documentElement.setAttribute("data-theme", t);
        // 2. Drive the @vibe/core components (Dropdown, Button, menus, etc.) via the theme
        //    class @vibe reads.
        [document.documentElement, document.body].forEach((el) => {
            if (!el) return;
            el.classList.remove(...VIBE_CLASSES);
            el.classList.add(`${t}-app-theme`);
        });
    } catch { /* no DOM (SSR/tests) ignore */ }
}

let started = false;

// Initialize theme handling once for the whole app. Safe to call from multiple entry views.
export function initMondayTheme(): void {
    if (started) return;
    started = true;
    try {
        monday.get("context").then((res: any) => apply(res?.data?.theme)).catch(() => {});
        // Keep in sync when the user switches monday's theme while the app is open.
        monday.listen("context", (res: any) => apply(res?.data?.theme));
    } catch { /* SDK unavailable (local dev outside monday)stays on light */ }
}
