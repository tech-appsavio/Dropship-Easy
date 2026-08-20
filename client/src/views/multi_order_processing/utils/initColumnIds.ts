// Fills the runtime column-ID maps in ../columns.ts by resolving each board's columns
// BY TITLE (from the single source of truth, columns.ts) no hardcoded IDs. Must run
// AFTER initBoardIds.ts (board IDs must be real before columns can be looked up), and
// be awaited before any component reads a column map — see MultiOrderProcessing.tsx.
//
// The ID maps are mutated IN PLACE, so every `MAP.KEY` read across the app picks up
// the resolved IDs once this completes.
import { resolveColumnIdsByTitles } from "./mondayColumns";
import { COLUMN_REGISTRY, titleMapOf, BoardKey } from "../columns";
import { boardIdFor } from "../boardIds";

let initialized: Promise<void> | null = null;

async function resolveBoard(key: BoardKey): Promise<void> {
    const { idMap, defs } = COLUMN_REGISTRY[key];
    const boardId = boardIdFor(key);
    if (!boardId) {
        console.warn(`[initColumnIds] No board ID resolved for "${key}" — skipping column resolution.`);
        return;
    }

    const titleMap = titleMapOf(defs);
    const resolved = await resolveColumnIdsByTitles(boardId, titleMap);
    for (const col of Object.keys(titleMap)) {
        const id = (resolved as Record<string, string | undefined>)[col];
        if (id) {
            idMap[col] = id;
        } else {
            console.warn(
                `[initColumnIds] ${key}: could not resolve column "${col}" ` +
                `(title "${titleMap[col]}"). It stays empty until fixed — check the ` +
                `title in columns.ts against the real board.`
            );
        }
    }
}

// Resolves all boards' column IDs in parallel and mutates their columns.ts maps in
// place. Safe to call more than once (board column lists are cached in mondayColumns.ts).
// Never throws: a failure on one board is logged and doesn't block the others.
export function initializeColumnIds(): Promise<void> {
    if (initialized) return initialized;
    const keys = Object.keys(COLUMN_REGISTRY) as BoardKey[];
    initialized = Promise.allSettled(keys.map(resolveBoard)).then(() => undefined);
    return initialized;
}
