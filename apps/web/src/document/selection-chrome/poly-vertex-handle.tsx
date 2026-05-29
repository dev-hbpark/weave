// WI-057 Phase 2 — draggable vertex handles for the freeform `poly` shape.
//
// Registers an `ItemSelectionViewModel` for the "shape" kind that, when the
// selected shape is a `poly`, renders one draggable handle per vertex. Dragging
// a handle dispatches `weave.shape.setVertices` (ALL item mutation goes through
// a command → History; a 60Hz drag folds into one undo step via the item.attrs
// merge key). Entirely weave-side — the agocraft command + model already exist.
//
// Handles use the `freeform` selection anchor: each vertex (0..1 of the shape
// bbox) maps to a viewport point via `bounds`. Coordinate transform on drag is
// the inverse: clientXY → 0..1 of the same bounds. (Rotation: handles track the
// item's axis-aligned bbox; a rotated poly's handles are approximate — a Phase
// 2.1 follow-up, noted in WI-057.)

import type { Editor, ItemSelectionViewModel, SelectionBounds } from "@agocraft/editor";

export interface PolyVertex {
  readonly x: number;
  readonly y: number;
}

export interface PolyVertexHandleDeps {
  readonly editor: Editor;
  /** Read the live poly vertices for an item, or null if it is not a poly. */
  readonly getPolyPoints: (itemId: string) => ReadonlyArray<PolyVertex> | null;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const HANDLE_PX = 11;

export function createPolyVertexHandleViewModel(
  deps: PolyVertexHandleDeps,
): ItemSelectionViewModel {
  return {
    itemKind: "shape",
    // Render above the default resize/rotate handles where they overlap.
    priority: 10,
    applies: (info) => deps.getPolyPoints(info.itemId) !== null,
    handles(info) {
      const points = deps.getPolyPoints(info.itemId);
      if (points === null || points.length === 0) return [];
      return points.map((pt, idx) => ({
        id: `poly-vertex-${idx}`,
        order: 200,
        anchor: {
          type: "freeform" as const,
          layout: (bounds: SelectionBounds) => ({
            x: bounds.left + pt.x * bounds.width,
            y: bounds.top + pt.y * bounds.height,
          }),
        },
        render: (ctx) => {
          // Capture the bbox at render; it is stable during a vertex drag (the
          // frame box does not move — only a vertex within it does).
          const bounds = ctx.bounds;
          return (
            <button
              type="button"
              aria-label={`정점 ${idx + 1}`}
              // "custom" → the GestureRouter's resize/rotate bindings decline,
              // so our pointer handler owns the drag.
              data-handle-kind="custom"
              data-handle-id={`poly.vertex.${idx}`}
              data-testid={`poly-vertex-${idx}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const orig = deps.getPolyPoints(info.itemId);
                if (orig === null || orig[idx] === undefined) return;
                const startX = e.clientX;
                const startY = e.clientY;
                const base = orig[idx];
                const move = (ev: PointerEvent) => {
                  const dx = (ev.clientX - startX) / Math.max(1, bounds.width);
                  const dy = (ev.clientY - startY) / Math.max(1, bounds.height);
                  const next = orig.map((p, i) =>
                    i === idx
                      ? { x: clamp01(base.x + dx), y: clamp01(base.y + dy) }
                      : { x: p.x, y: p.y },
                  );
                  deps.editor.exec("weave.shape.setVertices", {
                    itemId: info.itemId,
                    points: next,
                  });
                };
                const up = () => {
                  document.removeEventListener("pointermove", move);
                  document.removeEventListener("pointerup", up);
                  document.removeEventListener("pointercancel", up);
                };
                document.addEventListener("pointermove", move);
                document.addEventListener("pointerup", up);
                document.addEventListener("pointercancel", up);
              }}
              style={{
                width: HANDLE_PX,
                height: HANDLE_PX,
                borderRadius: "50%",
                background: "var(--surface-1, #fff)",
                border: "1.5px solid var(--accent, #4f46e5)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                cursor: "move",
                padding: 0,
                touchAction: "none",
              }}
            />
          );
        },
      }));
    },
  };
}
