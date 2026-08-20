import { GraphQLClient } from 'graphql-request';
import { getAccountConfig, resolveMondayToken } from './account-store';

const MONDAY_API = 'https://api.monday.com/v2';

export type ErrorStage =
    | 'Order Selection' | 'Supplier Selection' | 'Courier Selection'
    | 'Shipment Creation' | 'Manifest Generation' | 'WhatsApp' | 'Shopify Sync' | 'Settings';
export type ErrorSeverity = 'Info' | 'Warning' | 'Error' | 'Critical';

export interface ErrorLogInput {
    stage: ErrorStage;
    severity?: ErrorSeverity;
    message: string;               // user-friendly message
    technicalDetails?: string;     // API response / stack / exception
    suggestedSolution?: string;
    orderId?: string;              // human-readable order identifier (name / Shopify id)
    splitOrderId?: string;         // human-readable split-order identifier (name)
    orderItemId?: string;          // monday ITEM id of the order  → sets the "Orders" connect
    splitOrderItemId?: string;     // monday ITEM id of the split order → sets "Split Orders" connect
    supplier?: string;
    courier?: string;
    sku?: string;
    retry?: boolean;
}

// monday board_relation values need numeric item ids. Accept only a clean numeric id.
const asItemIds = (id?: string): number[] | null => {
    const s = String(id ?? '').trim();
    return /^\d+$/.test(s) ? [Number(s)] : null;
};

const clip = (s?: string, n = 2000) => (s ? String(s).slice(0, n) : undefined);

// Best-effort: writes one record to the account's "Error Logs" board. NEVER throws 
// logging must never break the flow that raised the original error. The record NAME is
// the Error ID (ERR-…). Column IDs are resolved from the provisioned account config.
export async function logAccountError(accountId: string | null | undefined, input: ErrorLogInput): Promise<void> {
    try {
        if (!accountId) return;
        const config = await getAccountConfig(String(accountId));
        const boardId = config?.boards?.errorLogs;
        const cols = config?.columns?.errorLogs || {};
        if (!boardId) return; // Error Logs board not provisioned (older account)  skip silently.

        const token = await resolveMondayToken(String(accountId));
        if (!token) return;

        const col = (title: string) => cols[title];
        const cv: Record<string, any> = {};
        const now = new Date();
        const iso = now.toISOString();

        if (col('Timestamp')) cv[col('Timestamp')] = { date: iso.slice(0, 10), time: iso.slice(11, 19) };
        if (col('Process Stage')) cv[col('Process Stage')] = { label: input.stage };
        if (col('Error Severity')) cv[col('Error Severity')] = { label: input.severity || 'Error' };
        if (input.orderId && col('Order ID')) cv[col('Order ID')] = input.orderId;
        if (input.splitOrderId && col('Split Order ID')) cv[col('Split Order ID')] = input.splitOrderId;
        // Connect the error to the actual Order / Split Order item (both on the Orders board)
        // when we have their monday item ids, so the record links straight to the order.
        const orderIds = asItemIds(input.orderItemId);
        if (orderIds && col('Orders')) cv[col('Orders')] = { item_ids: orderIds };
        const splitIds = asItemIds(input.splitOrderItemId);
        if (splitIds && col('Split Orders')) cv[col('Split Orders')] = { item_ids: splitIds };
        if (input.supplier && col('Supplier')) cv[col('Supplier')] = input.supplier;
        if (input.courier && col('Courier')) cv[col('Courier')] = input.courier;
        if (input.sku && col('SKU / Product')) cv[col('SKU / Product')] = input.sku;
        if (col('Error Message')) cv[col('Error Message')] = { text: clip(input.message) || '-' };
        if (input.technicalDetails && col('Technical Details')) cv[col('Technical Details')] = { text: clip(input.technicalDetails) };
        if (input.suggestedSolution && col('Suggested Solution')) cv[col('Suggested Solution')] = { text: clip(input.suggestedSolution) };
        if (col('Status')) cv[col('Status')] = { label: 'Open' };
        if (input.retry && col('Retry')) cv[col('Retry')] = { checked: 'true' };

        const errId = `ERR-${now.getTime().toString(36).toUpperCase()}`;
        const client = new GraphQLClient(MONDAY_API, { headers: { Authorization: token } });
        await client.request(
            `mutation ($boardId: ID!, $name: String!, $cv: JSON!) {
                create_item(board_id: $boardId, item_name: $name, column_values: $cv, create_labels_if_missing: true) { id }
            }`,
            { boardId, name: errId, cv: JSON.stringify(cv) },
        );
    } catch (err: any) {
        console.error('⚠️ Failed to write error-log record:', err?.message);
    }
}
