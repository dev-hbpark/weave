// WI-161 — delta-persistence replay: reconstruct a Document from a snapshot's
// document + an ordered patch log fetched on load.
//
// The server is agocraft-free: it stores patches as opaque JSON strings. The
// client owns (de)serialization and replay. agocraft's `applyPatch` (wrapped by
// `applyChangeToDocument`) is the single forward reducer; it takes a `Change`
// (a `Patch` + `{ transactionId, timestamp, origin }`), so replay wraps each
// stored `Patch` into a `deserialize`-origin Change and folds them in order.
// This is the exact reducer the live ChangeStream uses for in-session edits, so
// a replayed log reproduces the same Document the edits produced (locked by the
// round-trip test). See WI-156 (patch-stream completeness) + DR-113.

import type { Document as AgocraftDocument, Change, Patch } from "@agocraft/core";
import { applyChangeToDocument } from "../agocraft-mirror.js";

/** Encode a Patch for the wire / KV. Patches are pure JSON data (branded ids
 *  are plain strings at runtime; `item.create`/`item.remove` carry serialized
 *  subtrees), so this is a plain stringify — kept as a named seam so the
 *  encoding has one owner. */
export function serializePatch(patch: Patch): string {
  return JSON.stringify(patch);
}

/** Decode one stored patch entry. Returns `undefined` for a corrupt entry so a
 *  single bad row can't abort the whole replay (the caller skips it). */
export function deserializePatch(entry: string): Patch | undefined {
  try {
    const parsed = JSON.parse(entry) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as Patch).type !== "string"
    ) {
      return undefined;
    }
    return parsed as Patch;
  } catch {
    return undefined;
  }
}

/** Wrap a bare Patch into a `deserialize`-origin Change so `applyPatch` accepts
 *  it. `timestamp`/`transactionId` are replay metadata only — `applyPatch` is
 *  clock-free (it uses `opts.now`, set inside `applyChangeToDocument`) — so a
 *  deterministic index-derived value keeps replay pure and test-stable. */
function patchToReplayChange(patch: Patch, index: number): Change {
  return {
    ...patch,
    transactionId: `replay:${index}`,
    timestamp: index,
    origin: { kind: "deserialize" },
  } as Change;
}

/** Apply one bare Patch to a Document via the canonical forward reducer. The
 *  single seam shared by `replayPatches` and tests that evolve a doc patch by
 *  patch (so "live evolution" and "replay" use byte-identical apply logic). */
export function applyPatchToDocument(
  doc: AgocraftDocument,
  patch: Patch,
  index = 0,
): AgocraftDocument {
  return applyChangeToDocument(doc, patchToReplayChange(patch, index));
}

/**
 * Fold an ordered patch log onto a base document, returning the reconstructed
 * Document. Applies in array order (the log's append order == causal order). A
 * patch that fails to apply is skipped rather than aborting the whole load —
 * partial reconstruction beats a blank canvas — but this should not happen for
 * a well-formed log and is worth surfacing in DEV.
 */
export function replayPatches(
  base: AgocraftDocument,
  patches: ReadonlyArray<Patch>,
): AgocraftDocument {
  let doc = base;
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    if (patch === undefined) continue;
    try {
      doc = applyPatchToDocument(doc, patch, i);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn(`[delta-replay] skipped patch ${i} (${patch.type}) — apply failed`, err);
      }
    }
  }
  return doc;
}

/** Convenience for the load path: decode stored entries (skipping corrupt rows)
 *  then replay them onto the base document. */
export function replaySerializedPatches(
  base: AgocraftDocument,
  entries: ReadonlyArray<string>,
): AgocraftDocument {
  const patches: Patch[] = [];
  for (const entry of entries) {
    const p = deserializePatch(entry);
    if (p !== undefined) patches.push(p);
  }
  return replayPatches(base, patches);
}
