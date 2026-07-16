// client/src/App.tsx
import React, { useEffect, useState } from "react";
import "@vibe/core/tokens";
import MultiOrderProcessing from "./views/multi_order_processing/MultiOrderProcessing";
import OrderTracking from "./views/order_tracking/OrderTracking";

const App = () => {
    const [view, setView] = useState<string>("default");
    useEffect(() => {
        const path = window.location.pathname;
        if (path.includes("multi_order_processing")) {
            setView("multi_order_processing");
        } else if (path.includes("order_tracking")) {
            setView("order_tracking");
        } else {
            setView("default");
        }
    }, []);

    if (view === "multi_order_processing") return <MultiOrderProcessing />;
    if (view === "order_tracking") return <OrderTracking />;

    return (
        <div className="App" style={{ padding: "24px" }}>
            <h1>Custom Monday App</h1>
            <p>Welcome to the custom app workspace.</p>
        </div>
    );
};

export default App;