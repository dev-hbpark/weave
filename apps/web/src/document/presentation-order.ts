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

/** WI-072 — per-frame deck membership. A frame is a slide UNLESS its
 *  `attrs.presentable` is explicitly `false`. Default (absent / true) = a slide,
 *  so existing decks are unchanged; the user opts a frame OUT via the thumbnail
 *  panel / QuickActionBar toggle. Non-frame items are never slides. */
export function isPresentableFrame(item: AgocraftItem): boolean {
  if (!FRAME_KINDS.has(item.kind)) return false;
  return (item.attrs as { presentable?: boolean }).presentable !== false;
}

/** Depth-first walk that collects every nested frame's id, in document order —
 *  EXCLUDING frames the user opted out of the deck (`presentable: false`).
 *  Phase 12d — the *design* itself is not a slide candidate; only user-authored
 *  frames are. The root document id is intentionally excluded. The walk still
 *  descends INTO an opted-out frame, so a slide frame nested inside a non-slide
 *  group frame still counts. */
export function collectPresentationIds(root: AgocraftItem): string[] {
  const out: string[] = [];
  function walk(item: AgocraftItem): void {
    for (const c of item.children) {
      if (isPresentableFrame(c)) out.push(String(c.id));
      walk(c);
    }
  }
  walk(root);
  return out;
}

/** WI-194 / DR-127 — page-bounded deck source: ONLY root-direct frames are
 *  deck candidates (page = artboard = slide). Depth ≥ 1 frames are structural
 *  groups, never slides. Deliberately IGNORES `presentable` — in page-bounded
 *  flavors structure IS the meaning, and honoring a stale `presentable: false`
 *  stamp (e.g. set while the doc was mixed) would create an invisible page
 *  with no recovery UI (slide-deck rail has no deck toggle, DR-114 §4). */
export function collectRootPageIds(root: AgocraftItem): string[] {
  const out: string[] = [];
  for (const c of root.children) {
    if (FRAME_KINDS.has(c.kind)) out.push(String(c.id));
  }
  return out;
}

/** WI-072 — frame ids the user opted OUT of the deck (`presentable: false`), in
 *  document order. The thumbnail panel renders these in a separate "non-slide"
 *  section so they stay reachable/selectable without being navigation steps. */
export function collectNonSlideFrameIds(root: AgocraftItem): string[] {
  const out: string[] = [];
  function walk(item: AgocraftItem): void {
    for (const c of item.children) {
      if (FRAME_KINDS.has(c.kind) && !isPresentableFrame(c)) out.push(String(c.id));
      walk(c);
    }
  }
  walk(root);
  return out;
}

/** WI-184 ⑪ — per-frame "Skip Slide" (PPT Hide Slide). A skipped frame STAYS
 *  in the deck/rail (badge + dimmed tile) but is excluded from present-mode
 *  stepping. Deliberately a separate attr from `presentable` — `presentable:
 *  false` removes the frame from the deck entirely (and from a slide-deck
 *  rail, which has no non-slide section), while `skipped: true` keeps it a
 *  fully editable deck member that the show just walks past. */
export function isSkippedFrame(item: AgocraftItem): boolean {
  return (item.attrs as { skipped?: boolean }).skipped === true;
}

/** WI-184 ⑪ — the present-mode step list: the effective deck order minus
 *  skipped frames. Renderers that show the DECK (thumbnail rail) keep using
 *  `effectivePresentationOrder` / `effectiveDeckOrder`; only the SHOW steps
 *  through this. WI-194 — the candidate collector is injectable so
 *  page-bounded flavors step through root pages only (DeckPolicy). */
export function presentationStepIds(
  design: Design,
  collect: (root: AgocraftItem) => ReadonlyArray<string> = collectPresentationIds,
): ReadonlyArray<string> {
  const skipped = new Set<string>();
  function walk(item: AgocraftItem): void {
    for (const c of item.children) {
      if (isSkippedFrame(c)) skipped.add(String(c.id));
      walk(c);
    }
  }
  walk(design.document.root);
  const order = effectiveDeckOrder(design, collect);
  if (skipped.size === 0) return order;
  return order.filter((id) => !skipped.has(id));
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
  return effectiveDeckOrder(design, collectPresentationIds);
}

/** WI-194 / DR-127 — `effectivePresentationOrder` with an injectable candidate
 *  collector (DeckPolicy.collectCandidateIds). The saved order may be a
 *  superset of the candidates (e.g. nested frames recorded while the doc was
 *  mixed) — reconciliation prunes anything the collector doesn't return, so
 *  the read-time filter holds regardless of how the frame was created. */
export function effectiveDeckOrder(
  design: Design,
  collect: (root: AgocraftItem) => ReadonlyArray<string>,
): ReadonlyArray<string> {
  return reconcilePresentationOrder(design.presentationOrder, collect(design.document.root));
}

/** WI-184 ⑨ — move a SET of entries as one contiguous block to the drop
 *  position (rail multi-select drag). The block keeps the members' relative
 *  deck order (NOT click order); `from`/`to` are indices in the ORIGINAL
 *  order — `from` is the tile the drag started on, `to` the drop target.
 *  Mirrors `reorder`'s splice semantics: dragging right (from < to) lands
 *  the block AFTER the target tile, dragging left lands it BEFORE. Dropping
 *  onto a member of the moved set (incl. from === to) is a no-op. Pure. */
export function reorderSet(
  order: ReadonlyArray<string>,
  moved: ReadonlySet<string>,
  from: number,
  to: number,
): ReadonlyArray<string> {
  const anchor = order[to];
  if (anchor === undefined || moved.has(anchor)) return order;
  if (from < 0 || from >= order.length) return order;
  const block = order.filter((id) => moved.has(id));
  if (block.length === 0) return order;
  const rest = order.filter((id) => !moved.has(id));
  const at = rest.indexOf(anchor) + (from < to ? 1 : 0);
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
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
