import { GraphQLClient } from 'graphql-request';
import { PROVISIONING_SCHEMA, BoardDef } from './provisioning-schema';
import { AccountConfig, getAccountConfig, saveAccountConfig } from './account-store';

const MONDAY_API = 'https://api.monday.com/v2';

function makeClient(token: string, apiVersion?: string): GraphQLClient {
    const headers: Record<string, string> = { Authorization: token };
    if (apiVersion) headers['API-Version'] = apiVersion;
    return new GraphQLClient(MONDAY_API, { headers });
}

// board_relation + mirror creation is version-gated (older versions reject them). Resolve
// the account's CURRENT version at runtime rather than pinning a date that goes stale.
async function resolveApiVersion(token: string): Promise<string | undefined> {
    try {
        const client = makeClient(token);
        const resp: any = await client.request(`query { versions { kind value } }`);
        const versions: any[] = resp?.versions ?? [];
        const current = versions.find((v) => v.kind === 'current');
        return current?.value || versions.map((v) => v.value).filter(Boolean).sort().pop();
    } catch {
        return undefined; // fall back to the account default version
    }
}

// Runs `worker` over `items` with at most `limit` in flight — parallel speed without
// hammering the monday API rate limit.
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
    let i = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            await worker(items[idx]);
        }
    });
    await Promise.all(runners);
}

// ── Live board/column mapping ─────────────────────────────────────────────────
// A snapshot of what actually exists in monday right now, keyed by our logical board
// key. Everything downstream (connect/mirror creation) resolves IDs from here by
// title — never hardcoded. `type` is kept so callers can tell a connect column from a
// standard one when needed.
interface ColumnInfo { id: string; type: string; }
type BoardColumnMap = Record<string, { boardId: string; byTitle: Record<string, ColumnInfo> }>;

// Fetch every provisioned board and all its columns, keyed by our logical board key.
async function fetchBoardColumnMap(client: GraphQLClient, boards: Record<string, string>): Promise<BoardColumnMap> {
    const ids = Object.values(boards).filter(Boolean);
    const map: BoardColumnMap = {};
    if (!ids.length) return map;

    const query = `query ($ids: [ID!]) {
        boards(ids: $ids) { id columns { id title type } }
    }`;
    const resp: any = await client.request(query, { ids });
    const boardsById: Record<string, any> = {};
    for (const b of resp?.boards ?? []) boardsById[String(b.id)] = b;

    for (const [key, boardId] of Object.entries(boards)) {
        const b = boardsById[String(boardId)];
        const byTitle: Record<string, ColumnInfo> = {};
        for (const col of b?.columns ?? []) {
            // First column wins on duplicate titles — provisioning avoids creating dupes.
            if (!(col.title in byTitle)) byTitle[col.title] = { id: col.id, type: col.type };
        }
        map[key] = { boardId: String(boardId), byTitle };
    }
    return map;
}

// Which of the given board IDs still exist (deleted boards are absent from the result).
async function fetchExistingBoardIds(client: GraphQLClient, ids: string[]): Promise<Set<string>> {
    const clean = ids.filter(Boolean).map(String);
    if (!clean.length) return new Set();
    const resp: any = await client.request(`query ($ids: [ID!]) { boards(ids: $ids) { id } }`, { ids: clean });
    return new Set((resp?.boards ?? []).map((b: any) => String(b.id)));
}

// Every active board in the account: name → id (first match wins). Lets us reuse an
// existing board even when the stored config was lost, so we never duplicate.
async function fetchAccountBoardsByName(client: GraphQLClient): Promise<Record<string, string>> {
    const byName: Record<string, string> = {};
    for (let page = 1; page <= 20; page++) {
        const resp: any = await client.request(
            `query ($page: Int!) { boards(limit: 100, page: $page, state: active) { id name } }`, { page }
        );
        const list: any[] = resp?.boards ?? [];
        for (const b of list) {
            if (b?.name && !(b.name in byName)) byName[b.name] = String(b.id);
        }
        if (list.length < 100) break;
    }
    return byName;
}

// Builds a status column's `defaults` JSON, placing `defaultLabel` at index 5 (monday's
// default-label slot for new items) and the remaining labels at the other indices,
// skipping 5. If no defaultLabel, index 5 is left blank (monday's recommended default).
function buildStatusDefaults(labels: string[], defaultLabel?: string): string {
    const RESERVED = 5;
    const labelMap: Record<string, string> = {};
    let idx = 0;
    for (const l of labels) {
        if (defaultLabel && l === defaultLabel) {
            labelMap[String(RESERVED)] = l;
        } else {
            if (idx === RESERVED) idx++; // don't put a non-default label in the default slot
            labelMap[String(idx)] = l;
            idx++;
        }
    }
    return JSON.stringify({ labels: labelMap });
}

// ── Creation primitives ───────────────────────────────────────────────────────
async function createBoard(client: GraphQLClient, name: string, workspaceId?: string, folderId?: string): Promise<string> {
    const query = `mutation ($name: String!, $kind: BoardKind!, $workspaceId: ID, $folderId: ID) {
        create_board(board_name: $name, board_kind: $kind, workspace_id: $workspaceId, folder_id: $folderId) { id }
    }`;
    const resp: any = await client.request(query, {
        name, kind: 'public',
        workspaceId: workspaceId ?? null,
        folderId: folderId ?? null,
    });
    return resp?.create_board?.id;
}

// Resolves (creating if needed) the "Dropship Easy" folder to hold all of the app's boards.
// Idempotent: reuses the stored folder/workspace, then an existing folder found by name,
// before creating a new one — so reinstalls never make duplicate folders. Returns empty
// on any failure so provisioning falls back to creating boards without a folder.
async function ensureDropshipEasyFolder(
    client: GraphQLClient,
    stored: { workspaceId?: string; folderId?: string },
): Promise<{ workspaceId?: string; folderId?: string }> {
    const FOLDER_NAME = 'Dropship Easy';
    try {
        // Pick a workspace: reuse the stored one, else prefer "Main workspace", else the first.
        let workspaceId = stored.workspaceId;
        if (!workspaceId) {
            const wsResp: any = await client.request(`query { workspaces(limit: 100) { id name } }`);
            const workspaces: any[] = wsResp?.workspaces ?? [];
            if (workspaces.length) {
                const main = workspaces.find((w) => (w.name || '').toLowerCase() === 'main workspace') || workspaces[0];
                workspaceId = String(main.id);
            }
        }
        // Fallback: the `workspaces` query does NOT return the built-in "Main workspace" on
        // many accounts — so on a brand-new account (which has only the Main workspace) the
        // list above comes back empty. Resolve the workspace from any existing board instead,
        // so the folder still lands in the right (main) workspace.
        if (!workspaceId) {
            const bResp: any = await client.request(`query { boards(limit: 50, state: active) { workspace_id } }`);
            const wid = ((bResp?.boards ?? []) as any[]).map((b) => b?.workspace_id).find(Boolean);
            if (wid) workspaceId = String(wid);
        }
        if (!workspaceId) {
            console.warn('⚠️ Could not resolve a workspace for the "Dropship Easy" folder — creating boards at the default location.');
            return {};
        }

        // Reuse an existing "Dropship Easy" folder in this workspace if present.
        const foldersResp: any = await client.request(
            `query ($ws: [ID!]) { folders(workspace_ids: $ws, limit: 200) { id name } }`,
            { ws: [workspaceId] },
        );
        const existing = (foldersResp?.folders ?? []).find((f: any) => (f.name || '').trim() === FOLDER_NAME);
        if (existing) return { workspaceId, folderId: String(existing.id) };

        // Otherwise create it.
        const createResp: any = await client.request(
            `mutation ($name: String!, $ws: ID!) { create_folder(name: $name, workspace_id: $ws) { id } }`,
            { name: FOLDER_NAME, ws: workspaceId },
        );
        const folderId = createResp?.create_folder?.id;
        return { workspaceId, folderId: folderId ? String(folderId) : undefined };
    } catch (err: any) {
        console.error('⚠️ Could not create/resolve the "Dropship Easy" folder — creating boards without it:', err.message);
        return {};
    }
}

async function createStandardColumn(
    client: GraphQLClient, boardId: string, title: string, type: string, labels?: string[], defaultLabel?: string,
): Promise<string> {
    const query = `mutation ($boardId: ID!, $title: String!, $type: ColumnType!, $defaults: JSON) {
        create_column(board_id: $boardId, title: $title, column_type: $type, defaults: $defaults) { id }
    }`;

    // Pre-seed status options via `defaults` when provided.
    const defaults = (type === 'status' && labels?.length) ? buildStatusDefaults(labels, defaultLabel) : null;

    try {
        const resp: any = await client.request(query, { boardId, title, type, defaults });
        return resp?.create_column?.id;
    } catch (err: any) {
        // If pre-seeding labels was rejected, retry as a plain column (labels can be
        // added later / auto-created at item creation via create_labels_if_missing).
        if (defaults) {
            const resp: any = await client.request(query, { boardId, title, type, defaults: null });
            return resp?.create_column?.id;
        }
        throw err;
    }
}

// Connect Boards (board_relation) column linking `boardId` → `targetBoardId`.
async function createConnectColumn(
    client: GraphQLClient, boardId: string, title: string, targetBoardId: string, description?: string,
): Promise<string> {
    const query = `mutation ($boardId: ID!, $title: String!, $description: String, $defaults: JSON) {
        create_column(board_id: $boardId, title: $title, description: $description, column_type: board_relation, defaults: $defaults) { id }
    }`;
    const defaults = JSON.stringify({ boardIds: [Number(targetBoardId)] });
    const resp: any = await client.request(query, { boardId, title, description: description ?? null, defaults });
    return resp?.create_column?.id;
}

// Mirror column showing `sourceColumnId` (on `connectedBoardId`) THROUGH the connect
// column `relationColumnId` that already exists on `boardId`.
async function createMirrorColumn(
    client: GraphQLClient, boardId: string, title: string,
    relationColumnId: string, connectedBoardId: string, sourceColumnId: string, description?: string,
): Promise<string> {
    const query = `mutation ($boardId: ID!, $title: String!, $description: String, $defaults: JSON) {
        create_column(board_id: $boardId, title: $title, description: $description, column_type: mirror, defaults: $defaults) { id }
    }`;
    const defaults = JSON.stringify({
        settings: {
            relation_column: { [relationColumnId]: true },
            displayed_linked_columns: [{ board_id: String(connectedBoardId), column_ids: [sourceColumnId] }],
        },
    });
    const resp: any = await client.request(query, { boardId, title, description: description ?? null, defaults });
    return resp?.create_column?.id;
}

// ── Orchestration ─────────────────────────────────────────────────────────────
// Provisions (or repairs) every board, standard column, connect column and mirror
// column for one account, persisting the resulting IDs. Fully idempotent: anything
// that already exists (matched by title) is reused, so a re-run only fills gaps — safe
// to call on install AND as a repair for accounts provisioned before connect/mirror
// support existed. Individual failures are logged and skipped so one can't abort the rest.
//
// Ordered phases (a mirror needs its connect column, which needs both boards):
//   1. boards + standard columns
//   2. build the board/column mapping (live fetch)
//   3. connect (board_relation) columns  → then refresh the mapping
//   4. mirror columns (resolved entirely from the refreshed mapping)
//
// Concurrency-safe: install-time provisioning (OAuth callback) and a fallback trigger
// (view "finish setup") can fire near-simultaneously for the same account. A per-account
// in-flight lock makes the second caller AWAIT the first instead of racing into duplicate
// boards.
const provisionInFlight = new Map<string, Promise<AccountConfig>>();

export function provisionAccount(accountId: string, token: string): Promise<AccountConfig> {
    const running = provisionInFlight.get(String(accountId));
    if (running) {
        return running;
    }
    const p = provisionAccountImpl(String(accountId), token).finally(() => provisionInFlight.delete(String(accountId)));
    provisionInFlight.set(String(accountId), p);
    return p;
}

async function provisionAccountImpl(accountId: string, token: string): Promise<AccountConfig> {
    const apiVersion = await resolveApiVersion(token);
    const client = makeClient(token, apiVersion);
    const existing = await getAccountConfig(accountId);
    const config: AccountConfig = existing?.boards
        ? { provisioned: true, boards: { ...existing.boards }, columns: { ...(existing.columns || {}) }, workspaceId: existing.workspaceId, folderId: existing.folderId }
        : { provisioned: false, boards: {}, columns: {} };

    // Create/reuse the "Dropship Easy" folder so all boards are grouped inside it.
    const folder = await ensureDropshipEasyFolder(client, { workspaceId: config.workspaceId, folderId: config.folderId });
    config.workspaceId = folder.workspaceId ?? config.workspaceId;
    config.folderId = folder.folderId ?? config.folderId;

    // ── Phase 0: reconcile stored config with reality ─────────────────────────
    // Drop any stored board ID that no longer exists (deleted board), then reuse any
    // board that already exists BY NAME. Without this, a stale config keeps pointing at
    // deleted boards and every write fails with InvalidBoardIdException.
    const storedIds = Object.values(config.boards).filter(Boolean) as string[];
    if (storedIds.length) {
        const live = await fetchExistingBoardIds(client, storedIds);
        for (const [key, id] of Object.entries({ ...config.boards })) {
            if (id && !live.has(String(id))) {
                console.warn(`♻️ board "${key}" (${id}) no longer exists — will recreate`);
                delete config.boards[key];
                delete config.columns[key];
            }
        }
    }
    const byName = await fetchAccountBoardsByName(client);
    for (const board of PROVISIONING_SCHEMA) {
        if (config.boards[board.key]) continue;
        if (byName[board.name]) {
            config.boards[board.key] = byName[board.name];
        }
    }

    // ── Phase 1: boards + standard columns ────────────────────────────────────
    // Create any missing boards in parallel (few calls).
    await Promise.all(PROVISIONING_SCHEMA.filter((b) => !config.boards[b.key]).map(async (board) => {
        try {
            const boardId = await createBoard(client, board.name, config.workspaceId, config.folderId);
            if (boardId) {
                config.boards[board.key] = boardId;
            }
        } catch (err: any) {
            console.error(`❌ Board "${board.name}" failed: ${err.message}`);
        }
    }));

    // Create every missing standard column across all boards with bounded concurrency —
    // this is the bulk of the work, so parallelizing it keeps install-time setup fast.
    const colTasks: { board: BoardDef; boardId: string; col: typeof PROVISIONING_SCHEMA[number]['columns'][number] }[] = [];
    for (const board of PROVISIONING_SCHEMA) {
        const boardId = config.boards[board.key];
        if (!boardId) continue;
        config.columns[board.key] = config.columns[board.key] || {};
        const existingTitles = new Set(Object.keys(config.columns[board.key]));
        for (const col of board.columns) {
            if (!existingTitles.has(col.title)) colTasks.push({ board, boardId, col });
        }
    }
    await runPool(colTasks, 8, async ({ board, boardId, col }) => {
        try {
            const colId = await createStandardColumn(client, boardId, col.title, col.type, col.labels, col.defaultLabel);
            if (colId) config.columns[board.key][col.title] = colId;
        } catch (err: any) {
            console.error(`  ⚠️ Column "${col.title}" on "${board.name}" failed: ${err.message}`);
        }
    });

    // ── Phase 2: build the board/column mapping from live monday state ─────────
    let map = await fetchBoardColumnMap(client, config.boards);
    mergeMapIntoConfig(map, config); // capture standard-column IDs (incl. pre-existing)

    // ── Phase 3: connect (board_relation) columns ─────────────────────────────
    // Boards are independent here, so create their connect columns in parallel.
    await Promise.all(PROVISIONING_SCHEMA.map((board) =>
        createColumnsForBoard(board, board.connectColumns, config, map, async (c) => {
            const targetBoardId = config.boards[c.connectTo];
            if (!targetBoardId) throw new Error(`target board "${c.connectTo}" not provisioned`);
            return createConnectColumn(client, config.boards[board.key], c.title, targetBoardId, c.description);
        })
    ));

    // Refresh so mirror creation can see the connect columns just created.
    map = await fetchBoardColumnMap(client, config.boards);
    mergeMapIntoConfig(map, config);

    // ── Phase 4: mirror columns (all IDs resolved from the refreshed mapping) ──
    await Promise.all(PROVISIONING_SCHEMA.map((board) =>
        createColumnsForBoard(board, board.mirrorColumns, config, map, async (m) => {
            const relationCol = map[board.key]?.byTitle[m.throughConnect];
            const sourceBoard = map[m.sourceBoard];
            const sourceCol = sourceBoard?.byTitle[m.sourceColumn];
            if (!relationCol) throw new Error(`connect column "${m.throughConnect}" missing`);
            if (!sourceBoard) throw new Error(`source board "${m.sourceBoard}" missing`);
            if (!sourceCol) throw new Error(`source column "${m.sourceColumn}" missing on "${m.sourceBoard}"`);
            return createMirrorColumn(
                client, config.boards[board.key], m.title,
                relationCol.id, sourceBoard.boardId, sourceCol.id, m.description,
            );
        })
    ));

    config.provisioned = true;
    await saveAccountConfig(accountId, config);
    return config;
}

// Copy every fetched column ID into config.columns[boardKey][title] so runtime
// title→ID resolution keeps working and re-runs recognize what already exists.
function mergeMapIntoConfig(map: BoardColumnMap, config: AccountConfig): void {
    for (const [key, board] of Object.entries(map)) {
        config.columns[key] = config.columns[key] || {};
        for (const [title, info] of Object.entries(board.byTitle)) {
            config.columns[key][title] = info.id;
        }
    }
}

// Shared idempotent create loop for connect/mirror columns: skips any column whose
// title already exists on the board, records the new ID into config + map on success.
async function createColumnsForBoard<T extends { title: string }>(
    board: BoardDef,
    defs: T[] | undefined,
    config: AccountConfig,
    map: BoardColumnMap,
    create: (def: T) => Promise<string>,
): Promise<void> {
    if (!defs?.length) return;
    const boardId = config.boards[board.key];
    if (!boardId) return;
    const entry = map[board.key] || (map[board.key] = { boardId, byTitle: {} });

    for (const def of defs) {
        if (entry.byTitle[def.title]) continue; // already exists — idempotent
        try {
            const id = await create(def);
            if (id) {
                config.columns[board.key] = config.columns[board.key] || {};
                config.columns[board.key][def.title] = id;
                entry.byTitle[def.title] = { id, type: '' };
            }
        } catch (err: any) {
            console.error(`  ⚠️ Column "${def.title}" on "${board.name}" failed: ${err.message}`);
        }
    }
}
