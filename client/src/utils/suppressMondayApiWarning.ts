//The monday.api() method logs a deprecation warning on every call. 
// Migrating to @mondaydotcomorg/api would require a risky refactor and may affect file uploads. 
// We therefore suppress only this known warning once at app startup; all other warnings remain visible.
const DEPRECATION_MARKER = "[DEPRECATION WARNING] monday.api()";

export function suppressMondayApiDeprecationWarning(): void {
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
        if (typeof args[0] === "string" && args[0].includes(DEPRECATION_MARKER)) return;
        originalWarn.apply(console, args);
    };
}
