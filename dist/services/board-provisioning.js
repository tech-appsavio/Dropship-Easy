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
exports.provisionAccount = void 0;
const graphql_request_1 = require("graphql-request");
const provisioning_schema_1 = require("./provisioning-schema");
const account_store_1 = require("./account-store");
const MONDAY_API = 'https://api.monday.com/v2';
function makeClient(token, apiVersion) {
    const headers = { Authorization: token };
    if (apiVersion)
        headers['API-Version'] = apiVersion;
    return new graphql_request_1.GraphQLClient(MONDAY_API, { headers });
}
// board_relation + mirror creation is version-gated (older versions reject them). Resolve
// the account's CURRENT version at runtime rather than pinning a date that goes stale.
function resolveApiVersion(token) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const client = makeClient(token);
            const resp = yield client.request(`query { versions { kind value } }`);
            const versions = (_a = resp === null || resp === void 0 ? void 0 : resp.versions) !== null && _a !== void 0 ? _a : [];
            const current = versions.find((v) => v.kind === 'current');
            return (current === null || current === void 0 ? void 0 : current.value) || versions.map((v) => v.value).filter(Boolean).sort().pop();
        }
        catch (_b) {
            return undefined; // fall back to the account default version
        }
    });
}
// Runs `worker` over `items` with at most `limit` in flight — parallel speed without
// hammering the monday API rate limit.
function runPool(items, limit, worker) {
    return __awaiter(this, void 0, void 0, function* () {
        let i = 0;
        const runners = Array.from({ length: Math.min(limit, items.length) }, () => __awaiter(this, void 0, void 0, function* () {
            while (i < items.length) {
                const idx = i++;
                yield worker(items[idx]);
            }
        }));
        yield Promise.all(runners);
    });
}
// Fetch every provisioned board and all its columns, keyed by our logical board key.
function fetchBoardColumnMap(client, boards) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const ids = Object.values(boards).filter(Boolean);
        const map = {};
        if (!ids.length)
            return map;
        const query = `query ($ids: [ID!]) {
        boards(ids: $ids) { id columns { id title type } }
    }`;
        const resp = yield client.request(query, { ids });
        const boardsById = {};
        for (const b of (_a = resp === null || resp === void 0 ? void 0 : resp.boards) !== null && _a !== void 0 ? _a : [])
            boardsById[String(b.id)] = b;
        for (const [key, boardId] of Object.entries(boards)) {
            const b = boardsById[String(boardId)];
            const byTitle = {};
            for (const col of (_b = b === null || b === void 0 ? void 0 : b.columns) !== null && _b !== void 0 ? _b : []) {
                // First column wins on duplicate titles — provisioning avoids creating dupes.
                if (!(col.title in byTitle))
                    byTitle[col.title] = { id: col.id, type: col.type };
            }
            map[key] = { boardId: String(boardId), byTitle };
        }
        return map;
    });
}
// Which of the given board IDs still exist (deleted boards are absent from the result).
function fetchExistingBoardIds(client, ids) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const clean = ids.filter(Boolean).map(String);
        if (!clean.length)
            return new Set();
        const resp = yield client.request(`query ($ids: [ID!]) { boards(ids: $ids) { id } }`, { ids: clean });
        return new Set(((_a = resp === null || resp === void 0 ? void 0 : resp.boards) !== null && _a !== void 0 ? _a : []).map((b) => String(b.id)));
    });
}
// Every active board in the account: name → id (first match wins). Lets us reuse an
// existing board even when the stored config was lost, so we never duplicate.
function fetchAccountBoardsByName(client) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const byName = {};
        for (let page = 1; page <= 20; page++) {
            const resp = yield client.request(`query ($page: Int!) { boards(limit: 100, page: $page, state: active) { id name } }`, { page });
            const list = (_a = resp === null || resp === void 0 ? void 0 : resp.boards) !== null && _a !== void 0 ? _a : [];
            for (const b of list) {
                if ((b === null || b === void 0 ? void 0 : b.name) && !(b.name in byName))
                    byName[b.name] = String(b.id);
            }
            if (list.length < 100)
                break;
        }
        return byName;
    });
}
// Builds a status column's `defaults` JSON, placing `defaultLabel` at index 5 (monday's
// default-label slot for new items) and the remaining labels at the other indices,
// skipping 5. If no defaultLabel, index 5 is left blank (monday's recommended default).
function buildStatusDefaults(labels, defaultLabel) {
    const RESERVED = 5;
    const labelMap = {};
    let idx = 0;
    for (const l of labels) {
        if (defaultLabel && l === defaultLabel) {
            labelMap[String(RESERVED)] = l;
        }
        else {
            if (idx === RESERVED)
                idx++; // don't put a non-default label in the default slot
            labelMap[String(idx)] = l;
            idx++;
        }
    }
    return JSON.stringify({ labels: labelMap });
}
// ── Creation primitives ───────────────────────────────────────────────────────
function createBoard(client, name, workspaceId, folderId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const query = `mutation ($name: String!, $kind: BoardKind!, $workspaceId: ID, $folderId: ID) {
        create_board(board_name: $name, board_kind: $kind, workspace_id: $workspaceId, folder_id: $folderId) { id }
    }`;
        const resp = yield client.request(query, {
            name, kind: 'public',
            workspaceId: workspaceId !== null && workspaceId !== void 0 ? workspaceId : null,
            folderId: folderId !== null && folderId !== void 0 ? folderId : null,
        });
        return (_a = resp === null || resp === void 0 ? void 0 : resp.create_board) === null || _a === void 0 ? void 0 : _a.id;
    });
}
// Resolves (creating if needed) the "Ship Easy" folder to hold all of the app's boards.
// Idempotent: reuses the stored folder/workspace, then an existing folder found by name,
// before creating a new one — so reinstalls never make duplicate folders. Returns empty
// on any failure so provisioning falls back to creating boards without a folder.
function ensureShipEasyFolder(client, stored) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        const FOLDER_NAME = 'Ship Easy';
        try {
            // Pick a workspace: reuse the stored one, else prefer "Main workspace", else the first.
            let workspaceId = stored.workspaceId;
            if (!workspaceId) {
                const wsResp = yield client.request(`query { workspaces(limit: 100) { id name } }`);
                const workspaces = (_a = wsResp === null || wsResp === void 0 ? void 0 : wsResp.workspaces) !== null && _a !== void 0 ? _a : [];
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
                const bResp = yield client.request(`query { boards(limit: 50, state: active) { workspace_id } }`);
                const wid = ((_b = bResp === null || bResp === void 0 ? void 0 : bResp.boards) !== null && _b !== void 0 ? _b : []).map((b) => b === null || b === void 0 ? void 0 : b.workspace_id).find(Boolean);
                if (wid)
                    workspaceId = String(wid);
            }
            if (!workspaceId) {
                console.warn('⚠️ Could not resolve a workspace for the "Ship Easy" folder — creating boards at the default location.');
                return {};
            }
            // Reuse an existing "Ship Easy" folder in this workspace if present.
            const foldersResp = yield client.request(`query ($ws: [ID!]) { folders(workspace_ids: $ws, limit: 200) { id name } }`, { ws: [workspaceId] });
            const existing = ((_c = foldersResp === null || foldersResp === void 0 ? void 0 : foldersResp.folders) !== null && _c !== void 0 ? _c : []).find((f) => (f.name || '').trim() === FOLDER_NAME);
            if (existing)
                return { workspaceId, folderId: String(existing.id) };
            // Otherwise create it.
            const createResp = yield client.request(`mutation ($name: String!, $ws: ID!) { create_folder(name: $name, workspace_id: $ws) { id } }`, { name: FOLDER_NAME, ws: workspaceId });
            const folderId = (_d = createResp === null || createResp === void 0 ? void 0 : createResp.create_folder) === null || _d === void 0 ? void 0 : _d.id;
            console.log(`✅ "${FOLDER_NAME}" folder ready (workspace ${workspaceId}, folder ${folderId})`);
            return { workspaceId, folderId: folderId ? String(folderId) : undefined };
        }
        catch (err) {
            console.error('⚠️ Could not create/resolve the "Ship Easy" folder — creating boards without it:', err.message);
            return {};
        }
    });
}
function createStandardColumn(client, boardId, title, type, labels, defaultLabel) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const query = `mutation ($boardId: ID!, $title: String!, $type: ColumnType!, $defaults: JSON) {
        create_column(board_id: $boardId, title: $title, column_type: $type, defaults: $defaults) { id }
    }`;
        // Pre-seed status options via `defaults` when provided.
        const defaults = (type === 'status' && (labels === null || labels === void 0 ? void 0 : labels.length)) ? buildStatusDefaults(labels, defaultLabel) : null;
        try {
            const resp = yield client.request(query, { boardId, title, type, defaults });
            return (_a = resp === null || resp === void 0 ? void 0 : resp.create_column) === null || _a === void 0 ? void 0 : _a.id;
        }
        catch (err) {
            // If pre-seeding labels was rejected, retry as a plain column (labels can be
            // added later / auto-created at item creation via create_labels_if_missing).
            if (defaults) {
                const resp = yield client.request(query, { boardId, title, type, defaults: null });
                return (_b = resp === null || resp === void 0 ? void 0 : resp.create_column) === null || _b === void 0 ? void 0 : _b.id;
            }
            throw err;
        }
    });
}
// Connect Boards (board_relation) column linking `boardId` → `targetBoardId`.
function createConnectColumn(client, boardId, title, targetBoardId, description) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const query = `mutation ($boardId: ID!, $title: String!, $description: String, $defaults: JSON) {
        create_column(board_id: $boardId, title: $title, description: $description, column_type: board_relation, defaults: $defaults) { id }
    }`;
        const defaults = JSON.stringify({ boardIds: [Number(targetBoardId)] });
        const resp = yield client.request(query, { boardId, title, description: description !== null && description !== void 0 ? description : null, defaults });
        return (_a = resp === null || resp === void 0 ? void 0 : resp.create_column) === null || _a === void 0 ? void 0 : _a.id;
    });
}
// Mirror column showing `sourceColumnId` (on `connectedBoardId`) THROUGH the connect
// column `relationColumnId` that already exists on `boardId`.
function createMirrorColumn(client, boardId, title, relationColumnId, connectedBoardId, sourceColumnId, description) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const query = `mutation ($boardId: ID!, $title: String!, $description: String, $defaults: JSON) {
        create_column(board_id: $boardId, title: $title, description: $description, column_type: mirror, defaults: $defaults) { id }
    }`;
        const defaults = JSON.stringify({
            settings: {
                relation_column: { [relationColumnId]: true },
                displayed_linked_columns: [{ board_id: String(connectedBoardId), column_ids: [sourceColumnId] }],
            },
        });
        const resp = yield client.request(query, { boardId, title, description: description !== null && description !== void 0 ? description : null, defaults });
        return (_a = resp === null || resp === void 0 ? void 0 : resp.create_column) === null || _a === void 0 ? void 0 : _a.id;
    });
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
const provisionInFlight = new Map();
function provisionAccount(accountId, token) {
    const running = provisionInFlight.get(String(accountId));
    if (running) {
        console.log(`⏳ Provisioning already in progress for account ${accountId} — awaiting it`);
        return running;
    }
    const p = provisionAccountImpl(String(accountId), token).finally(() => provisionInFlight.delete(String(accountId)));
    provisionInFlight.set(String(accountId), p);
    return p;
}
exports.provisionAccount = provisionAccount;
function provisionAccountImpl(accountId, token) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const apiVersion = yield resolveApiVersion(token);
        const client = makeClient(token, apiVersion);
        const existing = yield (0, account_store_1.getAccountConfig)(accountId);
        const config = (existing === null || existing === void 0 ? void 0 : existing.boards)
            ? { provisioned: true, boards: Object.assign({}, existing.boards), columns: Object.assign({}, (existing.columns || {})), workspaceId: existing.workspaceId, folderId: existing.folderId }
            : { provisioned: false, boards: {}, columns: {} };
        // Create/reuse the "Ship Easy" folder so all boards are grouped inside it.
        const folder = yield ensureShipEasyFolder(client, { workspaceId: config.workspaceId, folderId: config.folderId });
        config.workspaceId = (_a = folder.workspaceId) !== null && _a !== void 0 ? _a : config.workspaceId;
        config.folderId = (_b = folder.folderId) !== null && _b !== void 0 ? _b : config.folderId;
        // ── Phase 0: reconcile stored config with reality ─────────────────────────
        // Drop any stored board ID that no longer exists (deleted board), then reuse any
        // board that already exists BY NAME. Without this, a stale config keeps pointing at
        // deleted boards and every write fails with InvalidBoardIdException.
        const storedIds = Object.values(config.boards).filter(Boolean);
        if (storedIds.length) {
            const live = yield fetchExistingBoardIds(client, storedIds);
            for (const [key, id] of Object.entries(Object.assign({}, config.boards))) {
                if (id && !live.has(String(id))) {
                    console.warn(`♻️ board "${key}" (${id}) no longer exists — will recreate`);
                    delete config.boards[key];
                    delete config.columns[key];
                }
            }
        }
        const byName = yield fetchAccountBoardsByName(client);
        for (const board of provisioning_schema_1.PROVISIONING_SCHEMA) {
            if (config.boards[board.key])
                continue;
            if (byName[board.name]) {
                config.boards[board.key] = byName[board.name];
                console.log(`♻️ reusing existing board "${board.name}" (${byName[board.name]})`);
            }
        }
        // ── Phase 1: boards + standard columns ────────────────────────────────────
        // Create any missing boards in parallel (few calls).
        yield Promise.all(provisioning_schema_1.PROVISIONING_SCHEMA.filter((b) => !config.boards[b.key]).map((board) => __awaiter(this, void 0, void 0, function* () {
            try {
                const boardId = yield createBoard(client, board.name, config.workspaceId, config.folderId);
                if (boardId) {
                    config.boards[board.key] = boardId;
                    console.log(`✅ Created board "${board.name}" (${boardId})`);
                }
            }
            catch (err) {
                console.error(`❌ Board "${board.name}" failed: ${err.message}`);
            }
        })));
        // Create every missing standard column across all boards with bounded concurrency —
        // this is the bulk of the work, so parallelizing it keeps install-time setup fast.
        const colTasks = [];
        for (const board of provisioning_schema_1.PROVISIONING_SCHEMA) {
            const boardId = config.boards[board.key];
            if (!boardId)
                continue;
            config.columns[board.key] = config.columns[board.key] || {};
            const existingTitles = new Set(Object.keys(config.columns[board.key]));
            for (const col of board.columns) {
                if (!existingTitles.has(col.title))
                    colTasks.push({ board, boardId, col });
            }
        }
        yield runPool(colTasks, 8, ({ board, boardId, col }) => __awaiter(this, void 0, void 0, function* () {
            try {
                const colId = yield createStandardColumn(client, boardId, col.title, col.type, col.labels, col.defaultLabel);
                if (colId)
                    config.columns[board.key][col.title] = colId;
            }
            catch (err) {
                console.error(`  ⚠️ Column "${col.title}" on "${board.name}" failed: ${err.message}`);
            }
        }));
        // ── Phase 2: build the board/column mapping from live monday state ─────────
        let map = yield fetchBoardColumnMap(client, config.boards);
        mergeMapIntoConfig(map, config); // capture standard-column IDs (incl. pre-existing)
        // ── Phase 3: connect (board_relation) columns ─────────────────────────────
        // Boards are independent here, so create their connect columns in parallel.
        yield Promise.all(provisioning_schema_1.PROVISIONING_SCHEMA.map((board) => createColumnsForBoard(board, board.connectColumns, config, map, (c) => __awaiter(this, void 0, void 0, function* () {
            const targetBoardId = config.boards[c.connectTo];
            if (!targetBoardId)
                throw new Error(`target board "${c.connectTo}" not provisioned`);
            return createConnectColumn(client, config.boards[board.key], c.title, targetBoardId, c.description);
        }))));
        // Refresh so mirror creation can see the connect columns just created.
        map = yield fetchBoardColumnMap(client, config.boards);
        mergeMapIntoConfig(map, config);
        // ── Phase 4: mirror columns (all IDs resolved from the refreshed mapping) ──
        yield Promise.all(provisioning_schema_1.PROVISIONING_SCHEMA.map((board) => createColumnsForBoard(board, board.mirrorColumns, config, map, (m) => __awaiter(this, void 0, void 0, function* () {
            var _c;
            const relationCol = (_c = map[board.key]) === null || _c === void 0 ? void 0 : _c.byTitle[m.throughConnect];
            const sourceBoard = map[m.sourceBoard];
            const sourceCol = sourceBoard === null || sourceBoard === void 0 ? void 0 : sourceBoard.byTitle[m.sourceColumn];
            if (!relationCol)
                throw new Error(`connect column "${m.throughConnect}" missing`);
            if (!sourceBoard)
                throw new Error(`source board "${m.sourceBoard}" missing`);
            if (!sourceCol)
                throw new Error(`source column "${m.sourceColumn}" missing on "${m.sourceBoard}"`);
            return createMirrorColumn(client, config.boards[board.key], m.title, relationCol.id, sourceBoard.boardId, sourceCol.id, m.description);
        }))));
        config.provisioned = true;
        yield (0, account_store_1.saveAccountConfig)(accountId, config);
        console.log(`✅ Provisioning complete for account ${accountId}`);
        return config;
    });
}
// Copy every fetched column ID into config.columns[boardKey][title] so runtime
// title→ID resolution keeps working and re-runs recognize what already exists.
function mergeMapIntoConfig(map, config) {
    for (const [key, board] of Object.entries(map)) {
        config.columns[key] = config.columns[key] || {};
        for (const [title, info] of Object.entries(board.byTitle)) {
            config.columns[key][title] = info.id;
        }
    }
}
// Shared idempotent create loop for connect/mirror columns: skips any column whose
// title already exists on the board, records the new ID into config + map on success.
function createColumnsForBoard(board, defs, config, map, create) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(defs === null || defs === void 0 ? void 0 : defs.length))
            return;
        const boardId = config.boards[board.key];
        if (!boardId)
            return;
        const entry = map[board.key] || (map[board.key] = { boardId, byTitle: {} });
        for (const def of defs) {
            if (entry.byTitle[def.title])
                continue; // already exists — idempotent
            try {
                const id = yield create(def);
                if (id) {
                    config.columns[board.key] = config.columns[board.key] || {};
                    config.columns[board.key][def.title] = id;
                    entry.byTitle[def.title] = { id, type: '' };
                    console.log(`  ✅ ${def.title} on "${board.name}" (${id})`);
                }
            }
            catch (err) {
                console.error(`  ⚠️ Column "${def.title}" on "${board.name}" failed: ${err.message}`);
            }
        }
    });
}
