import { mondayApi } from "./mondayApi";

// Fetches ALL items from a board by following the items_page cursor, so boards with more
// than one page (>500 items) are fully loaded rather than silently truncated at 500. Every
// page request goes through mondayApi (rate-limit / complexity aware with backoff), so this
// stays reliable on very large boards where a naive loop would trip monday's limits.
// `itemFields` is the GraphQL selection set for each item, e.g.
//   "id name column_values { id text ... }"
export async function fetchAllBoardItems(boardId: string | number, itemFields: string): Promise<any[]> {
    const all: any[] = [];
    let guard = 0;

    const firstRes: any = await mondayApi(`query {
        boards(ids: ${boardId}) {
            items_page(limit: 500) { cursor items { ${itemFields} } }
        }
    }`);
    let page = firstRes?.data?.boards?.[0]?.items_page;

    while (page && guard++ < 500) {
        if (page.items?.length) all.push(...page.items);
        const cursor: string | null = page.cursor;
        if (!cursor) break;
        const nextRes: any = await mondayApi(`query {
            next_items_page(limit: 500, cursor: "${cursor}") { cursor items { ${itemFields} } }
        }`);
        page = nextRes?.data?.next_items_page;
    }

    return all;
}
