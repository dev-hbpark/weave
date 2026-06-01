// WI-069 — shared vertex removal. Single source for BOTH the vertex right-click
// menu and the Delete-key handler, so removal always REFITS the frame to the
// survivors (DR-024 — the rubber-band follows the vertices) instead of leaving
// a stale box. Min guard: closed ≥ 3 / open ≥ 2. One weave.item.update = one undo.

import type { Editor } from "@agocraft/editor";
import { type PolyFrame, type PolyVertex, refitFrameToPoints } from "./poly-vertex-geometry.js";

export interface RemovableVertexState {
  readonly itemId: string;
  /** `line` writes `attrs.points`; `shape`/poly writes `attrs.subAttrs.points`. */
  readonly isLine: boolean;
  readonly points: ReadonlyArray<PolyVertex>;
  readonly closed: boolean;
  readonly frame: PolyFrame;
}

/** Remove vertex `idx`, refit the frame to the remaining points, and write both
 *  in one patch (no-op below the min). Rotated frames keep their box (refit
 *  clamps points only — same as the drag path). */
export function removeVertexAndRefit(editor: Editor, s: RemovableVertexState, idx: number): void {
  const min = s.closed ? 3 : 2;
  if (idx < 0 || idx >= s.points.length || s.points.length <= min) return;
  const next = s.points.filter((_, i) => i !== idx);
  const refit = refitFrameToPoints(next, s.frame, s.frame.rotation ?? 0);
  const framePatch = refit.frame !== undefined ? { frame: refit.frame } : {};
  editor.exec("weave.item.update", {
    itemId: s.itemId,
    patch: (prev: { attrs: Record<string, unknown> }) => ({
      attrs: s.isLine
        ? { ...prev.attrs, ...framePatch, points: refit.points }
        : {
            ...prev.attrs,
            ...framePatch,
            subAttrs: { ...(prev.attrs.subAttrs as object), points: refit.points },
          },
    }),
  });
}
