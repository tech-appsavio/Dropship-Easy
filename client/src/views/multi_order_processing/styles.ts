// Shared design tokens & style helpers
import React from "react";

export const COLOR = {
    primary:       "#0073ea",
    primaryHover:  "#0060c0",
    primaryLight:  "#e8f0fe",
    primaryMuted:  "#c5c7d4",
    success:       "#137333",
    successLight:  "#e6f4ea",
    danger:        "#c5221f",
    dangerLight:   "#fce8e6",
    warning:       "#b45309",
    warningLight:  "#fff8e1",
    text:          "#323338",
    textMuted:     "#676879",
    border:        "#d0d4e0",
    borderLight:   "#e6e8ef",
    bg:            "#f7f8fa",
    bgHeader:      "#f0f2f5",
    white:         "#ffffff",
};

export const btn = (variant: "primary" | "secondary" | "danger" | "ghost", disabled = false): React.CSSProperties => {
    const base: React.CSSProperties = {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "7px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease", border: "none", outline: "none",
        whiteSpace: "nowrap", lineHeight: "1.4",
    };
    if (disabled) return { ...base, background: COLOR.primaryMuted, color: "#fff", boxShadow: "none" };
    const map: Record<string, React.CSSProperties> = {
        primary:   { background: COLOR.primary,  color: "#fff", boxShadow: "0 1px 4px rgba(0,115,234,0.25)" },
        secondary: { background: COLOR.white,    color: COLOR.text, border: `1px solid ${COLOR.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
        danger:    { background: COLOR.dangerLight, color: COLOR.danger, border: `1px solid #f5b4b0` },
        ghost:     { background: "transparent",  color: COLOR.primary, textDecoration: "underline" },
    };
    return { ...base, ...map[variant] };
};

export const TH: React.CSSProperties = {
    padding: "9px 12px", textAlign: "center", fontSize: 11, fontWeight: 700,
    color: COLOR.textMuted, border: `1px solid #a8adc0`,
    whiteSpace: "nowrap", minWidth: 100, backgroundColor: COLOR.bgHeader,
    letterSpacing: "0.05em", textTransform: "uppercase",
};

export const TD: React.CSSProperties = {
    padding: "8px 12px", textAlign: "center",
    border: `1px solid #b8bccb`, fontSize: 12,
    whiteSpace: "nowrap", minWidth: 100, color: COLOR.text,
};

// Narrow checkbox column — use on th/td that contains only a checkbox
export const TH_CBX: React.CSSProperties = {
    ...TH, width: 36, minWidth: 36, padding: "9px 6px",
};

export const TD_CBX: React.CSSProperties = {
    ...TD, width: 36, minWidth: 36, padding: "8px 4px", verticalAlign: "middle",
};

export const card: React.CSSProperties = {
    background: COLOR.white, borderRadius: 10, border: `1px solid ${COLOR.borderLight}`,
    boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
};

export const filterBar: React.CSSProperties = {
    background: COLOR.bg, border: `1px solid ${COLOR.borderLight}`,
    borderRadius: 8, padding: "12px 14px", marginBottom: 14,
    display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap",
    position: "relative", zIndex: 10,
};

export const sectionTitle: React.CSSProperties = {
    margin: 0, fontSize: 16, fontWeight: 700, color: COLOR.text, letterSpacing: "-0.01em",
};

export const badge = (type: "success" | "warning" | "danger" | "neutral"): React.CSSProperties => {
    const map = {
        success: { background: COLOR.successLight, color: COLOR.success, border: "1px solid #a8d5b5" },
        warning: { background: COLOR.warningLight, color: COLOR.warning, border: "1px solid #f5d97a" },
        danger:  { background: COLOR.dangerLight,  color: COLOR.danger,  border: "1px solid #f5b4b0" },
        neutral: { background: COLOR.bgHeader,     color: COLOR.textMuted, border: `1px solid ${COLOR.border}` },
    };
    return { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, ...map[type] };
};

export const paginationBtn = (disabled: boolean): React.CSSProperties => ({
    padding: "4px 11px", borderRadius: 5, border: `1px solid ${COLOR.border}`,
    background: disabled ? COLOR.bg : COLOR.white,
    color: disabled ? "#bbb" : COLOR.text,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500,
});
