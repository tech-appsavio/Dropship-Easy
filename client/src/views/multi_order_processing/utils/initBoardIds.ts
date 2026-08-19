// src/views/multi_order_processing/utils/initBoardIds.ts
//
// Loads this account's already-provisioned board IDs and writes them into boardIds.ts's
// `let`-exported constants. Must run BEFORE initColumnIds.ts (column-ID resolution needs
// the real board IDs) — see the sequencing in MultiOrderProcessing.tsx.
//
// IMPORTANT: this view is a pure CONSUMER of the configuration. The workspace setup
// (creating boards/columns/connect/mirror) happens during app INSTALL, server-side, in
// the OAuth callback (see src/controllers/oauth-controller.ts). This module never creates
// anything itself — at most it asks the backend to *finish* setup (POST /api/provision/
// ensure) if the account isn't ready yet, and the backend does all the work.
import mondaySdk from "monday-sdk-js";
import { setBoardIds } from "../boardIds";

const monday = mondaySdk();

let initialized: Promise<void> | null = null;

// ── Provisioning progress (for the "Setting up your boards…" UI) ──────────────
export interface ProvisionProgress { active: boolean; message: string; }
type ProgressListener = (state: ProvisionProgress) => void;
const progressListeners = new Set<ProgressListener>();
let progressState: ProvisionProgress = { active: false, message: "" };

// Subscribe to provisioning progress. Immediately called with the current state and
// returns an unsubscribe fn. The UI uses this to show live setup status on first open.
export function subscribeProvisionProgress(cb: ProgressListener): () => void {
    progressListeners.add(cb);
    cb(progressState);
    return () => progressListeners.delete(cb);
}
function emitProgress(active: boolean, message: string): void {
    progressState = { active, message };
    progressListeners.forEach((l) => l(progressState));
}

// True if the boards map carries at least one real board ID.
function hasAnyBoard(boards: Record<string, string | undefined>): boolean {
    return Object.values(boards || {}).some((v) => !!v);
}

export function initializeBoardIds(): Promise<void> {
    if (initialized) return initialized;

    initialized = (async () => {
        try {
            const tokenRes: any = await monday.get("sessionToken");
            const sessionToken = tokenRes?.data;
            const authHeaders: Record<string, string> = sessionToken
                ? { Authorization: sessionToken, "Content-Type": "application/json" }
                : { "Content-Type": "application/json" };

            // Read this account's provisioned config (created during install).
            const statusResp = await fetch("/api/provision/status", { headers: authHeaders });
            const status = await statusResp.json();
            const boards = status?.boards || {};

            // Normal case: setup already done at install (or legacy env boards) → just consume it.
            if ((status?.provisioned || status?.legacy) && hasAnyBoard(boards)) {
                setBoardIds(boards);
                return;
            }

            // Not ready yet — either install-time setup is still running, or this is a
            // test/share-link install where OAuth didn't run. Ask the BACKEND to finish
            // the setup (server-side, idempotent, coalesces with any install-time run).
            // The view never creates anything itself.
            emitProgress(true, "Setting up your workspace…");
            try {
                const ensureResp = await fetch("/api/provision/ensure", { method: "POST", headers: authHeaders });
                const ensure = await ensureResp.json().catch(() => ({}));
                if (ensureResp.ok && hasAnyBoard(ensure?.boards || {})) {
                    setBoardIds(ensure.boards);
                } else {
                    console.warn("[initBoardIds] Setup did not return boards:", ensure);
                }
            } finally {
                emitProgress(false, "");
            }
        } catch (err) {
            console.warn("[initBoardIds] Failed to load board IDs:", err);
        }
    })();

    return initialized;
}
