// DR-017 Phase 3 — agocraft ⇄ weave InsertableCapability bridge.
//
// agocraft 's RubberBandBinding consumes a minimal, domain-agnostic
// capability shape: `{ recommend(rect, {containerId}), commit(rec, rect,
// {containerId, editor, sessionId}) }` with a primitive
// `NormalizedDragRect = { left, top, width, height, ratio: {x, y, width,
// height} }`.
//
// weave 's InsertableCapability is product-specific: it expects ratios
// directly plus `aspectRatio` and a `bucket` ("wide" / "square" /
// "tall") for bucketed recommendations (16:9 → slide, 1:1 → canvas,
// 9:16 → doc), and its describe-context wants `canUndo` / `canRedo`
// for history-aware suggestions.
//
// Per the decision recorded in WI-018, agocraft stays minimal; weave
// owns the bridge. This file is the one-way translation. The visual /
// popover layer is still weave-local (subscribes to vm.rubberBand) —
// agocraft 's binding only owns the gesture lifecycle.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import type {
  InsertableCapability as AgoCapability,
  InsertableRecommendation as AgoRec,
  NormalizedDragRect as AgoRect,
} from "@agocraft/editor";
import type {
  InsertableCapability as WeaveCapability,
  InsertableRecommendation as WeaveRec,
  NormalizedDragRect as WeaveRect,
} from "../insertable/types.js";
import { bucketize } from "../insertable/types.js";
import { findFramesAtPoint } from "../layer-picker/hit-test.js";

export interface RubberBandHitTestContext {
  /** Design plane size in design-pixel units — needed for the hit-test
   *  to compose item.attrs.frame ratios into absolute design coords. */
  readonly designWidth: number;
  readonly designHeight: number;
  /** Live document snapshot — closure over weave's `useDocument`
   *  state. Read at commit time so a paint between recommend and
   *  commit still resolves correctly. */
  readonly getDocument: () => AgocraftDocument | undefined;
}

function toWeaveRect(ago: AgoRect): WeaveRect {
  // `weave.NormalizedDragRect.{x, y, width, height}` are 0..1 ratios
  // against the container (so domain commit math doesn't care about
  // the design-pixel base). BUT `aspectRatio` and `bucket` must use
  // RAW host-local pixels — they describe the SHAPE of the drag
  // (square / wide / tall), which on a non-square container (e.g.
  // 1920×1080 design) cannot be recovered from the ratio pair. Pre-
  // fix bug: this adapter mixed raw px width/height into ratio fields,
  // so a literal 220×220 design-px drag bucketed as "tall" via ratio
  // 0.115×0.204 — the popover showed "square" recs (host computed
  // these from raw px via weave.normalizeDragRect) but the commit
  // path then re-recommended via this adapter and got "tall" recs,
  // failing to match the rec id the user picked. End result: first
  // commit worked (no race), subsequent commits silently dropped.
  return {
    x: ago.ratio.x,
    y: ago.ratio.y,
    width: ago.ratio.width,
    height: ago.ratio.height,
    aspectRatio: ago.width / Math.max(ago.height, 0.0001),
    bucket: bucketize(ago.width, ago.height),
  };
}

export function adaptWeaveCapabilityToAgocraft(
  weaveCap: WeaveCapability,
  editor: Editor,
  hitTest?: RubberBandHitTestContext,
): AgoCapability {
  /** WI-034 — resolve the *deepest* frame whose absolute bbox contains
   *  the drag rect's center, so an Alt+drag that lands inside a nested
   *  frame creates the new item as that frame's child (not root's).
   *  Falls back to the binding's static `containerId` when:
   *  - hit-test context is missing (caller didn't pass dimensions),
   *  - no frame covers the point (drag in pure root background),
   *  - the deepest hit IS the static container itself. */
  function resolveContainerId(agoRect: AgoRect, fallback: string): string {
    if (hitTest === undefined) return fallback;
    const doc = hitTest.getDocument();
    if (doc === undefined) return fallback;
    const cx = agoRect.left + agoRect.width / 2;
    const cy = agoRect.top + agoRect.height / 2;
    const hits = findFramesAtPoint(doc, cx, cy, hitTest.designWidth, hitTest.designHeight);
    return hits[0]?.id ?? fallback;
  }
  return {
    recommend(agoRect, { containerId }) {
      // Weave recs carry an extra `priority` field that agocraft's
      // minimal shape doesn't declare — the cast is safe because the
      // SAME object round-trips through commit (below), so the runtime
      // shape is consistent end-to-end.
      const weaveRecs = weaveCap.recommend(toWeaveRect(agoRect), {
        containerId: resolveContainerId(agoRect, containerId),
        canUndo: editor.history.canUndo(),
        canRedo: editor.history.canRedo(),
      });
      return weaveRecs as unknown as ReadonlyArray<AgoRec>;
    },
    commit(rec, agoRect, { containerId, editor: e }) {
      // Mirror cast — the rec object was originally returned by
      // weaveCap.recommend so it actually carries the WeaveRec fields
      // (priority, …) at runtime; agocraft just opaque-typed it.
      weaveCap.commit(rec as unknown as WeaveRec, toWeaveRect(agoRect), {
        containerId: resolveContainerId(agoRect, containerId),
        editor: e,
      });
    },
  };
}
