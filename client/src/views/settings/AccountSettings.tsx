import React, { useEffect, useRef, useState } from "react";
import mondaySdk from "monday-sdk-js";
import { useViewOnly, ViewOnlyMessage } from "../../shared/viewOnly";

const monday = mondaySdk();

// ── Theme ─────────────────────────────────────────────────────────────────────
// Theme-aware tokens (CSS variables from shared/theme.css) so Settings tracks monday's
// light / dark / black theme like the rest of the app.
const C = {
    primary: "var(--ds-primary)",
    primaryDark: "var(--ds-primary-hover)",
    green: "var(--ds-success)",
    amber: "var(--ds-warning)",
    text: "var(--ds-text)",
    muted: "var(--ds-text-muted)",
    faint: "var(--ds-text-faint)",
    border: "var(--ds-border-light)",
    inputBorder: "var(--ds-border)",
    bg: "var(--ds-bg)",
    surface: "var(--ds-surface)",
    danger: "var(--ds-danger)",
};
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

interface Settings {
    whatsappAccessToken?: string;
    whatsappPhoneId?: string;
    whatsappBusinessAccountId?: string;
    whatsappWebhookVerifyToken?: string;
    whatsappTemplateLanguage?: string;
    shiprocketEmail?: string;
    shiprocketPassword?: string;
    shiprocketApiToken?: string;
    shiprocketPickupLocation?: string;
    shopifyStoreDomain?: string;
}

interface FieldDef { key: keyof Settings; label: string; type?: string; placeholder?: string; disabled?: boolean; }

// The template language is fixed to English; the API ultimately uses the template's own
// registered language, so this is shown read-only and cannot be changed.
const FIXED_TEMPLATE_LANGUAGE = "en";

interface SetupStatus {
    accountId: string;
    oauthConnected: boolean;
    provisioned: boolean;
    boardCount: number;
    webhookUrl: string;
    cancelShipmentWebhookUrl: string;
}

const SECTIONS: { title: string; icon: string; hint?: string; fields: FieldDef[] }[] = [
    {
        title: "WhatsApp (Meta Cloud API)",
        icon: "💬",
        hint: "From your Meta WhatsApp Business app — used to send order confirmations.",
        fields: [
            { key: "whatsappAccessToken", label: "Access Token", type: "password" },
            { key: "whatsappPhoneId", label: "Phone Number ID" },
            { key: "whatsappBusinessAccountId", label: "Business Account ID (WABA)" },
            { key: "whatsappWebhookVerifyToken", label: "Webhook Verify Token" },
            { key: "whatsappTemplateLanguage", label: "Default Template Language", disabled: true },
        ],
    },
    {
        title: "Shiprocket",
        icon: "📦",
        hint: "Used to create shipments and assign couriers.",
        fields: [
            { key: "shiprocketEmail", label: "Email", type: "email" },
            { key: "shiprocketPassword", label: "Password", type: "password" },
            { key: "shiprocketApiToken", label: "API Token (optional)", type: "password" },
        ],
    },
];

// ── Reusable bits ─────────────────────────────────────────────────────────────
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(29,41,57,0.04)", padding: "18px 22px", marginBottom: 16, ...style }}>
        {children}
    </div>
);

const Field: React.FC<{ label: string; type?: string; value: string; placeholder?: string; disabled?: boolean; onChange: (v: string) => void }> = ({ label, type, value, placeholder, disabled, onChange }) => {
    const [focus, setFocus] = useState(false);
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: C.muted, marginBottom: 5 }}>{label}</label>
            <input
                type={type || "text"}
                value={value}
                placeholder={placeholder || ""}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
                style={{
                    width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 14,
                    color: disabled ? C.muted : C.text,
                    background: disabled ? C.bg : C.surface,
                    cursor: disabled ? "not-allowed" : "text",
                    border: `1px solid ${focus && !disabled ? C.primary : C.inputBorder}`, borderRadius: 8, outline: "none",
                    boxShadow: focus && !disabled ? `0 0 0 3px rgba(0,115,234,0.12)` : "none", transition: "border .15s, box-shadow .15s",
                }}
            />
        </div>
    );
};

const StatusRow: React.FC<{ state: "ok" | "warn" | "pending"; label: string; detail: string; action?: React.ReactNode }> = ({ state, label, detail, action }) => {
    const dot = state === "ok" ? C.green : state === "pending" ? C.primary : C.amber;
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.border}` }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: dot, flex: "0 0 auto", boxShadow: `0 0 0 3px rgba(127,127,127,0.15)` }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text, width: 140, flex: "0 0 auto" }}>{label}</span>
            <span style={{ fontSize: 13, color: state === "ok" ? C.muted : C.text, flex: 1, lineHeight: 1.4 }}>{detail}</span>
            {action}
        </div>
    );
};

const AccountSettings: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({});
    const [token, setToken] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [copiedId, setCopiedId] = useState<string>("");
    const [regenerating, setRegenerating] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [showShiprocketHelp, setShowShiprocketHelp] = useState(false);
    const pollTimer = useRef<any>(null);
    const { loading: viewerLoading, isViewOnly } = useViewOnly();

    const fetchStatus = async (sessionToken: string): Promise<SetupStatus | null> => {
        try {
            const resp = await fetch("/api/settings/status", { headers: { Authorization: sessionToken } });
            const json = await resp.json();
            if (json?.accountId) { setStatus(json); return json as SetupStatus; }
        } catch { /* non-fatal */ }
        return null;
    };

    useEffect(() => {
        (async () => {
            try {
                const res: any = await monday.get("sessionToken");
                const sessionToken = res?.data;
                setToken(sessionToken);
                const resp = await fetch("/api/settings", { headers: { Authorization: sessionToken } });
                const json = await resp.json();
                // Template language is fixed to "en" (read-only field), so always force it —
                // this makes the disabled input show "en" and saves "en" regardless of any
                // previously-stored value.
                setSettings({ ...(json?.settings || {}), whatsappTemplateLanguage: FIXED_TEMPLATE_LANGUAGE });
                await fetchStatus(sessionToken);
            } catch (err: any) {
                setMessage({ text: "Could not load settings: " + err.message, ok: false });
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Re-check status whenever the user returns to this tab (e.g. after finishing OAuth
    // in the popup) so the "Connected" state appears without a manual page refresh.
    useEffect(() => {
        const onFocus = () => { if (token) fetchStatus(token); };
        // The OAuth success popup posts this message right before it closes.
        const onMessage = (e: MessageEvent) => {
            if (e.data?.type === "oauth-connected" && token) fetchStatus(token);
        };
        window.addEventListener("focus", onFocus);
        window.addEventListener("message", onMessage);
        return () => {
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("message", onMessage);
            if (pollTimer.current) clearInterval(pollTimer.current);
        };
    }, [token]);

    const onConnect = () => {
        window.open("/oauth/authorize", "_blank", "width=640,height=760");
        // Poll until the token is stored (the popup lives on a different origin, so we
        // can't read its result directly — we just watch our own status flip to connected).
        setConnecting(true);
        let tries = 0;
        if (pollTimer.current) clearInterval(pollTimer.current);
        pollTimer.current = setInterval(async () => {
            tries += 1;
            const s = await fetchStatus(token);
            if (s?.oauthConnected || tries >= 40) {
                clearInterval(pollTimer.current);
                pollTimer.current = null;
                setConnecting(false);
            }
        }, 3000);
    };

    const onChange = (key: keyof Settings, value: string) =>
        setSettings((prev) => ({ ...prev, [key]: value }));

    const copy = async (text: string, id: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(""), 2000);
        } catch { /* clipboard blocked — user can select manually */ }
    };

    const urlRow = (url: string, id: string) => (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
                type="text"
                readOnly
                value={url}
                title={url}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "9px 11px", border: `1px solid ${C.inputBorder}`, borderRadius: 8, fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", background: C.bg, color: C.text, textOverflow: "ellipsis" }}
            />
            <button
                onClick={() => copy(url, id)}
                style={{ background: copiedId === id ? C.green : C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", flex: "0 0 auto", minWidth: 78 }}
            >
                {copiedId === id ? "Copied!" : "Copy"}
            </button>
        </div>
    );

    const onRegenerate = async () => {
        if (!window.confirm("Generate new webhook URLs? The current URLs will stop working until you update them in Shopify and your board automation.")) return;
        setRegenerating(true);
        try {
            await fetch("/api/settings/webhook-url/regenerate", { method: "POST", headers: { Authorization: token } });
            await fetchStatus(token); // refresh both URLs (they share the same token)
        } catch { /* non-fatal */ } finally {
            setRegenerating(false);
        }
    };

    const onSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const resp = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: token },
                body: JSON.stringify({ settings }),
            });
            const json = await resp.json();
            if (json?.success) {
                setMessage({ text: "Settings saved.", ok: true });
                setTimeout(() => setMessage(null), 3000);
            } else throw new Error(json?.error || "Save failed");
        } catch (err: any) {
            setMessage({ text: "Save failed: " + err.message, ok: false });
        } finally {
            setSaving(false);
        }
    };

    if (!viewerLoading && isViewOnly) {
        return <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT }}><ViewOnlyMessage /></div>;
    }

    if (loading) {
        return <div style={{ padding: 40, fontFamily: FONT, color: C.muted, background: C.bg, minHeight: "100vh" }}>Loading settings…</div>;
    }

    const allGreen = !!status?.oauthConnected && !!status?.provisioned;

    return (
        <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT, padding: "28px 20px" }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
                {/* Header */}
                <div style={{ marginBottom: 22 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px", color: C.text }}>Account Settings</h1>
                    <p style={{ color: C.muted, margin: 0, fontSize: 14 }}>
                        Connect your account and enter your service credentials once. Everything is stored securely for your account only.
                    </p>
                </div>

                {/* Setup Status */}
                {status && (
                    <Card style={{ borderTop: `3px solid ${allGreen ? C.green : C.amber}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: C.text }}>Setup Status</h2>
                            <span style={{ fontSize: 12, fontWeight: 600, color: allGreen ? C.green : C.amber }}>
                                {allGreen ? "Ready" : "Action needed"}
                            </span>
                        </div>
                        <p style={{ color: C.faint, fontSize: 12, margin: "0 0 4px" }}>
                            Connect your account to start receiving Shopify orders into your boards.
                        </p>
                        {allGreen ? (
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0 2px", borderTop: `1px solid ${C.border}` }}>
                                <span style={{ width: 10, height: 10, marginTop: 4, borderRadius: "50%", background: C.green, flex: "0 0 auto", boxShadow: `0 0 0 3px rgba(127,127,127,0.15)` }} />
                                <span style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>
                                    Setup completed successfully. All required boards and columns have been created.
                                    You can verify them in your monday.com workspace.
                                </span>
                            </div>
                        ) : (
                            <StatusRow
                                state={status.oauthConnected ? "ok" : connecting ? "pending" : "warn"}
                                label="Connection"
                                detail={
                                    status.oauthConnected
                                        ? "Connected — order webhooks can write to your boards."
                                        : connecting
                                            ? "Waiting for you to approve in the popup…"
                                            : "Not connected — required for Shopify / WhatsApp / Shiprocket webhooks."
                                }
                                action={!status.oauthConnected && (
                                    <button
                                        onClick={onConnect}
                                        disabled={connecting}
                                        style={{ background: connecting ? C.faint : C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: connecting ? "default" : "pointer", flex: "0 0 auto" }}
                                    >
                                        {connecting ? "Connecting…" : "Connect"}
                                    </button>
                                )}
                            />
                        )}
                    </Card>
                )}

                {/* Webhooks */}
                {status && (
                    <Card>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 3px", color: C.text }}>🔗 Webhook URLs</h2>
                        <p style={{ color: C.faint, fontSize: 12, margin: "0 0 16px", lineHeight: 1.5 }}>
                            These URLs are unique to your account — events sent to them always route to <i>your</i> boards. No account ID is exposed, so they're safe to keep private.
                        </p>

                        <div style={{ marginBottom: 16 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 3px" }}>Shopify — Order creation</p>
                            <p style={{ color: C.faint, fontSize: 12, margin: "0 0 8px" }}>
                                Shopify → <b>Settings → Notifications → Webhooks</b> → <b>Order creation</b> (format JSON).
                            </p>
                            {urlRow(status.webhookUrl, "shopify")}
                        </div>

                        <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 3px" }}>Shipments — Cancel automation</p>
                            <p style={{ color: C.faint, fontSize: 12, margin: "0 0 8px" }}>
                                Shipments board → <b>Integrate → Webhooks</b> → when <b>Cancel Shipment</b> changes, send a webhook to this URL.
                            </p>
                            {urlRow(status.cancelShipmentWebhookUrl, "cancel")}
                        </div>

                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
                            <button
                                onClick={onRegenerate}
                                disabled={regenerating}
                                style={{ background: "none", color: C.muted, border: "none", padding: 0, fontSize: 12, textDecoration: "underline", cursor: regenerating ? "default" : "pointer" }}
                            >
                                {regenerating ? "Regenerating…" : "Regenerate URLs"}
                            </button>
                            <span style={{ color: C.faint, fontSize: 12, marginLeft: 8 }}>only if a URL leaked — you'll then need to update both in Shopify and your board automation</span>
                        </div>
                    </Card>
                )}

                {/* Credential sections */}
                {SECTIONS.map((section) => (
                    <Card key={section.title}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 2px", color: C.text }}>
                            <span style={{ marginRight: 8 }}>{section.icon}</span>{section.title}
                        </h2>
                        {section.hint && <p style={{ color: C.faint, fontSize: 12, margin: "0 0 14px" }}>{section.hint}</p>}
                        {section.title === "Shiprocket" && (
                            <div style={{ background: "var(--ds-warning-light)", border: `1px solid var(--ds-warning-bd)`, borderRadius: 8, padding: "10px 12px", margin: "0 0 14px", fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
                                ⚠️ These are your Shiprocket <b>API User</b> credentials — <b>not</b> your main Shiprocket account login. Create an API user in Shiprocket and paste its email &amp; password below.
                                <div style={{ marginTop: 8 }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowShiprocketHelp(true)}
                                        style={{ background: "none", border: "none", padding: 0, color: C.primary, fontSize: 12.5, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}
                                    >
                                        How to create a Shiprocket API user →
                                    </button>
                                </div>
                            </div>
                        )}
                        {section.fields.map((f) => (
                            <Field
                                key={f.key}
                                label={f.label}
                                type={f.type}
                                value={settings[f.key] || ""}
                                placeholder={f.placeholder}
                                disabled={f.disabled}
                                onChange={(v) => onChange(f.key, v)}
                            />
                        ))}
                    </Card>
                ))}

                {/* Save bar */}
                <div style={{ position: "sticky", bottom: 0, background: C.bg, padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 14 }}>
                    <button
                        onClick={onSave}
                        disabled={saving}
                        style={{ background: saving ? C.faint : C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "11px 26px", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", boxShadow: "0 1px 4px rgba(0,115,234,0.25)" }}
                    >
                        {saving ? "Saving…" : "Save Settings"}
                    </button>
                    {message && (
                        <span style={{ fontSize: 13, fontWeight: 500, color: message.ok ? C.green : C.danger }}>{message.text}</span>
                    )}
                </div>
            </div>

            {/* How-to popup: creating a Shiprocket API user */}
            {showShiprocketHelp && (
                <div
                    onClick={() => setShowShiprocketHelp(false)}
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483000, padding: 16 }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: C.surface, color: C.text, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 8px 40px rgba(0,0,0,0.25)", width: "100%", maxWidth: 520, padding: "22px 24px", maxHeight: "85vh", overflowY: "auto" }}
                    >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>📦 Create a Shiprocket API user</h2>
                            <button
                                type="button"
                                onClick={() => setShowShiprocketHelp(false)}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: C.muted }}
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: C.muted, lineHeight: 1.55 }}>
                            The app uses a dedicated Shiprocket <b>API user</b> (not your main account login) to create
                            shipments and assign couriers. Create one in Shiprocket, then paste its credentials into the
                            Email &amp; Password fields.
                        </p>
                        <ol style={{ margin: "0 0 14px", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>
                            <li>Log in to your <b>Shiprocket</b> dashboard.</li>
                            <li>Go to <b>Settings → API</b> (Configuration → API).</li>
                            <li>Open <b>API Users</b> and click <b>+ Add New API User</b>.</li>
                            <li>Enter an email that is <b>different from your registered login email</b>, then click <b>Create User</b>. Shiprocket generates a password.</li>
                            <li>Copy that API user's <b>email and password</b> and paste them into the fields here.</li>
                        </ol>
                        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                            Tip: keep these API-user credentials safe — they let the app act on your Shiprocket account.
                            If you set an “API Token”, you can paste that instead of the email/password.
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                            <button
                                type="button"
                                onClick={() => setShowShiprocketHelp(false)}
                                style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountSettings;
