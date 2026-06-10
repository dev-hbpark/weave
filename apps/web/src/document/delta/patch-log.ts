// WI-161 — delta-persistence patch log: pure append/conflict core.
//
// The server stores a design's patch log as a single KV value: a `string[]`
// of opaque JSON-encoded Patch entries (the server never parses them — it is
// agocraft-free; the client serializes and replays). This module is the pure,
// I/O-free heart of the append endpoint, homed under `src/` so vitest covers
// it; the Vercel function in `api/designs/[id]/patches.ts` imports it (the
// same `api → src` import pattern as `api/resources/index.ts`).
//
// Optimistic concurrency (shared anonymous workspace): the client sends the log
// length it last observed (`baseCount`). If the server's current log length
// differs, another writer advanced (or a compaction cleared) the log in the
// meantime → CONFLICT. The client then falls back to a full-snapshot save
// (today's LWW behaviour), so delta is the fast path and we never regress past
// the existing last-writer-wins semantics. See DR-113.

/** Hard ceiling on log length between compactions. A well-behaved client
 *  compacts far below this (`COMPACT_THRESHOLD`); this only backstops a client
 *  that never compacts, forcing it onto the full-snapshot fallback. */
export const MAX_PATCH_LOG_ENTRIES = 500;

export type AppendPatchLogResult =
  | { readonly ok: true; readonly next: ReadonlyArray<string>; readonly count: number }
  | { readonly ok: false; readonly reason: "conflict" | "overflow"; readonly count: number };

/**
 * Pure append with an optimistic base-count guard.
 *
 * @param current   the log as currently stored (server truth)
 * @param baseCount the log length the client believed was current
 * @param incoming  the new patch entries (opaque JSON strings) to append
 * @returns `ok` with the next log + new length, or a typed failure carrying the
 *          server's actual count so the client can resync / fall back.
 */
export function appendPatchLog(
  current: ReadonlyArray<string>,
  baseCount: number,
  incoming: ReadonlyArray<string>,
): AppendPatchLogResult {
  if (current.length !== baseCount) {
    // Another writer advanced the log, or a compaction reset it. The client's
    // base is stale → it must resync (full-snapshot fallback).
    return { ok: false, reason: "conflict", count: current.length };
  }
  if (current.length + incoming.length > MAX_PATCH_LOG_ENTRIES) {
    // Log would grow past the compaction backstop → force a full snapshot.
    return { ok: false, reason: "overflow", count: current.length };
  }
  const next = [...current, ...incoming];
  return { ok: true, next, count: next.length };
}
