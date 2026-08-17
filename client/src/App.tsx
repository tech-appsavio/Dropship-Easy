// client/src/App.tsx
import React, { useEffect, useState } from "react";
import "@vibe/core/tokens";
import "./shared/theme.css";
import { initMondayTheme } from "./shared/theme";
import MultiOrderProcessing from "./views/multi_order_processing/MultiOrderProcessing";
import OrderTracking from "./views/order_tracking/OrderTracking";
import AccountSettings from "./views/settings/AccountSettings";
import AiAssistant from "./views/ai_assistant/AiAssistant";

const App = () => {
    const [view, setView] = useState<string>("default");
    useEffect(() => {
        initMondayTheme(); // sync app colors with monday's light/dark/black theme
        const path = window.location.pathname;
        if (path.includes("multi_order_processing")) {
            setView("multi_order_processing");
        } else if (path.includes("order_tracking")) {
            setView("order_tracking");
        } else if (path.includes("settings")) {
            setView("settings");
        } else if (path.includes("ai_assistant") || path.includes("ai-assistant")) {
            setView("ai_assistant");
        } else {
            setView("default");
        }
    }, []);

    if (view === "multi_order_processing") return <MultiOrderProcessing />;
    if (view === "order_tracking") return <OrderTracking />;
    if (view === "settings") return <AccountSettings />;
    if (view === "ai_assistant") return <AiAssistant />;

    return (
        <div className="App" style={{ padding: "24px" }}>
            <h1>Custom monday App</h1>
            <p>Welcome to the custom app workspace.</p>
        </div>
    );
};

export default App;