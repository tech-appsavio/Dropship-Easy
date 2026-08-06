// src/utils/suppressMondayApiWarning.ts
//
// monday-sdk-js's monday.api() unconditionally logs a "[DEPRECATION WARNING]"
// console.warn on every single call, with no option to disable it (see
// node_modules/monday-sdk-js/src/client.js). We call monday.api() throughout this
// app (hooks, wizard screens, file uploads) — migrating everything to
// @mondaydotcomorg/api would be a large, riskier refactor (that client needs an
// explicit token instead of the SDK's automatic parent-frame bridge, and its
// in-browser file-upload behavior for our manifest/label PDF attachments is
// unverified). Filtering this ONE known-noisy message is a deliberate, contained
// trade-off — call once at app startup. Every other console.warn still prints.
const DEPRECATION_MARKER = "[DEPRECATION WARNING] monday.api()";

export function suppressMondayApiDeprecationWarning(): void {
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
        if (typeof args[0] === "string" && args[0].includes(DEPRECATION_MARKER)) return;
        originalWarn.apply(console, args);
    };
}
