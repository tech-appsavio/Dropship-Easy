import {ApiClient} from '@mondaydotcomorg/api';
import {GraphQLClient} from 'graphql-request';
import {GetColumnValueQuery, GetColumnValueQueryVariables} from "../generated/graphql";
import {getColumnValueQuery, getBoardColumnsQuery, getAllBoardsQuery} from "../queries.graphql";

class MondayService {

    static async getMe(shortLiveToken) {
        try {
            const mondayClient = new ApiClient({token: shortLiveToken});
            const me = await mondayClient.operations.getMeOp();
            return me;
        } catch (err) {
            // Error getting user info
        }
    }

    static async getColumnValue(token, itemId, columnId) {
        try {
            const mondayClient = new ApiClient({token: token});

            const params: GetColumnValueQueryVariables = { itemId: [itemId], columnId: [columnId] };
            const response: GetColumnValueQuery = await mondayClient.request<GetColumnValueQuery>(getColumnValueQuery, params);
            const col = (response?.items?.[0]?.column_values?.[0]) as any;
            // Handle mirror/lookup columns which use display_value
            return col?.display_value || col?.text || col?.value || null;
        } catch (err) {
            throw err;
        }
    }

    static async getBoardIdByIntegration(token: string, integrationId: string | number) {
        try {
            const mondayClient = new ApiClient({ token });
            const response: any = await mondayClient.request(getAllBoardsQuery, {});
            const boards = response?.boards || [];
            // Return columns from the most recently used board
            return boards?.[0]?.id || null;
        } catch (err) {
            return null;
        }
    }

    // Returns the subset of the given board IDs that DON'T exist for this token (deleted
    // boards / stale config). Empty array means every board is valid. Used to fail fast
    // with a clear message instead of a deep InvalidBoardIdException.
    static async findMissingBoards(token: string, boardIds: (string | number)[]): Promise<string[]> {
        const ids = boardIds.map((b) => String(b)).filter(Boolean);
        if (!ids.length) return [];
        try {
            const client = new GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: token }
            });
            const resp: any = await client.request(
                `query ($ids: [ID!]) { boards(ids: $ids) { id } }`, { ids }
            );
            const existing = new Set((resp?.boards ?? []).map((b: any) => String(b.id)));
            return ids.filter((id) => !existing.has(id));
        } catch (err) {
            return []; // on query failure, don't block — let the downstream call surface it
        }
    }

    // Quick liveness check for an OAuth token. Returns false if monday rejects it (e.g.
    // the token was revoked when the app was uninstalled). Used to detect a stale token
    // and prompt reconnection instead of failing deep inside a mutation.
    static async isTokenValid(token: string): Promise<boolean> {
        if (!token) return false;
        try {
            const client = new GraphQLClient('https://api.monday.com/v2', { headers: { Authorization: token } });
            const resp: any = await client.request(`query { me { id } }`);
            return !!resp?.me?.id;
        } catch {
            return false;
        }
    }

    static async getBoardColumns(token: string, boardId: string | number) {
        try {
            const client = new GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: token }
            });
            const response: any = await client.request(getBoardColumnsQuery, { boardId: [boardId] });
            return response?.boards?.[0]?.columns || [];
        } catch (err) {
            return [];
        }
    }

    static async changeMultipleColumnValues(token: string, boardId: number | string, itemId: number | string, columnValues: any) {
        try {
            // Log only the column IDs being written — NOT the values, which can contain PII
            // (customer name/address/phone/email when writing order/customer records).
            
            const mondayClient = new ApiClient({token: token});
            
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

            const response = await mondayClient.request(query, variables);
            return response;
        } catch (err: any) {
            console.error('❌ changeMultipleColumnValues error:', err.message);
            throw err;
        }
    }

    static async findItemByColumnValue(token: string, boardId: string, columnId: string, value: string) {
        try {
            const client = new GraphQLClient('https://api.monday.com/v2', {
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
            const response: any = await client.request(query, { boardId, columnId, value });
            return response?.items_page_by_column_values?.items?.[0] || null;
        } catch (err) {
            return null;
        }
    }

    static async createItem(token: string, boardId: string, itemName: string, columnValues: any) {
        try {
            // Never log token bytes — log only that a token is present. Don't log the raw
            // item name either: for the Customers board it IS the customer's name (PII).
            
            const client = new GraphQLClient('https://api.monday.com/v2', {
                headers: { Authorization: token }
            });
            // create_labels_if_missing lets status/dropdown values (e.g. Source "Shopify",
            // Order Type "Order") populate on freshly-provisioned boards without pre-seeding labels.
            const query = `mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
                create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues, create_labels_if_missing: true) {
                    id
                }
            }`;
            const response: any = await client.request(query, {
                boardId,
                itemName,
                columnValues: JSON.stringify(columnValues)
            });
            return response?.create_item || null;
        } catch (err) {
            console.error('❌ Create item error:', err.message);
            throw err;
        }
    }

    // Gathers the values needed to fill the WhatsApp order-confirmation template:
    //   orderName  = the order item's name        ({{1}})
    //   totalPrice = the "Total Price" column      ({{2}})
    //   products   = connected line-item names     ({{3}})
    static async getOrderWhatsappParams(token: string, itemId: string | number, lineItemsBoardId?: string) {
        const client = new GraphQLClient('https://api.monday.com/v2', {
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
            const resp: any = await client.request(query, { itemId: [itemId] });
            const item = resp?.items?.[0];
            if (item) {
                orderName = item.name || '';
                const cols = item.column_values || [];
                const byTitle = (t: string) =>
                    cols.find((c: any) => (c.column?.title || '').trim().toLowerCase() === t.toLowerCase());

                const priceCol = byTitle('Total Price') || byTitle('TotalPrice');
                totalPrice = priceCol ? (priceCol.display_value || priceCol.text || '') : '';

                // Prefer a two-way connection column on the order that links to line items.
                const relCol = cols.find((c: any) =>
                    c.type === 'board_relation' &&
                    (c.linked_items || []).some((li: any) => String(li.board?.id) === String(LINE_ITEMS_BOARD_ID))
                );
                if (relCol) {
                    products = (relCol.linked_items || []).map((li: any) => li.name).filter(Boolean).join(', ');
                }
            }
        } catch (err: any) {
            console.error('❌ getOrderWhatsappParams error:', err.message);
        }

        // Fallback: no two-way connection on the order — scan the line-items board for
        // items connected back to this order via their "Order" relation column. Requires the
        // account's line-items board id (no env fallback); skip if it wasn't provided.
        if (!products && LINE_ITEMS_BOARD_ID) {
            try {
                products = await MondayService.getConnectedLineItemNames(token, itemId, LINE_ITEMS_BOARD_ID);
            } catch (err: any) {
                console.error('❌ getConnectedLineItemNames error:', err.message);
            }
        }

        return { orderName, totalPrice, products };
    }

    static async getConnectedLineItemNames(token: string, itemId: string | number, lineItemsBoardId: string) {
        const client = new GraphQLClient('https://api.monday.com/v2', {
            headers: { Authorization: token }
        });
        const names: string[] = [];
        let cursor: string | null = null;
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
            const resp: any = await client.request(query, { boardId: lineItemsBoardId, cursor });
            const page = resp?.boards?.[0]?.items_page;
            const items = page?.items || [];
            for (const li of items) {
                const linked = (li.column_values || [])
                    .filter((c: any) => c.column?.type === 'board_relation' && Array.isArray(c.linked_item_ids))
                    .flatMap((c: any) => c.linked_item_ids.map(String));
                if (linked.includes(String(itemId))) {
                    names.push(li.name);
                }
            }
            cursor = page?.cursor || null;
        } while (cursor && ++guard < 50);

        return names.join(', ');
    }

    static async changeColumnValue(token, boardId, itemId, columnId, value) {
        try {
            const mondayClient = new ApiClient({token: token});
            const changeStatusColumn = await mondayClient.operations.changeColumnValueOp({
                boardId: boardId,
                itemId: itemId,
                columnId: columnId,
                value: value,
            });
            return changeStatusColumn;
        } catch (err: any) {
            console.error(`❌ changeColumnValue error for column ${columnId}:`, err.message);
            throw err;
        }
    }
}

export default MondayService;
