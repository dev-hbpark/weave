// WI-057 Phase 2 / 2.1 — vertex handles for the freeform `poly` shape.
//
// When a `poly` shape is selected this renders, entirely weave-side:
//   • a solid VERTEX handle per point — drag to move (double-click to remove),
//   • a hollow MIDPOINT handle per edge — drag to insert a new vertex there.
// Every mutation goes through `weave.shape.setVertices` (→ History; a 60Hz drag
// folds into one undo via the item.attrs merge key).
//
// Rotation-aware (2.1): the poly's frame may carry `transform: rotate(θ)`. The
// `freeform` selection anchor only gives the axis-aligned bounds (AABB), so we
// read θ off the `[data-frame-id]` element and recover the un-rotated frame
// size from the element's transform-invariant aspect ratio (offsetWidth/Height)
// + one AABB equation; handle placement and the drag inverse then use the true
// rotated basis. This is exact at EVERY angle including 45° (the older AABB-only
// W,H solve was singular there — cos 2θ = 0 — and fell back to wrong positions).

import type { Editor, ItemSelectionViewModel, SelectionBounds } from "@agocraft/editor";

export interface PolyVertex {
  readonly x: number;
  readonly y: number;
}

export interface PolyShapeState {
  readonly points: ReadonlyArray<PolyVertex>;
  readonly closed: boolean;
}

export interface PolyVertexHandleDeps {
  readonly editor: Editor;
  /** Read the live poly state for an item, or null if it is not a poly. */
  readonly getPoly: (itemId: string) => PolyShapeState | null;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const VERTEX_PX = 11;
const MIDPOINT_PX = 9;

/** Center + un-rotated frame size (screen px) + rotation, derived from the
 *  item's `[data-frame-id]` element and the SelectionLayer AABB bounds. */
interface FrameGeom {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly theta: number;
}

function rotationOf(el: Element): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (m?.[1] === undefined) return 0;
  const parts = m[1].split(",").map(Number);
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return 0;
  return Math.atan2(b, a);
}

function frameGeom(itemId: string, bounds: SelectionBounds): FrameGeom {
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  const el =
    typeof document === "undefined"
      ? null
      : document.querySelector(`[data-frame-id="${CSS.escape(itemId)}"]`);
  if (el === null) return { cx, cy, w: bounds.width, h: bounds.height, theta: 0 };

  const theta = rotationOf(el);
  // Recover the UN-rotated frame size (screen px) from the element's
  // transform-invariant aspect ratio (offsetWidth/offsetHeight) + one AABB
  // equation. AABBw = W·|cos| + H·|sin| = H·(r·|cos| + |sin|) where r = W/H.
  // The denominator `r·|cos| + |sin|` is > 0 at EVERY angle, so this is exact
  // even at 45° (where solving W,H from the AABB alone is singular: cos 2θ = 0).
  let w = bounds.width;
  let h = bounds.height;
  if (el instanceof HTMLElement && el.offsetWidth > 0 && el.offsetHeight > 0) {
    const r = el.offsetWidth / el.offsetHeight;
    const denom = r * Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta));
    if (denom > 1e-6) {
      h = bounds.width / denom;
      w = r * h;
    }
  }
  return { cx, cy, w, h, theta };
}

function localToScreen(g: FrameGeom, vx: number, vy: number): { x: number; y: number } {
  const lx = (vx - 0.5) * g.w;
  const ly = (vy - 0.5) * g.h;
  const cos = Math.cos(g.theta);
  const sin = Math.sin(g.theta);
  return { x: g.cx + lx * cos - ly * sin, y: g.cy + lx * sin + ly * cos };
}

function screenToLocal(g: FrameGeom, sx: number, sy: number): { x: number; y: number } {
  const dx = sx - g.cx;
  const dy = sy - g.cy;
  const cos = Math.cos(g.theta);
  const sin = Math.sin(g.theta);
  // inverse rotation (R(-θ)) then un-scale by the frame size
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return { x: lx / Math.max(1, g.w) + 0.5, y: ly / Math.max(1, g.h) + 0.5 };
}

export function createPolyVertexHandleViewModel(
  deps: PolyVertexHandleDeps,
): ItemSelectionViewModel {
  /** Start a document-level pointer loop that moves `points[idx]` to follow the
   *  cursor (rotation-aware), dispatching weave.shape.setVertices each move. */
  const beginVertexDrag = (
    itemId: string,
    idx: number,
    basePoints: ReadonlyArray<PolyVertex>,
    geom: FrameGeom,
  ): void => {
    const move = (ev: PointerEvent) => {
      const loc = screenToLocal(geom, ev.clientX, ev.clientY);
      const next = basePoints.map((p, i) =>
        i === idx ? { x: clamp01(loc.x), y: clamp01(loc.y) } : { x: p.x, y: p.y },
      );
      deps.editor.exec("weave.shape.setVertices", { itemId, points: next });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  };

  return {
    itemKind: "shape",
    priority: 10,
    applies: (info) => deps.getPoly(info.itemId) !== null,
    handles(info) {
      const poly = deps.getPoly(info.itemId);
      if (poly === null || poly.points.length === 0) return [];
      const { points, closed } = poly;
      const minPoints = closed ? 3 : 2;
      const specs = [];

      // ── vertex handles (move / remove) ──
      for (let idx = 0; idx < points.length; idx++) {
        const pt = points[idx]!;
        specs.push({
          id: `poly-vertex-${idx}`,
          order: 200,
          anchor: {
            type: "freeform" as const,
            layout: (bounds: SelectionBounds) =>
              localToScreen(frameGeom(info.itemId, bounds), pt.x, pt.y),
          },
          render: (ctx: { bounds: SelectionBounds }) => {
            const geom = frameGeom(info.itemId, ctx.bounds);
            return (
              <button
                type="button"
                aria-label={`정점 ${idx + 1}`}
                data-handle-kind="custom"
                data-handle-id={`poly.vertex.${idx}`}
                data-testid={`poly-vertex-${idx}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const cur = deps.getPoly(info.itemId);
                  if (cur === null || cur.points[idx] === undefined) return;
                  beginVertexDrag(info.itemId, idx, cur.points, geom);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const cur = deps.getPoly(info.itemId);
                  if (cur === null || cur.points.length <= minPoints) return;
                  const next = cur.points.filter((_, i) => i !== idx);
                  deps.editor.exec("weave.shape.setVertices", {
                    itemId: info.itemId,
                    points: next,
                  });
                }}
                style={{
                  width: VERTEX_PX,
                  height: VERTEX_PX,
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
        });
      }

      // ── midpoint handles (insert a vertex on the edge, then drag it) ──
      const edgeCount = closed ? points.length : points.length - 1;
      for (let i = 0; i < edgeCount; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const insertAt = i + 1;
        specs.push({
          id: `poly-midpoint-${i}`,
          order: 190, // below vertices
          anchor: {
            type: "freeform" as const,
            layout: (bounds: SelectionBounds) =>
              localToScreen(frameGeom(info.itemId, bounds), mid.x, mid.y),
          },
          render: (ctx: { bounds: SelectionBounds }) => {
            const geom = frameGeom(info.itemId, ctx.bounds);
            return (
              <button
                type="button"
                aria-label={`정점 추가 (모서리 ${i + 1})`}
                data-handle-kind="custom"
                data-handle-id={`poly.midpoint.${i}`}
                data-testid={`poly-midpoint-${i}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const cur = deps.getPoly(info.itemId);
                  if (cur === null) return;
                  const inserted = [
                    ...cur.points.slice(0, insertAt),
                    { x: mid.x, y: mid.y },
                    ...cur.points.slice(insertAt),
                  ];
                  // Add the vertex, then let the same gesture drag it.
                  deps.editor.exec("weave.shape.setVertices", {
                    itemId: info.itemId,
                    points: inserted,
                  });
                  beginVertexDrag(info.itemId, insertAt, inserted, geom);
                }}
                style={{
                  width: MIDPOINT_PX,
                  height: MIDPOINT_PX,
                  borderRadius: "50%",
                  background: "var(--accent, #4f46e5)",
                  opacity: 0.55,
                  border: "1px solid var(--surface-1, #fff)",
                  cursor: "copy",
                  padding: 0,
                  touchAction: "none",
                }}
              />
            );
          },
        });
      }

      return specs;
    },
  };
}
