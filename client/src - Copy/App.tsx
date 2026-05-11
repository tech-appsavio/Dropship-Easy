// client/src/App.tsx
import React, { useEffect, useState } from "react";
import "@vibe/core/tokens";
import MultiOrderProcessing from "./views/multi_order_processing/MultiOrderProcessing";

const App = () => {
    const [view, setView] = useState<string>("default");
    console.log("App.tsx, app => ", view);
    useEffect(() => {
        // Detect current route/path in the URL to decide which UI to display
        const path = window.location.pathname;
        if (path.includes("multi_order_processing")) {
            setView("multi_order_processing");
        } else {
            // Optional: You can route single order tracking here
            setView("default");
        }
    }, []);

    if (view === "multi_order_processing") {
        console.log("View multi order processing ");
        return <MultiOrderProcessing />;
    }

    // Default Quickstart UI
    return (
        <div className="App" style={{ padding: "24px" }}>
            <h1>Custom Monday App</h1>
            <p>Welcome to the custom app workspace.</p>
        </div>
    );
};

export default App;