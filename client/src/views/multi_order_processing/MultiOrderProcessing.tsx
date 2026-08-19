import React, { useEffect, useRef, useState } from "react";
import mondaySdk from "monday-sdk-js";
import { OrderProcessingPath } from "./components/OrderProcessingPath";
import { OrderSelection } from "./components/OrderSelection";
import { SupplierSelection } from "./components/SupplierSelection";
import { CourierSelection } from "./components/CourierSelection";
import { OrderManifestGeneration } from "./components/OrderManifestGeneration";
import { SpinnerComponent } from "./components/SpinnerComponent";
import { initializeBoardIds, subscribeProvisionProgress, ProvisionProgress } from "./utils/initBoardIds";
import { initializeColumnIds } from "./utils/initColumnIds";
import { useViewOnly, ViewOnlyMessage } from "../../shared/viewOnly";
import { WelcomeScreen, useWelcomeGate } from "./components/WelcomeScreen";

type View = "ORDERS" | "SUPPLIERS" | "COURIERS" | "MANIFEST";
const FLOW: View[] = ["ORDERS", "SUPPLIERS", "COURIERS", "MANIFEST"];

const monday = mondaySdk();

export const MultiOrderProcessing: React.FC = () => {
    const [view, setView] = useState<View>("ORDERS");
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
    // Board IDs (boardIds.ts) and column IDs (columns.ts) are resolved at runtime — board IDs
    // first (from .env / provisioned account config), then column IDs by title against
    // those boards (see initBoardIds.ts / initColumnIds.ts). Nothing below renders
    // until both complete, so no component ever reads an unresolved (empty-string) ID.
    const [columnsReady, setColumnsReady] = useState(false);
    const [provision, setProvision] = useState<ProvisionProgress>({ active: false, message: "" });
    const { loading: viewerLoading, isViewOnly } = useViewOnly();
    // One-time onboarding gate (monday UI/UX guideline). Purely additive — the board/column
    // init below still runs on mount regardless, so dismissing the welcome reveals an
    // already-warmed-up wizard with no change to any existing behavior.
    const { seen: welcomeSeen, markSeen } = useWelcomeGate();

    useEffect(() => {
        const unsubscribe = subscribeProvisionProgress(setProvision);
        initializeBoardIds()
            .then(() => initializeColumnIds())
            .finally(() => setColumnsReady(true));
        return unsubscribe;
    }, []);

    // monday value-created event: fire once when the working board view actually renders for
    // an active (non-viewer) user, past the welcome + loading. "Rendering a view the user can
    // act in" is a value moment per monday's guidance; the per-action fires (supplier/courier/
    // manifest success) cover the rest.
    const valueFiredRef = useRef(false);
    useEffect(() => {
        if (!valueFiredRef.current && columnsReady && welcomeSeen === true && !viewerLoading && !isViewOnly) {
            valueFiredRef.current = true;
            try { monday.execute("valueCreatedForUser"); } catch { /* non-fatal */ }
        }
    }, [columnsReady, welcomeSeen, viewerLoading, isViewOnly]);

    // View-only users (viewers) can't perform order processing — show a clear message
    // instead of the interactive app (monday marketplace product requirement).
    if (!viewerLoading && isViewOnly) return <ViewOnlyMessage />;

    // First-run welcome page, shown before the wizard until dismissed. While the storage
    // check is still pending (welcomeSeen === null) we show the same spinner as the normal
    // load, so a first-time user never sees the wizard flash before the welcome. Returning
    // users resolve synchronously (localStorage fast-path), so they never hit this branch.
    if (!viewerLoading && welcomeSeen === null) {
        return (
            <div style={{ padding: "14px 38px", width: "100%", boxSizing: "border-box" }}>
                <SpinnerComponent />
            </div>
        );
    }
    if (!viewerLoading && welcomeSeen === false) {
        return <WelcomeScreen onGetStarted={markSeen} />;
    }

    const currentIndex = FLOW.indexOf(view);

    const goNext = () => {
        if (view === "MANIFEST") {
            setSelectedOrderIds(new Set());
            setView("ORDERS");
        } else {
            setView(FLOW[currentIndex + 1]);
        }
    };
    const goPrev = () => setView(FLOW[currentIndex - 1]);

    const isNextDisabled = view === "ORDERS" && selectedOrderIds.size === 0;

    if (!columnsReady) {
        return (
            <div style={{ padding: "14px 38px", width: "100%", boxSizing: "border-box" }}>
                <SpinnerComponent />
                {provision.active && (
                    <div style={{ textAlign: "center", marginTop: 18, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ds-text)" }}>
                            Setting up your boards…
                        </div>
                        <div style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 6 }}>
                            {provision.message || "Creating boards and columns"}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ds-text-faint)", marginTop: 10 }}>
                            This one-time setup takes a minute. Please keep this tab open.
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ padding: "14px 38px", width: "100%", boxSizing: "border-box", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <OrderProcessingPath activeView={view} />
            <div style={{ background: "var(--ds-surface)", borderRadius: 10, border: "1px solid var(--ds-border-light)", boxShadow: "0 1px 8px rgba(0,0,0,0.05)", padding: "20px 24px", minHeight: 400 }}>
                {view === "ORDERS"    && <OrderSelection selectedOrderIds={selectedOrderIds} onSelectionChange={setSelectedOrderIds} onNext={goNext} isNextDisabled={isNextDisabled} />}
                {view === "SUPPLIERS" && <SupplierSelection selectedOrderIds={Array.from(selectedOrderIds)} onPrev={goPrev} onNext={goNext} />}
                {view === "COURIERS"  && <CourierSelection selectedOrderIds={Array.from(selectedOrderIds)} onPrev={goPrev} onNext={goNext} />}
                {view === "MANIFEST"  && <OrderManifestGeneration selectedOrderIds={Array.from(selectedOrderIds)} onPrev={goPrev} onNext={goNext} />}
            </div>
        </div>
    );
};

export default MultiOrderProcessing;
