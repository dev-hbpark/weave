// WI-161 — delta-persistence client controller.
//
// Owns the save decision: accumulate per-change patches, and on each (debounced)
// flush either APPEND the delta to the server log, or COMPACT by sending a full
// snapshot. The transport is injected (`pushPatches` / `pushSnapshot`) so this
// orchestration is pure and unit-testable without HTTP/KV.
//
// Invariants (DR-113):
//   • Delta is the fast path; a full snapshot is sent (a) on the first save of a
//     session (`baseCount === null`), (b) when the log would cross
//     `compactThreshold`, or (c) as the fallback when an append conflicts /
//     errors. The snapshot is the whole current document, so it always supersedes
//     any buffered patches — fallback never loses data.
//   • `markSnapshotBoundary()` (wired to `weave.doc.reset` and any wholesale
//     document replace) drops the buffer and forces the next flush to snapshot.
//   • We never regress past today's LWW: every failure path ends in a full
//     snapshot save, exactly today's behaviour.

import type { Patch } from "@agocraft/core";
import { serializePatch } from "./replay.js";

/** Compact (send a fresh full snapshot, clearing the log) once the server log
 *  would reach this many entries. Well below `MAX_PATCH_LOG_ENTRIES` (the server
 *  backstop) so compaction is client-driven in the normal case. */
export const COMPACT_THRESHOLD = 50;

export type PushPatchesResult =
  | { readonly ok: true; readonly count: number }
  | { readonly ok: false };

export interface DeltaPersistDeps {
  /** Append serialized patches to the server log under the optimistic
   *  `baseCount` guard. Resolve `{ ok, count }` with the new server length, or
   *  `{ ok: false }` on conflict / overflow / network error. */
  readonly pushPatches: (
    serialized: ReadonlyArray<string>,
    baseCount: number,
  ) => Promise<PushPatchesResult>;
  /** Send the entire current document as a full snapshot (server clears the
   *  patch log). Resolve `true` on success. This is today's full-PUT path. */
  readonly pushSnapshot: () => Promise<boolean>;
  /** Override the compaction threshold (tests). */
  readonly compactThreshold?: number;
}

export interface DeltaPersistController {
  /** Record one patch produced by a change (call per ChangeStream emission). */
  readonly recordPatch: (patch: Patch) => void;
  /** Flush buffered patches (call on the debounced storage tick). */
  readonly flush: () => Promise<void>;
  /** Force the next flush to send a full snapshot and drop the buffer — wired to
   *  snapshot-boundary commands (reset) and wholesale document replaces. */
  readonly markSnapshotBoundary: () => void;
  /** Test/diagnostic: the server log length the client currently believes is
   *  authoritative (`null` = unknown → next save is a snapshot). */
  readonly baseCount: () => number | null;
  /** Test/diagnostic: number of patches buffered but not yet flushed. */
  readonly pending: () => number;
}

export function createDeltaPersistController(deps: DeltaPersistDeps): DeltaPersistController {
  const threshold = deps.compactThreshold ?? COMPACT_THRESHOLD;
  let buffer: Patch[] = [];
  // null = we don't know the server log length (fresh session / after reset /
  // after a failed snapshot) → the next save must be a full snapshot.
  let baseCount: number | null = null;
  let flushing = false;
  let flushAgain = false;

  async function doFlush(): Promise<void> {
    if (buffer.length === 0) return;
    const pending = buffer;
    buffer = [];

    // Compaction / first-save / post-boundary → full snapshot (supersedes the
    // dropped buffer; server clears the log).
    if (baseCount === null || baseCount + pending.length > threshold) {
      const ok = await deps.pushSnapshot();
      baseCount = ok ? 0 : null;
      return;
    }

    // Delta fast path.
    const serialized = pending.map(serializePatch);
    const res = await deps.pushPatches(serialized, baseCount);
    if (res.ok) {
      baseCount = res.count;
      return;
    }
    // Conflict / overflow / error → full-snapshot fallback (LWW, today's path).
    const ok = await deps.pushSnapshot();
    baseCount = ok ? 0 : null;
  }

  async function flush(): Promise<void> {
    // Serialize overlapping flushes: if one is in flight, mark and re-run after
    // so a flush triggered mid-await still gets its patches out.
    if (flushing) {
      flushAgain = true;
      return;
    }
    flushing = true;
    try {
      do {
        flushAgain = false;
        await doFlush();
      } while (flushAgain && buffer.length > 0);
    } finally {
      flushing = false;
    }
  }

  return {
    recordPatch: (patch) => {
      buffer.push(patch);
    },
    flush,
    markSnapshotBoundary: () => {
      buffer = [];
      baseCount = null;
    },
    baseCount: () => baseCount,
    pending: () => buffer.length,
  };
}
