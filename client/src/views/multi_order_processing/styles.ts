// Shared design tokens & style helpers (aligned with monday Vibe)
import React from "react";

// All colors reference CSS variables (defined in shared/theme.css) so the whole app tracks
// monday's light / dark / black theme at runtime. Note `white` is the app SURFACE color
// (cards/inputs), not literal white — it flips to a dark surface in dark mode.
export const COLOR = {
    primary:       "var(--ds-primary)",
    primaryHover:  "var(--ds-primary-hover)",
    primaryLight:  "var(--ds-primary-light)",
    primaryMuted:  "var(--ds-primary-muted)",
    success:       "var(--ds-success)",
    successLight:  "var(--ds-success-light)",
    danger:        "var(--ds-danger)",
    dangerLight:   "var(--ds-danger-light)",
    warning:       "var(--ds-warning)",
    warningLight:  "var(--ds-warning-light)",
    text:          "var(--ds-text)",
    textMuted:     "var(--ds-text-muted)",
    textFaint:     "var(--ds-text-faint)",
    border:        "var(--ds-border)",
    borderLight:   "var(--ds-border-light)",
    bg:            "var(--ds-bg)",
    bgHeader:      "var(--ds-bg-header)",
    white:         "var(--ds-surface)",
};

// Elevation / shape scale — use for consistent radius & shadow across screens.
export const RADIUS = { sm: 6, md: 8, lg: 12 };
export const SHADOW = {
    sm: "0 1px 3px rgba(29,41,57,0.06)",
    md: "0 2px 8px rgba(29,41,57,0.08)",
    focus: "0 0 0 3px rgba(0,115,234,0.16)",
};

export const btn = (variant: "primary" | "secondary" | "danger" | "ghost", disabled = false): React.CSSProperties => {
    const base: React.CSSProperties = {
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        padding: "9px 18px", borderRadius: RADIUS.md, fontSize: 13.5, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .15s ease, box-shadow .15s ease, border-color .15s ease, transform .05s ease",
        border: "1px solid transparent", outline: "none",
        whiteSpace: "nowrap", lineHeight: "1.4",
    };
    if (disabled) return { ...base, background: "var(--ds-disabled-bg)", color: "var(--ds-disabled-text)", boxShadow: "none", borderColor: "var(--ds-disabled-bg)" };
    const map: Record<string, React.CSSProperties> = {
        primary:   { background: COLOR.primary,     color: "#fff",         boxShadow: "0 1px 4px rgba(0,115,234,0.28)" },
        secondary: { background: COLOR.white,       color: COLOR.text,     borderColor: COLOR.border, boxShadow: SHADOW.sm },
        danger:    { background: COLOR.dangerLight,  color: COLOR.danger,   borderColor: "var(--ds-danger-bd)" },
        ghost:     { background: "transparent",     color: COLOR.primary },
    };
    return { ...base, ...map[variant] };
};

// Hover style delta per variant — used by the <Btn> component for hover states.
export const btnHover = (variant: "primary" | "secondary" | "danger" | "ghost"): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
        primary:   { background: COLOR.primaryHover, boxShadow: "0 2px 8px rgba(0,115,234,0.34)" },
        secondary: { background: COLOR.primaryLight, borderColor: COLOR.primary, color: COLOR.primary },
        danger:    { background: COLOR.dangerLight },
        ghost:     { background: COLOR.primaryLight },
    };
    return map[variant];
};

// Gridline colour — visible enough to read rows/columns at a glance, still clean.
const GRID = "var(--ds-grid)";

export const TH: React.CSSProperties = {
    padding: "11px 12px", textAlign: "center", fontSize: 11, fontWeight: 700,
    color: COLOR.textMuted, borderBottom: `1px solid ${COLOR.border}`,
    borderRight: `1px solid ${GRID}`,
    whiteSpace: "nowrap", minWidth: 100, backgroundColor: COLOR.bgHeader,
    letterSpacing: "0.04em", textTransform: "uppercase", position: "sticky", top: 0, zIndex: 2,
};

export const TD: React.CSSProperties = {
    padding: "10px 12px", textAlign: "center",
    borderBottom: `1px solid ${GRID}`,
    borderRight: `1px solid ${GRID}`, fontSize: 12.5,
    whiteSpace: "nowrap", minWidth: 100, color: COLOR.text,
};

// Narrow checkbox column — use on th/td that contains only a checkbox
export const TH_CBX: React.CSSProperties = {
    ...TH, width: 36, minWidth: 36, padding: "11px 6px",
};

export const TD_CBX: React.CSSProperties = {
    ...TD, width: 36, minWidth: 36, padding: "8px 4px", verticalAlign: "middle",
};

export const card: React.CSSProperties = {
    background: COLOR.white, borderRadius: RADIUS.lg, border: `1px solid ${COLOR.borderLight}`,
    boxShadow: SHADOW.sm,
};

export const filterBar: React.CSSProperties = {
    background: COLOR.bg, border: `1px solid ${COLOR.borderLight}`,
    borderRadius: RADIUS.md, padding: "12px 14px", marginBottom: 14,
    display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap",
    position: "relative", zIndex: 10,
};

export const sectionTitle: React.CSSProperties = {
    margin: 0, fontSize: 16, fontWeight: 700, color: COLOR.text, letterSpacing: "-0.01em",
};

export const badge = (type: "success" | "warning" | "danger" | "neutral" | "info"): React.CSSProperties => {
    const map = {
        success: { background: COLOR.successLight, color: COLOR.success,   border: "1px solid var(--ds-success-bd)" },
        warning: { background: COLOR.warningLight, color: COLOR.warning,   border: "1px solid var(--ds-warning-bd)" },
        danger:  { background: COLOR.dangerLight,  color: COLOR.danger,    border: "1px solid var(--ds-danger-bd)" },
        info:    { background: COLOR.primaryLight, color: COLOR.primary,   border: "1px solid var(--ds-info-bd)" },
        neutral: { background: "var(--ds-neutral-bg)", color: COLOR.textMuted, border: `1px solid ${COLOR.borderLight}` },
    };
    return { display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, lineHeight: 1.5, ...map[type] };
};

export const paginationBtn = (disabled: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: RADIUS.sm, border: `1px solid ${COLOR.border}`,
    background: disabled ? COLOR.bg : COLOR.white,
    color: disabled ? COLOR.textFaint : COLOR.text,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600,
    transition: "background .15s, border-color .15s",
});
