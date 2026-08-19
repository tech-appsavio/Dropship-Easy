// src/views/multi_order_processing/utils/mondayColumns.ts
//
// Resolves column IDs by TITLE at runtime, mirroring the backend's
// getBoardColumns()/buildColumnMap() pattern (src/services/monday-service.ts,
// src/services/shopify-service.ts) — used instead of hardcoding column IDs, which
// breaks whenever a column doesn't exist yet on a given board copy (e.g. a freshly
// provisioned account). Title lookup self-heals in that case.
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// boardId -> { lowercased title -> column id }
const columnIdCache = new Map<string, Record<string, string>>();

async function getColumnTitleMap(boardId: string | number): Promise<Record<string, string>> {
    const key = String(boardId);
    const cached = columnIdCache.get(key);
    if (cached) return cached;

    const res: any = await monday.api(`query { boards(ids: ${boardId}) { columns { id title } } }`);
    const columns = res?.data?.boards?.[0]?.columns || [];
    const map: Record<string, string> = {};
    columns.forEach((c: any) => { map[String(c.title).trim().toLowerCase()] = c.id; });
    columnIdCache.set(key, map);
    return map;
}

// Resolves a column id by its exact title (case-insensitive, trimmed). Returns
// undefined if the column doesn't exist — callers should skip setting that column
// rather than fail the whole mutation.
export async function resolveColumnIdByTitle(boardId: string | number, title: string): Promise<string | undefined> {
    try {
        const map = await getColumnTitleMap(boardId);
        const id = map[title.trim().toLowerCase()];
        if (!id) console.warn(`[mondayColumns] Column "${title}" not found on board ${boardId}`);
        return id;
    } catch (err) {
        console.warn(`[mondayColumns] Failed to resolve column "${title}" on board ${boardId}:`, err);
        return undefined;
    }
}

// Batch version: resolves an entire { key: title } map to { key: columnId } in a
// single API call per board (the column list is fetched once and cached). Pass a
// title map from columns.ts (via titleMapOf), e.g.:
//   const ids = await resolveColumnIdsByTitles(ORDER_BOARD_ID, titleMapOf(ORDER_COLUMNS));
//   ids.STATUS // the real column id for the "Status" column on that board
// Any title not found resolves to undefined for that key (logged as a warning) —
// callers should guard with `if (ids.SOME_KEY)` before using it, same as a single lookup.
export async function resolveColumnIdsByTitles<T extends Record<string, string>>(
    boardId: string | number,
    titleMap: T
): Promise<{ [K in keyof T]?: string }> {
    const map = await getColumnTitleMap(boardId);
    const result: { [K in keyof T]?: string } = {};
    for (const key of Object.keys(titleMap) as (keyof T)[]) {
        const title = titleMap[key];
        const id = map[title.trim().toLowerCase()];
        if (!id) console.warn(`[mondayColumns] Column "${title}" (key "${String(key)}") not found on board ${boardId}`);
        result[key] = id;
    }
    return result;
}

// Clears the cached column list for a board (or all boards if omitted) — useful in
// local testing right after adding/renaming a column, without reloading the app.
export function clearColumnCache(boardId?: string | number): void {
    if (boardId === undefined) { columnIdCache.clear(); return; }
    columnIdCache.delete(String(boardId));
}
