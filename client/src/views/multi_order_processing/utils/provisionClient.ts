// provisionClient.ts
//
// Client-side board/column provisioning. Runs INSIDE monday via monday.api(), which
// executes against the monday API using the logged-in user's session and the app's
// granted scopes (boards:write) — so a brand-new account provisions itself the first
// time the app is opened, with NO OAuth, no stored token, and no per-account setup.
//
// The WHAT-to-create (board names, column titles, connect/mirror relationships) is the
// backend's single source of truth (GET /api/provision/schema). This module only knows
// HOW to create it. Ordered phases (a mirror needs its connect column, which needs both
// boards):
//   1. boards + standard columns
//   2. fetch the live board/column mapping
//   3. connect (board_relation) columns → refresh the mapping
//   4. mirror columns (all IDs resolved from the refreshed mapping)
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// board_relation + mirror creation via create_column is version-gated — older API
// versions reject them ("This column type is not supported yet in the API"). Instead of
// pinning a fixed date, we resolve the account's CURRENT version at runtime (the newest
// stable, which supports these), cached for the session.
let cachedVersion: string | null = null;
async function resolveApiVersion(): Promise<string | undefined> {
    if (cachedVersion !== null) return cachedVersion || undefined;
    try {
        const res: any = await monday.api(`query { versions { kind value } }`);
        const versions: any[] = res?.data?.versions ?? [];
        const current = versions.find((v) => v.kind === "current");
        // Prefer the "current" stable version; else fall back to the newest value.
        cachedVersion = current?.value
            || versions.map((v) => v.value).filter(Boolean).sort().pop()
            || "";
        console.log(`[provision] using monday API version: ${cachedVersion || "(account default)"}`);
    } catch (err) {
        cachedVersion = "";
    }
    return cachedVersion || undefined;
}

// ── Schema shape (mirrors src/services/provisioning-schema.ts) ─────────────────
interface ColumnDef { title: string; type: string; labels?: string[]; defaultLabel?: string; }
interface ConnectColumnDef { title: string; connectTo: string; description?: string; }
interface MirrorColumnDef { title: string; throughConnect: string; sourceBoard: string; sourceColumn: string; description?: string; }
interface BoardDef {
    key: string;
    name: string;
    columns: ColumnDef[];
    connectColumns?: ConnectColumnDef[];
    mirrorColumns?: MirrorColumnDef[];
}

export interface ProvisionResult {
    boards: Record<string, string>;               // board key → board id
    columns: Record<string, Record<string, string>>; // board key → { column title → column id }
}

type ProgressFn = (message: string) => void;

interface ColumnInfo { id: string; type: string; }
type BoardColumnMap = Record<string, { boardId: string; byTitle: Record<string, ColumnInfo> }>;

// Thin monday.api() wrapper that surfaces GraphQL errors as thrown Errors and always
// runs against the account's current API version (so board_relation/mirror work).
async function api(query: string, variables?: Record<string, any>): Promise<any> {
    const apiVersion = await resolveApiVersion();
    const opts: any = {};
    if (variables) opts.variables = variables;
    if (apiVersion) opts.apiVersion = apiVersion;
    const res: any = await monday.api(query, opts);
    if (res?.errors?.length) {
        throw new Error(res.errors.map((e: any) => e.message || JSON.stringify(e)).join("; "));
    }
    return res?.data;
}

async function createBoard(name: string): Promise<string> {
    const data = await api(
        `mutation ($name: String!, $kind: BoardKind!) { create_board(board_name: $name, board_kind: $kind) { id } }`,
        { name, kind: "public" },
    );
    return data?.create_board?.id;
}

// Places `defaultLabel` at index 5 (monday's default-label slot for new items) and the
// rest at the other indices, skipping 5. No defaultLabel → index 5 stays blank.
function buildStatusDefaults(labels: string[], defaultLabel?: string): string {
    const RESERVED = 5;
    const labelMap: Record<string, string> = {};
    let idx = 0;
    for (const l of labels) {
        if (defaultLabel && l === defaultLabel) {
            labelMap[String(RESERVED)] = l;
        } else {
            if (idx === RESERVED) idx++;
            labelMap[String(idx)] = l;
            idx++;
        }
    }
    return JSON.stringify({ labels: labelMap });
}

async function createStandardColumn(boardId: string, col: ColumnDef): Promise<string> {
    const mutation = `mutation ($boardId: ID!, $title: String!, $type: ColumnType!, $defaults: JSON) {
        create_column(board_id: $boardId, title: $title, column_type: $type, defaults: $defaults) { id }
    }`;

    const defaults = (col.type === "status" && col.labels?.length) ? buildStatusDefaults(col.labels, col.defaultLabel) : null;

    try {
        const data = await api(mutation, { boardId, title: col.title, type: col.type, defaults });
        return data?.create_column?.id;
    } catch (err) {
        // Retry without pre-seeded labels if monday rejected them.
        if (defaults) {
            const data = await api(mutation, { boardId, title: col.title, type: col.type, defaults: null });
            return data?.create_column?.id;
        }
        throw err;
    }
}

async function createConnectColumn(boardId: string, title: string, targetBoardId: string, description?: string): Promise<string> {
    const data = await api(
        `mutation ($boardId: ID!, $title: String!, $description: String, $defaults: JSON) {
            create_column(board_id: $boardId, title: $title, description: $description, column_type: board_relation, defaults: $defaults) { id }
        }`,
        {
            boardId, title, description: description ?? null,
            // allowMultipleItems keeps one-or-many links working; no reflection column
            // (mirrors read the connect column on THIS board, not a reverse one).
            defaults: JSON.stringify({ boardIds: [Number(targetBoardId)], allowMultipleItems: true }),
        },
    );
    return data?.create_column?.id;
}

async function createMirrorColumn(
    boardId: string, title: string, relationColumnId: string, connectedBoardId: string, sourceColumnId: string, description?: string,
): Promise<string> {
    const defaults = JSON.stringify({
        settings: {
            relation_column: { [relationColumnId]: true },
            displayed_linked_columns: [{ board_id: String(connectedBoardId), column_ids: [sourceColumnId] }],
        },
    });
    const data = await api(
        `mutation ($boardId: ID!, $title: String!, $description: String, $defaults: JSON) {
            create_column(board_id: $boardId, title: $title, description: $description, column_type: mirror, defaults: $defaults) { id }
        }`,
        { boardId, title, description: description ?? null, defaults },
    );
    return data?.create_column?.id;
}

// Returns the subset of the given board IDs that still exist (deleted boards are simply
// absent from the response). Used to prune stale IDs from a saved config.
async function fetchExistingBoardIds(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const data = await api(`query ($ids: [ID!]) { boards(ids: $ids) { id } }`, { ids });
    return new Set((data?.boards ?? []).map((b: any) => String(b.id)));
}

// True only if EVERY given board ID still exists. Used to validate a "complete" stored
// config before trusting it — a board deleted after provisioning must not be trusted.
export async function verifyBoardsExist(ids: string[]): Promise<boolean> {
    const clean = ids.filter(Boolean).map(String);
    if (!clean.length) return false;
    const live = await fetchExistingBoardIds(clean);
    return clean.every((id) => live.has(id));
}

// Map of every active board in the account: name → id (first match wins). Lets us reuse
// a board that already exists even when the saved config was lost (e.g. uninstall/
// reinstall clears stored IDs) — so we never create a duplicate of a board we can see.
async function fetchAccountBoardsByName(): Promise<Record<string, string>> {
    const byName: Record<string, string> = {};
    for (let page = 1; page <= 20; page++) {
        const data = await api(
            `query ($page: Int!) { boards(limit: 100, page: $page, state: active) { id name } }`,
            { page },
        );
        const list: any[] = data?.boards ?? [];
        for (const b of list) {
            if (b?.name && !(b.name in byName)) byName[b.name] = String(b.id);
        }
        if (list.length < 100) break; // last page
    }
    return byName;
}

// Live snapshot of every provisioned board's columns, keyed by our logical board key.
async function fetchBoardColumnMap(boards: Record<string, string>): Promise<BoardColumnMap> {
    const ids = Object.values(boards).filter(Boolean);
    const map: BoardColumnMap = {};
    if (!ids.length) return map;

    const data = await api(`query ($ids: [ID!]) { boards(ids: $ids) { id columns { id title type } } }`, { ids });
    const boardsById: Record<string, any> = {};
    for (const b of data?.boards ?? []) boardsById[String(b.id)] = b;

    for (const [key, boardId] of Object.entries(boards)) {
        const b = boardsById[String(boardId)];
        const byTitle: Record<string, ColumnInfo> = {};
        for (const col of b?.columns ?? []) {
            if (!(col.title in byTitle)) byTitle[col.title] = { id: col.id, type: col.type };
        }
        map[key] = { boardId: String(boardId), byTitle };
    }
    return map;
}

function mergeMapIntoColumns(map: BoardColumnMap, columns: Record<string, Record<string, string>>): void {
    for (const [key, board] of Object.entries(map)) {
        columns[key] = columns[key] || {};
        for (const [title, info] of Object.entries(board.byTitle)) columns[key][title] = info.id;
    }
}

// Every column title the schema expects on a board (standard + connect + mirror).
function expectedTitles(board: BoardDef): string[] {
    return [
        ...board.columns.map((c) => c.title),
        ...(board.connectColumns ?? []).map((c) => c.title),
        ...(board.mirrorColumns ?? []).map((m) => m.title),
    ];
}

// True when every board exists and every expected column is already present — lets the
// caller skip provisioning entirely (no API calls) on subsequent opens.
export function isProvisioningComplete(schema: BoardDef[], existing?: ProvisionResult): boolean {
    if (!existing?.boards) return false;
    for (const board of schema) {
        if (!existing.boards[board.key]) return false;
        const cols = existing.columns?.[board.key] || {};
        for (const title of expectedTitles(board)) {
            if (!cols[title]) return false;
        }
    }
    return true;
}

// Provision the full schema for the current account. Fully idempotent & self-healing:
// existing boards are REUSED (never duplicated) and only missing columns are created, so
// this safely doubles as a repair for half-provisioned accounts. `existing` carries the
// account's already-known board/column IDs (from the backend) so nothing is recreated.
export async function provisionViaClient(
    schema: BoardDef[],
    onProgress: ProgressFn = () => {},
    existing?: ProvisionResult,
): Promise<ProvisionResult> {
    const boards: Record<string, string> = { ...(existing?.boards || {}) };
    const columns: Record<string, Record<string, string>> = {};
    for (const [k, v] of Object.entries(existing?.columns || {})) columns[k] = { ...v };

    // ── Phase 0: reconcile the saved config with what actually exists ──────────
    // 1) Drop any stored board ID that no longer exists (user deleted the board) so it
    //    gets recreated — otherwise writes fail with InvalidBoardIdException.
    // 2) Reuse any board that already exists BY NAME (survives config loss on uninstall/
    //    reinstall), so a board we can see is never duplicated.
    // The result: exactly the MISSING boards get created; everything else is reused.
    const storedIds = Object.values(boards).filter(Boolean) as string[];
    if (storedIds.length) {
        const live = await fetchExistingBoardIds(storedIds);
        for (const [key, id] of Object.entries({ ...boards })) {
            if (id && !live.has(String(id))) {
                console.warn(`[provision] board "${key}" (${id}) no longer exists — will recreate`);
                delete boards[key];
                delete columns[key];
            }
        }
    }
    const byName = await fetchAccountBoardsByName();
    for (const board of schema) {
        if (boards[board.key]) continue;           // already have a valid stored ID
        if (byName[board.name]) {                    // an existing board matches by name
            boards[board.key] = byName[board.name];
            console.log(`[provision] reusing existing board "${board.name}" (${byName[board.name]})`);
        }
    }

    // ── Phase 1a: create only the still-missing boards ────────────────────────
    for (const board of schema) {
        if (boards[board.key]) continue; // reused above — never duplicate
        onProgress(`Creating board "${board.name}"…`);
        const boardId = await createBoard(board.name);
        if (!boardId) throw new Error(`Failed to create board "${board.name}"`);
        boards[board.key] = boardId;
        columns[board.key] = columns[board.key] || {};
    }

    // ── Phase 1b: build the mapping, then create MISSING standard columns ──────
    onProgress("Mapping boards & columns…");
    let map = await fetchBoardColumnMap(boards);
    mergeMapIntoColumns(map, columns);

    for (const board of schema) {
        for (const col of board.columns) {
            if (map[board.key]?.byTitle[col.title]) continue; // already exists
            try {
                const id = await createStandardColumn(boards[board.key], col);
                if (id) columns[board.key][col.title] = id;
            } catch (err: any) {
                console.warn(`[provision] column "${col.title}" on "${board.name}" failed:`, err.message);
            }
        }
    }

    // Refresh so connect creation sees the standard columns just added.
    map = await fetchBoardColumnMap(boards);
    mergeMapIntoColumns(map, columns);

    // ── Phase 3: connect (board_relation) columns ─────────────────────────────
    for (const board of schema) {
        for (const c of board.connectColumns ?? []) {
            if (map[board.key]?.byTitle[c.title]) continue;
            const targetBoardId = boards[c.connectTo];
            if (!targetBoardId) { console.warn(`[provision] connect "${c.title}": target "${c.connectTo}" missing`); continue; }
            try {
                onProgress(`Linking "${c.title}" on "${board.name}"…`);
                const id = await createConnectColumn(boards[board.key], c.title, targetBoardId, c.description);
                if (id) columns[board.key][c.title] = id;
            } catch (err: any) {
                console.warn(`[provision] connect "${c.title}" on "${board.name}" failed:`, err.message);
            }
        }
    }

    // Refresh so mirror creation sees the connect columns just created.
    map = await fetchBoardColumnMap(boards);
    mergeMapIntoColumns(map, columns);

    // ── Phase 4: mirror columns ───────────────────────────────────────────────
    for (const board of schema) {
        for (const m of board.mirrorColumns ?? []) {
            if (map[board.key]?.byTitle[m.title]) continue;
            const relationCol = map[board.key]?.byTitle[m.throughConnect];
            const sourceBoard = map[m.sourceBoard];
            const sourceCol = sourceBoard?.byTitle[m.sourceColumn];
            if (!relationCol || !sourceBoard || !sourceCol) {
                console.warn(`[provision] mirror "${m.title}" on "${board.name}": unresolved refs`, {
                    hasRelation: !!relationCol, hasSourceBoard: !!sourceBoard, hasSourceCol: !!sourceCol,
                });
                continue;
            }
            try {
                onProgress(`Mirroring "${m.title}" on "${board.name}"…`);
                const id = await createMirrorColumn(boards[board.key], m.title, relationCol.id, sourceBoard.boardId, sourceCol.id, m.description);
                if (id) columns[board.key][m.title] = id;
            } catch (err: any) {
                console.warn(`[provision] mirror "${m.title}" on "${board.name}" failed:`, err.message);
            }
        }
    }

    return { boards, columns };
}
