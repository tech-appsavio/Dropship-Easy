import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

interface SetupStatus {
    oauthConnected: boolean;
    provisioned: boolean;
    missingSettings: string[];
}

// Fetches this account's setup status and returns the list of required things that are
// still missing (OAuth connection, provisioned boards, and per-account credentials). There
// is NO dev-credential fallback, so anything missing here must be filled in by the user.
function useMissingSetup(): { loading: boolean; missing: string[] } {
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res: any = await monday.get("sessionToken");
                const sessionToken = res?.data;
                const resp = await fetch("/api/settings/status", {
                    headers: sessionToken ? { Authorization: sessionToken } : {},
                });
                const s: SetupStatus = await resp.json();
                const list: string[] = [];
                if (!s.oauthConnected) list.push("Connect your monday account (authorize the app)");
                if (!s.provisioned) list.push("App boards are not set up yet");
                (s.missingSettings || []).forEach((m) => list.push(m));
                if (!cancelled) setMissing(list);
            } catch {
                /* status check is best-effort — don't block the screen if it fails */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return { loading, missing };
}

// A dismissible-free warning shown at the top of Order Selection when required setup values
// are missing, directing the user to the Settings tab to fill them in.
export const SetupIncompleteBanner: React.FC = () => {
    const { loading, missing } = useMissingSetup();
    if (loading || missing.length === 0) return null;

    return (
        <div
            role="alert"
            style={{
                background: "var(--ds-warning-light)", border: "1px solid var(--ds-warning-bd)", borderRadius: 10,
                padding: "14px 16px", margin: "0 0 16px", display: "flex", gap: 12, alignItems: "flex-start",
            }}
        >
            <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
            <div style={{ fontSize: 13.5, color: "var(--ds-warning)", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--ds-warning)" }}>
                    Setup incomplete — please add these values in the <span style={{ textDecoration: "underline" }}>Settings</span> tab before processing orders:
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {missing.map((m, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>{m}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default SetupIncompleteBanner;
