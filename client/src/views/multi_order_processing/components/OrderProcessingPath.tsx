import React from "react";

const STAGES = [
    { key: "ORDERS", label: "Order Selection" },
    { key: "SUPPLIERS", label: "Supplier Selection" },
    { key: "COURIERS", label: "Courier Selection" },
    { key: "MANIFEST", label: "Manifest Generation" },
];

export const OrderProcessingPath: React.FC<{ activeView: string }> = ({ activeView }) => {
    const activeIndex = STAGES.findIndex((s) => s.key === activeView);

    return (
        <div>
            <h2 style={{ margin: "0 0 12px 0", fontSize: 20, fontWeight: 600 }}>Bulk Order Processing</h2>
            <div style={{ display: "flex", height: 38, marginBottom: 24 }}>
                {STAGES.map((stage, i) => {
                    const done = i < activeIndex;
                    const active = i === activeIndex;
                    const bg = done ? "#0073ea" : active ? "#1f76c2" : "#e6e9ef";
                    const color = done || active ? "#fff" : "#676879";
                    const isFirst = i === 0;
                    const isLast = i === STAGES.length - 1;

                    // Chevron clip-path: skip left notch on first, skip right arrow on last
                    const clipPath = isFirst
                        ? isLast
                            ? "none"
                            : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
                        : isLast
                          ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)"
                          : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)";

                    return (
                        <div
                            key={stage.key}
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: bg,
                                clipPath,
                                marginLeft: i === 0 ? 0 : -1, // overlap edges
                                paddingLeft: i === 0 ? 12 : 20,
                                paddingRight: isLast ? 12 : 20,
                                fontSize: 13,
                                fontWeight: active ? 700 : 500,
                                color,
                                whiteSpace: "nowrap",
                                transition: "background-color 0.2s",
                            }}
                        >
                            <span style={{ marginRight: 6, opacity: 0.8 }}>{i + 1}.</span>
                            {stage.label}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
