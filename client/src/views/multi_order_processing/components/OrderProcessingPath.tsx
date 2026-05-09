import React from "react";
import { Steps } from "@vibe/core";

const STAGES = [
    "Order Selection",
    "Supplier Selection",
    "Courier Selection",
    "Manifest Generation"
];

export const OrderProcessingPath: React.FC<{ activeView: string }> = ({ activeView }) => {
    // Map your view state to the index of the path
    const viewToIndex: Record<string, number> = {
        ORDERS: 0,
        SUPPLIERS: 1,
        COURIERS: 2,
        MANIFEST: 3
    };

    return (
        <div style={{ marginBottom: "32px", borderBottom: "1px solid #e6e9ef", paddingBottom: "16px" }}>
            <h2 style={{ marginBottom: "16px" }}>Order Processing</h2>
            <Steps
                type={Steps.types.NUMBERS}
                activeStepIndex={viewToIndex[activeView] || 0}
                steps={STAGES.map((stage) => ({ title: stage }))}
                areNavigationButtonsVisible={false} // Disable jumping to stages directly
            />
        </div>
    );
};