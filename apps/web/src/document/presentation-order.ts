// Phase 10c / Phase 11 — presentation order is an array of frame ids (the
// root document id plus every nested domain frame's id) that lives on
// `Design.presentationOrder`, independent of the parent-child tree. The
// bottom thumbnail panel renders it in this order, and presentation mode
// steps through it. A reorder updates the array; the tree stays put.
//
// `reconcilePresentationOrder` is called every time we render or save —
// stale ids (frames that no longer exist) are pruned, missing ids
// (newly-added frames) are appended. Reorder happens via a fresh array.
//
// Phase 11 paradigm shift: in the Figma Frame model every domain Item is a
// frame (slide / canvas-design / block-doc / media — all equal), so the walk
// collects all of them, at any depth. The standalone `sub-doc` kind is gone.

import type { Item as AgocraftItem } from "@agocraft/core";
import type { Design } from "./types.js";

/** Kinds that count as navigable frames (slide-equivalents). Items of other
 *  kinds (image / video / shape) are visual content, not navigation targets,
 *  and are skipped when building the presentation step list. Exported for
 *  reuse by present-mode renderers that need the same partition.
 *
 *  WI-032 Phase 3c — `frame` replaces the legacy 4. */
export const FRAME_KINDS: ReadonlySet<string> = new Set(["frame"]);

/** Depth-first walk that collects every nested frame's id, in document
 *  order. Phase 12d — the *design* itself is not a slide candidate; only
 *  the user-authored frames are. The root document id is intentionally
 *  excluded. */
export function collectPresentationIds(root: AgocraftItem): string[] {
  const out: string[] = [];
  function walk(item: AgocraftItem): void {
    for (const c of item.children) {
      if (FRAME_KINDS.has(c.kind)) out.push(String(c.id));
      walk(c);
    }
  }
  walk(root);
  return out;
}

/** Reconcile a saved order against what's actually in the tree. Stale ids
 *  drop out; missing ids land at the end in document order. Pure. */
export function reconcilePresentationOrder(
  saved: ReadonlyArray<string>,
  present: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const presentSet = new Set(present);
  const kept = saved.filter((id) => presentSet.has(id));
  const keptSet = new Set(kept);
  const appended = present.filter((id) => !keptSet.has(id));
  return [...kept, ...appended];
}

/** Derived order for the current design — collect tree ids, reconcile against
 *  saved order. Use this in renderers and presentation mode. */
export function effectivePresentationOrder(design: Design): ReadonlyArray<string> {
  const present = collectPresentationIds(design.document.root);
  return reconcilePresentationOrder(design.presentationOrder, present);
}

/** Move the entry at `from` to `to`. Bounds-checked; out-of-range returns the
 *  input unchanged. */
export function reorder(
  order: ReadonlyArray<string>,
  from: number,
  to: number,
): ReadonlyArray<string> {
  if (from < 0 || from >= order.length) return order;
  if (to < 0 || to >= order.length) return order;
  if (from === to) return order;
  const next = order.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return order;
  next.splice(to, 0, moved);
  return next;
}
