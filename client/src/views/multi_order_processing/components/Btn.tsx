import React, { useState } from "react";
import { Loader } from "@vibe/core";
import { btn, btnHover } from "../styles";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface BtnProps {
    variant?: Variant;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    loading?: boolean;
    style?: React.CSSProperties;
    title?: string;
    type?: "button" | "submit";
    children: React.ReactNode;
}

// Shared button primitive: consistent styling with real hover, loading, and disabled
// states (inline styles alone can't do hover). Drop-in for the screens' nav actions.
export const Btn: React.FC<BtnProps> = ({ variant = "primary", onClick, disabled, loading, style, title, type = "button", children }) => {
    const [hover, setHover] = useState(false);
    const [active, setActive] = useState(false);
    const isDisabled = !!disabled || !!loading;
    const v = variant as Variant;
    const base = btn(v, isDisabled);
    const hov = !isDisabled && hover ? btnHover(v) : {};
    const press = !isDisabled && active ? { transform: "translateY(1px)" } : {};
    return (
        <button
            type={type}
            title={title}
            onClick={onClick}
            disabled={isDisabled}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => { setHover(false); setActive(false); }}
            onMouseDown={() => setActive(true)}
            onMouseUp={() => setActive(false)}
            style={{ ...base, ...hov, ...press, ...style }}
        >
            {loading && <Loader size={15} />}
            {children}
        </button>
    );
};
