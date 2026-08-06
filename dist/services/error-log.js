"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAccountError = void 0;
const graphql_request_1 = require("graphql-request");
const account_store_1 = require("./account-store");
const MONDAY_API = 'https://api.monday.com/v2';
// monday board_relation values need numeric item ids. Accept only a clean numeric id.
const asItemIds = (id) => {
    const s = String(id !== null && id !== void 0 ? id : '').trim();
    return /^\d+$/.test(s) ? [Number(s)] : null;
};
const clip = (s, n = 2000) => (s ? String(s).slice(0, n) : undefined);
// Best-effort: writes one record to the account's "Error Logs" board. NEVER throws —
// logging must never break the flow that raised the original error. The record NAME is
// the Error ID (ERR-…). Column IDs are resolved from the provisioned account config.
function logAccountError(accountId, input) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!accountId)
                return;
            const config = yield (0, account_store_1.getAccountConfig)(String(accountId));
            const boardId = (_a = config === null || config === void 0 ? void 0 : config.boards) === null || _a === void 0 ? void 0 : _a.errorLogs;
            const cols = ((_b = config === null || config === void 0 ? void 0 : config.columns) === null || _b === void 0 ? void 0 : _b.errorLogs) || {};
            if (!boardId)
                return; // Error Logs board not provisioned (older account) — skip silently.
            const token = yield (0, account_store_1.resolveMondayToken)(String(accountId));
            if (!token)
                return;
            const col = (title) => cols[title];
            const cv = {};
            const now = new Date();
            const iso = now.toISOString();
            if (col('Timestamp'))
                cv[col('Timestamp')] = { date: iso.slice(0, 10), time: iso.slice(11, 19) };
            if (col('Process Stage'))
                cv[col('Process Stage')] = { label: input.stage };
            if (col('Error Severity'))
                cv[col('Error Severity')] = { label: input.severity || 'Error' };
            if (input.orderId && col('Order ID'))
                cv[col('Order ID')] = input.orderId;
            if (input.splitOrderId && col('Split Order ID'))
                cv[col('Split Order ID')] = input.splitOrderId;
            // Connect the error to the actual Order / Split Order item (both on the Orders board)
            // when we have their monday item ids, so the record links straight to the order.
            const orderIds = asItemIds(input.orderItemId);
            if (orderIds && col('Orders'))
                cv[col('Orders')] = { item_ids: orderIds };
            const splitIds = asItemIds(input.splitOrderItemId);
            if (splitIds && col('Split Orders'))
                cv[col('Split Orders')] = { item_ids: splitIds };
            if (input.supplier && col('Supplier'))
                cv[col('Supplier')] = input.supplier;
            if (input.courier && col('Courier'))
                cv[col('Courier')] = input.courier;
            if (input.sku && col('SKU / Product'))
                cv[col('SKU / Product')] = input.sku;
            if (col('Error Message'))
                cv[col('Error Message')] = { text: clip(input.message) || '-' };
            if (input.technicalDetails && col('Technical Details'))
                cv[col('Technical Details')] = { text: clip(input.technicalDetails) };
            if (input.suggestedSolution && col('Suggested Solution'))
                cv[col('Suggested Solution')] = { text: clip(input.suggestedSolution) };
            if (col('Status'))
                cv[col('Status')] = { label: 'Open' };
            if (input.retry && col('Retry'))
                cv[col('Retry')] = { checked: 'true' };
            const errId = `ERR-${now.getTime().toString(36).toUpperCase()}`;
            const client = new graphql_request_1.GraphQLClient(MONDAY_API, { headers: { Authorization: token } });
            yield client.request(`mutation ($boardId: ID!, $name: String!, $cv: JSON!) {
                create_item(board_id: $boardId, item_name: $name, column_values: $cv, create_labels_if_missing: true) { id }
            }`, { boardId, name: errId, cv: JSON.stringify(cv) });
        }
        catch (err) {
            console.error('⚠️ Failed to write error-log record:', err === null || err === void 0 ? void 0 : err.message);
        }
    });
}
exports.logAccountError = logAccountError;
