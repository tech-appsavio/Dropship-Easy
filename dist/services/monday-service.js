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
const api_1 = require("@mondaydotcomorg/api");
const graphql_request_1 = require("graphql-request");
const queries_graphql_1 = require("../queries.graphql");
class MondayService {
    static getMe(shortLiveToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mondayClient = new api_1.ApiClient({ token: shortLiveToken });
                const me = yield mondayClient.operations.getMeOp();
                return me;
            }
            catch (err) {
                // Error getting user info
            }
        });
    }
    static getColumnValue(token, itemId, columnId) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mondayClient = new api_1.ApiClient({ token: token });
                const params = { itemId: [itemId], columnId: [columnId] };
                const response = yield mondayClient.request(queries_graphql_1.getColumnValueQuery, params);
                const col = ((_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.items) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.column_values) === null || _c === void 0 ? void 0 : _c[0]);
                // Handle mirror/lookup columns which use display_value
                return (col === null || col === void 0 ? void 0 : col.display_value) || (col === null || col === void 0 ? void 0 : col.text) || (col === null || col === void 0 ? void 0 : col.value) || null;
            }
            catch (err) {
                throw err;
            }
        });
    }
    static getBoardIdByIntegration(token, integrationId) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mondayClient = new api_1.ApiClient({ token });
                const response = yield mondayClient.request(queries_graphql_1.getAllBoardsQuery, {});
                const boards = (response === null || response === void 0 ? void 0 : response.boards) || [];
                // Return columns from the most recently used board
                return ((_a = boards === null || boards === void 0 ? void 0 : boards[0]) === null || _a === void 0 ? void 0 : _a.id) || null;
            }
            catch (err) {
                return null;
            }
        });
    }
    // Returns the subset of the given board IDs that DON'T exist for this token (deleted
    // boards / stale config). Empty array means every board is valid. Used to fail fast
    // with a clear message instead of a deep InvalidBoardIdException.
    static findMissingBoards(token, boardIds) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const ids = boardIds.map((b) => String(b)).filter(Boolean);
            if (!ids.length)
                return [];
            try {
                const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                    headers: { Authorization: token }
                });
                const resp = yield client.request(`query ($ids: [ID!]) { boards(ids: $ids) { id } }`, { ids });
                const existing = new Set(((_a = resp === null || resp === void 0 ? void 0 : resp.boards) !== null && _a !== void 0 ? _a : []).map((b) => String(b.id)));
                return ids.filter((id) => !existing.has(id));
            }
            catch (err) {
                return []; // on query failure, don't block — let the downstream call surface it
            }
        });
    }
    // Quick liveness check for an OAuth token. Returns false if monday rejects it (e.g.
    // the token was revoked when the app was uninstalled). Used to detect a stale token
    // and prompt reconnection instead of failing deep inside a mutation.
    static isTokenValid(token) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!token)
                return false;
            try {
                const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', { headers: { Authorization: token } });
                const resp = yield client.request(`query { me { id } }`);
                return !!((_a = resp === null || resp === void 0 ? void 0 : resp.me) === null || _a === void 0 ? void 0 : _a.id);
            }
            catch (_b) {
                return false;
            }
        });
    }
    static getBoardColumns(token, boardId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                    headers: { Authorization: token }
                });
                const response = yield client.request(queries_graphql_1.getBoardColumnsQuery, { boardId: [boardId] });
                return ((_b = (_a = response === null || response === void 0 ? void 0 : response.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.columns) || [];
            }
            catch (err) {
                return [];
            }
        });
    }
    static changeMultipleColumnValues(token, boardId, itemId, columnValues) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('📝 changeMultipleColumnValues called');
                console.log('   Board ID:', boardId);
                console.log('   Item ID:', itemId);
                // Log only the column IDs being written — NOT the values, which can contain PII
                // (customer name/address/phone/email when writing order/customer records).
                console.log('   Columns:', Object.keys(columnValues || {}).join(', '));
                const mondayClient = new api_1.ApiClient({ token: token });
                const query = `mutation change_multiple_column_values($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
                change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
                    id
                }
            }`;
                const variables = {
                    boardId: boardId,
                    itemId: itemId,
                    columnValues: JSON.stringify(columnValues)
                };
                console.log('🚀 Sending mutation to Monday API...');
                const response = yield mondayClient.request(query, variables);
                console.log('✅ Monday API response:', response);
                return response;
            }
            catch (err) {
                console.error('❌ changeMultipleColumnValues error:', err.message);
                throw err;
            }
        });
    }
    static findItemByColumnValue(token, boardId, columnId, value) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                    headers: { Authorization: token }
                });
                const query = `query ($boardId: ID!, $columnId: String!, $value: String!) {
                items_page_by_column_values(
                    limit: 1,
                    board_id: $boardId,
                    columns: [{ column_id: $columnId, column_values: [$value] }]
                ) {
                    items {
                        id
                        name
                    }
                }
            }`;
                const response = yield client.request(query, { boardId, columnId, value });
                return ((_b = (_a = response === null || response === void 0 ? void 0 : response.items_page_by_column_values) === null || _a === void 0 ? void 0 : _a.items) === null || _b === void 0 ? void 0 : _b[0]) || null;
            }
            catch (err) {
                return null;
            }
        });
    }
    static createItem(token, boardId, itemName, columnValues) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Never log token bytes — log only that a token is present. Don't log the raw
                // item name either: for the Customers board it IS the customer's name (PII).
                console.log(`🔑 Creating item on board ${boardId} (auth: ${token ? 'present' : 'MISSING'})`);
                const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                    headers: { Authorization: token }
                });
                // create_labels_if_missing lets status/dropdown values (e.g. Source "Shopify",
                // Order Type "Order") populate on freshly-provisioned boards without pre-seeding labels.
                const query = `mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
                create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues, create_labels_if_missing: true) {
                    id
                }
            }`;
                const response = yield client.request(query, {
                    boardId,
                    itemName,
                    columnValues: JSON.stringify(columnValues)
                });
                return (response === null || response === void 0 ? void 0 : response.create_item) || null;
            }
            catch (err) {
                console.error('❌ Create item error:', err.message);
                throw err;
            }
        });
    }
    // Gathers the values needed to fill the WhatsApp order-confirmation template:
    //   orderName  = the order item's name        ({{1}})
    //   totalPrice = the "Total Price" column      ({{2}})
    //   products   = connected line-item names     ({{3}})
    static getOrderWhatsappParams(token, itemId, lineItemsBoardId) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: token }
            });
            // Use the caller account's provisioned line-items board. Multi-tenant: no env /
            // hardcoded fallback — using the wrong board would either read another tenant's data
            // or make "products" come back empty. If it's missing, skip the connection scan
            // (the board-scan fallback below still works off the order's own line-item links).
            const LINE_ITEMS_BOARD_ID = lineItemsBoardId || '';
            let orderName = '';
            let totalPrice = '';
            let products = '';
            try {
                const query = `query ($itemId: [ID!]) {
                items(ids: $itemId) {
                    id
                    name
                    column_values {
                        id
                        text
                        type
                        column { title }
                        ... on BoardRelationValue { linked_items { id name board { id } } }
                        ... on MirrorValue { display_value }
                    }
                }
            }`;
                const resp = yield client.request(query, { itemId: [itemId] });
                const item = (_a = resp === null || resp === void 0 ? void 0 : resp.items) === null || _a === void 0 ? void 0 : _a[0];
                if (item) {
                    orderName = item.name || '';
                    const cols = item.column_values || [];
                    const byTitle = (t) => cols.find((c) => { var _a; return (((_a = c.column) === null || _a === void 0 ? void 0 : _a.title) || '').trim().toLowerCase() === t.toLowerCase(); });
                    const priceCol = byTitle('Total Price') || byTitle('TotalPrice');
                    totalPrice = priceCol ? (priceCol.display_value || priceCol.text || '') : '';
                    // Prefer a two-way connection column on the order that links to line items.
                    const relCol = cols.find((c) => c.type === 'board_relation' &&
                        (c.linked_items || []).some((li) => { var _a; return String((_a = li.board) === null || _a === void 0 ? void 0 : _a.id) === String(LINE_ITEMS_BOARD_ID); }));
                    if (relCol) {
                        products = (relCol.linked_items || []).map((li) => li.name).filter(Boolean).join(', ');
                    }
                }
            }
            catch (err) {
                console.error('❌ getOrderWhatsappParams error:', err.message);
            }
            // Fallback: no two-way connection on the order — scan the line-items board for
            // items connected back to this order via their "Order" relation column. Requires the
            // account's line-items board id (no env fallback); skip if it wasn't provided.
            if (!products && LINE_ITEMS_BOARD_ID) {
                try {
                    products = yield MondayService.getConnectedLineItemNames(token, itemId, LINE_ITEMS_BOARD_ID);
                }
                catch (err) {
                    console.error('❌ getConnectedLineItemNames error:', err.message);
                }
            }
            return { orderName, totalPrice, products };
        });
    }
    static getConnectedLineItemNames(token, itemId, lineItemsBoardId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const client = new graphql_request_1.GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: token }
            });
            const names = [];
            let cursor = null;
            let guard = 0;
            do {
                const query = `query ($boardId: ID!, $cursor: String) {
                boards(ids: [$boardId]) {
                    items_page(limit: 100, cursor: $cursor) {
                        cursor
                        items {
                            name
                            column_values {
                                column { type }
                                ... on BoardRelationValue { linked_item_ids }
                            }
                        }
                    }
                }
            }`;
                const resp = yield client.request(query, { boardId: lineItemsBoardId, cursor });
                const page = (_b = (_a = resp === null || resp === void 0 ? void 0 : resp.boards) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.items_page;
                const items = (page === null || page === void 0 ? void 0 : page.items) || [];
                for (const li of items) {
                    const linked = (li.column_values || [])
                        .filter((c) => { var _a; return ((_a = c.column) === null || _a === void 0 ? void 0 : _a.type) === 'board_relation' && Array.isArray(c.linked_item_ids); })
                        .flatMap((c) => c.linked_item_ids.map(String));
                    if (linked.includes(String(itemId))) {
                        names.push(li.name);
                    }
                }
                cursor = (page === null || page === void 0 ? void 0 : page.cursor) || null;
            } while (cursor && ++guard < 50);
            return names.join(', ');
        });
    }
    static changeColumnValue(token, boardId, itemId, columnId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`🔄 changeColumnValue: columnId=${columnId}, value=${value}`);
                const mondayClient = new api_1.ApiClient({ token: token });
                const changeStatusColumn = yield mondayClient.operations.changeColumnValueOp({
                    boardId: boardId,
                    itemId: itemId,
                    columnId: columnId,
                    value: value,
                });
                console.log(`✅ changeColumnValue success:`, changeStatusColumn);
                return changeStatusColumn;
            }
            catch (err) {
                console.error(`❌ changeColumnValue error for column ${columnId}:`, err.message);
                throw err;
            }
        });
    }
}
exports.default = MondayService;
