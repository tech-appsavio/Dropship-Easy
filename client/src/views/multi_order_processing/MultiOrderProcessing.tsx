import React, { useState } from "react";
import { OrderProcessingPath } from "./components/OrderProcessingPath";
import { OrderSelection } from "./components/OrderSelection";
import { SupplierSelection } from "./components/SupplierSelection";
import { CourierSelection } from "./components/CourierSelection";
import { OrderManifestGeneration } from "./components/OrderManifestGeneration";

type View = "ORDERS" | "SUPPLIERS" | "COURIERS" | "MANIFEST";
const FLOW: View[] = ["ORDERS", "SUPPLIERS", "COURIERS", "MANIFEST"];

const NAV_CONFIG: Record<View, { prevLabel?: string; nextLabel: string }> = {
    ORDERS: { nextLabel: "Go to Supplier Selection" },
    SUPPLIERS: { prevLabel: "Back to Orders", nextLabel: "Go to Courier Selection" },
    COURIERS: { prevLabel: "Back to Suppliers", nextLabel: "Go to Manifest Generation" },
    MANIFEST: { prevLabel: "Back to Couriers", nextLabel: "Finish & Reset" },
};

export const MultiOrderProcessing: React.FC = () => {
    const [view, setView] = useState<View>("ORDERS");
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

    const currentIndex = FLOW.indexOf(view);
    const config = NAV_CONFIG[view];

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

    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: "auto" }}>
            {/* Constant header — always visible */}
            <OrderProcessingPath activeView={view} />

            {/* Active screen — no nav buttons inside */}
            <div style={{ minHeight: 400 }}>

                {view === "ORDERS" && <OrderSelection selectedOrderIds={selectedOrderIds} onSelectionChange={setSelectedOrderIds} onNext={goNext} isNextDisabled={isNextDisabled} />}
                {view === "SUPPLIERS" && <SupplierSelection selectedOrderIds={Array.from(selectedOrderIds)} onPrev={goPrev} onNext={goNext} />}
                {view === "COURIERS" && <CourierSelection selectedOrderIds={Array.from(selectedOrderIds)} onPrev={goPrev} onNext={goNext} />}
                {view === "MANIFEST" && <OrderManifestGeneration selectedOrderIds={Array.from(selectedOrderIds)} onPrev={goPrev} onNext={goNext} />}
            </div>

            {/* Nav handled inside each screen component */}
        </div>
    );
};

export default MultiOrderProcessing;
