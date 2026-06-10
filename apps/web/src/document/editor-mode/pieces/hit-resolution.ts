// WI-166 P3 / DR-114 — HitPolicy pieces: pointer-hit → select / move target
// strategies the per-flavor composition files under `modes/` assemble from.
//
// Pure functions + frozen data only. Consumers never import this file
// (DR-114 §2b) — they receive a composed HitPolicy via injection.
//
// The select engine is the WI-033 A1/A2 parent-first model (formerly
// `selectFromHit` in selection-context.tsx — moved here verbatim, with the
// WI-163 `contextRootId` parameter generalized into the policy's root pick:
// the document root on free-placement flavors, the active page on
// page-bounded ones). The move side reuses the SAME resolution on
// page-bounded flavors — that single substitution, combined with
// commitFrame's once-per-gesture selection, IS the one-gesture select+move
// behavior (DR-114 §3: "통합이 Requirement 1을 자동 해결").

import type { Document as AgocraftDocument } from "@agocraft/core";
import { findTrailDeep } from "../../agocraft-mirror.js";
import type { HitMoveContext, HitPolicy, HitSelectContext } from "../types.js";

/** Direct parent id of `fromId`, or undefined when it is a top-level frame
 *  (its parent is the document root, intentionally absent from the trail)
 *  or absent from the doc. Internal twin of the keyboard-nav `parentOf`
 *  (selection-context) — kept local so the piece has no interactions-layer
 *  dependency. */
function parentIdOf(fromId: string, doc: AgocraftDocument): string | undefined {
  const trail = findTrailDeep(doc, fromId);
  if (trail === undefined || trail.length < 2) return undefined;
  const parent = trail[trail.length - 2];
  return parent === undefined ? undefined : String(parent.id);
}

/** WI-033 A1 + A2 — pure resolver from a frame click hit to the next
 *  selection, parameterized over the parent-first ROOT (`rootId`):
 *
 *  - `intent: "deep"` (Cmd/Ctrl-click) — the leaf hit, depth-blind. A deep
 *    hit ON the root (the active page) deliberately still selects it — the
 *    WI-163 escape hatch that keeps page-fill editing reachable.
 *  - `intent: "toggle"` (Shift-click) — the hit as the representative leaf
 *    (caller routes the actual multi-toggle); null when the hit is the
 *    root itself (an artboard never joins a multi-selection — WI-163).
 *  - `intent: "plain"` — "already-in-context" heuristic: once any frame on
 *    the hit's trail is the current selection or its parent, the click
 *    drills to the leaf. Otherwise parent-first: walk one level in from
 *    `rootId` (the active page) when it sits on the trail, else from the
 *    document root (trail[0]). A plain hit ON the root is a background
 *    click → null (caller clears the selection). */
export function parentFirstSelect(
  hitId: string,
  doc: AgocraftDocument,
  ctx: HitSelectContext,
  rootId: string | undefined,
): string | null {
  if (ctx.intent === "deep" || ctx.intent === "toggle") {
    if (ctx.intent === "toggle" && hitId === rootId) return null;
    return hitId;
  }
  // A plain hit on the context root (artboard) is a background click.
  if (rootId !== undefined && hitId === rootId) return null;
  const trail = findTrailDeep(doc, hitId);
  if (trail === undefined || trail.length === 0) {
    // hitId is the root itself or not in the doc — nothing to select.
    return null;
  }
  const currentId = ctx.currentId;
  // Parent of the current selection — the frame whose viewport the user is
  // currently treating as "root". Undefined when the current selection is
  // a top-level frame. The parent-of-current arm exists for the "sibling
  // pick inside the already-entered frame" path: with `text1` inside
  // `FrameA` selected, clicking sibling `text2` must select it directly —
  // `FrameA` is on `text2`'s trail and is the parent of `text1`, so the
  // click is still "in context".
  const currentParentId = currentId !== undefined ? parentIdOf(currentId, doc) : undefined;
  const inCurrentContext =
    currentId !== undefined &&
    trail.some((item) => {
      const id = String(item.id);
      return id === currentId || id === currentParentId;
    });
  if (inCurrentContext) {
    // Same context — let the click drill all the way to the leaf hit.
    return hitId;
  }
  // Different context — A1 parent-first: walk one level in from the root.
  // With an artboard context root on the trail, "one level in" starts
  // INSIDE the page (the page itself is never the parent-first pick).
  // Falls back to trail[0] when the root is absent from the trail (hit
  // outside the page — page-scoped rendering makes this unreachable, kept
  // as a safe default).
  if (rootId !== undefined) {
    const rootIdx = trail.findIndex((item) => String(item.id) === rootId);
    if (rootIdx !== -1) {
      const firstInside = trail[rootIdx + 1];
      return firstInside === undefined ? null : String(firstInside.id);
    }
  }
  const topLevel = trail[0];
  return topLevel === undefined ? null : String(topLevel.id);
}

/** Free-placement move resolution — the hit itself, climbed to its nearest
 *  movable ancestor (a layout-managed child moves its container). The
 *  pre-P3 FrameStage behavior, unchanged (무회귀). */
export function deepestMovable(hitId: string, ctx: HitMoveContext): string | null {
  const target = ctx.climbToMovable(hitId);
  return ctx.admit(target) ? target : null;
}

/** Page-bounded move resolution — the drag's move target is whatever a
 *  plain CLICK on the same hit would select (parent-first from the active
 *  page, in-context drill included), then climbed + admitted. Dragging an
 *  unselected deep child therefore aims at its page-direct ancestor, and
 *  commitFrame's once-per-gesture selection turns that into one-gesture
 *  select+move (WI-166 행동 변경 ③). A hit ON the page resolves null (the
 *  drag falls through to the rubber band — admission would also reject
 *  the stage). */
export function parentFirstMovable(
  hitId: string,
  doc: AgocraftDocument,
  ctx: HitMoveContext,
): string | null {
  const picked = parentFirstSelect(
    hitId,
    doc,
    { intent: "plain", currentId: ctx.currentId, activePageId: ctx.activePageId },
    ctx.activePageId,
  );
  if (picked === null) return null;
  const target = ctx.climbToMovable(picked);
  return ctx.admit(target) ? target : null;
}

/** HitPolicy for free-placement flavors (mixed / canvas-board): click
 *  selects parent-first from the DOCUMENT root, drag moves the deepest
 *  movable hit directly (current behavior — 무회귀). */
export const DOC_ROOT_HIT: HitPolicy = {
  selectTarget: (hitId, doc, ctx) => parentFirstSelect(hitId, doc, ctx, undefined),
  moveTarget: (hitId, _doc, ctx) => deepestMovable(hitId, ctx),
};

/** HitPolicy for page-bounded flavors (slide-deck / doc-page): click AND
 *  drag resolve parent-first from the ACTIVE PAGE — select = move target,
 *  one-gesture select+move (DR-114 §3). */
export const ACTIVE_PAGE_HIT: HitPolicy = {
  selectTarget: (hitId, doc, ctx) => parentFirstSelect(hitId, doc, ctx, ctx.activePageId),
  moveTarget: (hitId, doc, ctx) => parentFirstMovable(hitId, doc, ctx),
};
