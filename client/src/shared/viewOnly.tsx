import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// Base64URL-decode a JWT payload without verifying the signature (we only need to READ the
// claims client-side; the server is what verifies). Returns the payload object or null.
function decodeJwtPayload(token: string): any {
    try {
        const part = token.split(".")[1];
        if (!part) return null;
        const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
        const json = decodeURIComponent(
            atob(b64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
}

// Reads a truthy view-only flag from wherever monday may place it (flat or nested under the
// `dat` claim, camelCase or snake_case).
function flagFrom(obj: any): boolean {
    if (!obj || typeof obj !== "object") return false;
    const d = obj.dat || obj;
    return !!(
        d.isViewOnly ?? d.is_view_only ?? d.isViewOnlyUser ??
        obj.isViewOnly ?? obj.is_view_only ?? obj.isViewOnlyUser
    );
}

// Determines whether the current user is view-only (a viewer / read-only guest), who cannot
// use the monday API. Per monday's guidance, `isViewOnly` is passed in the sessionToken so
// we decode the token AND read the context user object, treating the user as view-only if
// EITHER source says so (defense in depth). See:
// https://developer.monday.com/apps/docs/choosing-your-app-type#user-permissions
export function useViewOnly(): { loading: boolean; isViewOnly: boolean } {
    const [state, setState] = useState<{ loading: boolean; isViewOnly: boolean }>({ loading: true, isViewOnly: false });
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            monday.get("context").catch(() => null),
            monday.get("sessionToken").catch(() => null),
        ])
            .then(([ctxRes, tokRes]: any[]) => {
                if (cancelled) return;
                const fromContext = flagFrom(ctxRes?.data?.user);
                const payload = tokRes?.data ? decodeJwtPayload(tokRes.data) : null;
                const fromToken = flagFrom(payload);
                setState({ loading: false, isViewOnly: fromContext || fromToken });
            })
            .catch(() => { if (!cancelled) setState({ loading: false, isViewOnly: false }); });
        return () => { cancelled = true; };
    }, []);
    return state;
}

// Full-screen message shown to view-only users, who cannot perform the app's actions.
export const ViewOnlyMessage: React.FC = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, padding: 32, textAlign: "center", fontFamily: "Inter, Roboto, -apple-system, 'Segoe UI', sans-serif", color: "var(--ds-text-muted)" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--ds-neutral-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 14 }}>👁️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ds-text)", marginBottom: 4 }}>View-only access</div>
        <div style={{ fontSize: 13.5, maxWidth: 420, lineHeight: 1.5 }}>
            As a viewer, you are unable to use this app. Ask an account member or admin to run order processing.
        </div>
    </div>
);
