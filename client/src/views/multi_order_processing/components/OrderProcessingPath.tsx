// components/OrderProcessingPath.tsx
import React from "react";
import { Steps } from "@vibe/core";

const STAGES = [
    { key: "ORDERS", label: "Order Selection" },
    { key: "SUPPLIERS", label: "Supplier Selection" },
    { key: "COURIERS", label: "Courier Selection" },
    { key: "MANIFEST", label: "Manifest Generation" },
];

export const OrderProcessingPath: React.FC<{ activeView: string }> = ({ activeView }) => {
    const activeIndex = STAGES.findIndex((s) => s.key === activeView) ?? 0;

    return (
        <div style={{ marginBottom: "32px", borderBottom: "1px solid #e6e9ef", paddingBottom: "16px" }}>
            <h2 style={{ marginBottom: "16px" }}>Order Processing</h2>
            <Steps type={Steps.types.NUMBERS} activeStepIndex={activeIndex} areNavigationButtonsVisible={false}>
                {STAGES.map((stage) => (
                    <Steps.Step key={stage.key} title={stage.label} />
                ))}
            </Steps>
        </div>
    );
};
