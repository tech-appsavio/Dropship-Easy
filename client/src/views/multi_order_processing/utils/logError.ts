import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

export type ErrorStage =
    | "Order Selection" | "Supplier Selection" | "Courier Selection"
    | "Shipment Creation" | "Manifest Generation" | "WhatsApp" | "Shopify Sync" | "Settings";

export interface LogErrorInput {
    stage: ErrorStage;
    message: string;
    severity?: "Info" | "Warning" | "Error" | "Critical";
    technicalDetails?: string;
    suggestedSolution?: string;
    orderId?: string;
    splitOrderId?: string;
    orderItemId?: string;       // monday item id of the order → links the "Orders" connect column
    splitOrderItemId?: string;  // monday item id of the split order → links "Split Orders"
    supplier?: string;
    courier?: string;
    sku?: string;
    retry?: boolean;
}

// Records an error to the account's Error Logs board via the backend (which resolves the
// board/column IDs and writes the record). Fire-and-forget and fully guarded — logging an
// error must never throw or block the flow that raised it.
export async function logError(input: LogErrorInput): Promise<void> {
    try {
        const tokenRes: any = await monday.get("sessionToken");
        const sessionToken = tokenRes?.data;
        await fetch("/api/error-log", {
            method: "POST",
            headers: sessionToken
                ? { Authorization: sessionToken, "Content-Type": "application/json" }
                : { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
    } catch {
        /* logging must never break the caller */
    }
}
