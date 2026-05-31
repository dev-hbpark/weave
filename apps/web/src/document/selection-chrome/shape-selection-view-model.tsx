// Shape item selection view-model (DR-023 — moved out of FrameStage's central
// resolveHandles). The shape kind OWNS its box-transform policy by sub-kind:
//
//   • line / arrow / OPEN poly (자유선·곡선·자유곡선) — a 선: edited via the
//     per-vertex handles, so the bounding-box RESIZE handles are dropped
//     (outline + rotate stay). Vertex handles are contributed by the separate
//     `poly-vertex-handle` view-model (also itemKind "shape"; the registry
//     merges both).
//   • everything else (rectangle / ellipse / polygon / closed poly / … — a 면):
//     the full 8-resize + rotate set.
//
// Rule 6 — no switch on sub-kind in business logic; the line-type predicate is a
// single declarative test, and the handle set is chosen by data, not branched
// per kind elsewhere.

import type { ItemSelectionViewModel } from "@agocraft/editor";
import { ALL_RESIZE_DIRS, transformHandleSpecs } from "./frame-default-view-model.js";

interface ShapeSubAttrsLite {
  readonly shape?: string;
  readonly closed?: boolean;
}

export interface ShapeSelectionDeps {
  /** Read the item's live `attrs.subAttrs` (sub-kind + `closed`). */
  readonly getSubAttrs: (itemId: string) => ShapeSubAttrsLite | undefined;
}

/** True for line-type shapes (직선 / 화살표 / 자유선·곡선·자유곡선 = open poly). */
function isLineTypeShape(sa: ShapeSubAttrsLite | undefined): boolean {
  const sk = sa?.shape;
  if (sk === "line" || sk === "arrow") return true;
  if (sk === "poly" && sa?.closed === false) return true;
  return false;
}

export function createShapeSelectionViewModel(deps: ShapeSelectionDeps): ItemSelectionViewModel {
  return {
    itemKind: "shape",
    handles(info) {
      const sa = deps.getSubAttrs(info.itemId);
      // Line-type (직선 / 화살표 / 자유선·곡선·자유곡선 = open poly): NO box chrome
      // at all — no resize handles AND no rotate handle. Editing is entirely via
      // the per-vertex / endpoint handles (endpoint drag already rotates+scales
      // the line, so a box-rotate affordance is redundant). Everything else
      // (a 면): the full 8-resize + rotate set.
      const line = isLineTypeShape(sa);
      return transformHandleSpecs(line ? [] : ALL_RESIZE_DIRS, { rotate: !line });
    },
    priority: 0,
  };
}
