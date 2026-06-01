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
import {
  endpointSimilarityScreen,
  type FrameGeom,
  localToScreen,
  type PolyFrame,
  type PolyVertex,
  parseRotationFromTransform,
  recoverUnrotatedSize,
  refitFrameToPoints,
  screenToLocal,
} from "./poly-vertex-geometry.js";

export type { PolyFrame, PolyVertex } from "./poly-vertex-geometry.js";

export interface PolyShapeState {
  readonly points: ReadonlyArray<PolyVertex>;
  readonly closed: boolean;
  /** The item's frame (0..1 of parent). Vertex drags refit it to the points
   *  (DR-024 — the rubber-band follows the vertices). */
  readonly frame: PolyFrame;
}

export interface PolyVertexHandleDeps {
  readonly editor: Editor;
  /** Read the live poly state for an item, or null if it is not editable. */
  readonly getPoly: (itemId: string) => PolyShapeState | null;
  /** Item kind this VM serves. Default "shape" (the freeform `poly` sub-kind);
   *  the `line` kind registers a second instance with `itemKind:"line"`. */
  readonly itemKind?: string;
  /** Merge a refit (frame + normalized points) into the item's attrs. The
   *  point store differs by kind: `shape`/poly writes `attrs.subAttrs.points`,
   *  `line` writes `attrs.points` directly. Default = the shape behavior. */
  readonly composeAttrs?: (
    prevAttrs: Readonly<Record<string, unknown>>,
    frame: PolyFrame | undefined,
    points: ReadonlyArray<PolyVertex>,
  ) => Readonly<Record<string, unknown>>;
}

/** Default attrs-merge (shape/poly): points live under `subAttrs`. */
function defaultComposeAttrs(
  prevAttrs: Readonly<Record<string, unknown>>,
  frame: PolyFrame | undefined,
  points: ReadonlyArray<PolyVertex>,
): Readonly<Record<string, unknown>> {
  const pa = prevAttrs as Record<string, unknown> & { subAttrs?: Record<string, unknown> };
  return {
    ...pa,
    ...(frame !== undefined ? { frame } : {}),
    subAttrs: { ...(pa.subAttrs ?? {}), points },
  };
}

const VERTEX_PX = 11;
const MIDPOINT_PX = 9;

/** DOM read: derive the {@link FrameGeom} (center, un-rotated size, rotation)
 *  from the item's `[data-frame-id]` element + the SelectionLayer AABB bounds.
 *  The math is delegated to the pure `poly-vertex-geometry` kernel; only the
 *  `getComputedStyle` / `querySelector` / `offsetWidth/Height` reads live here. */
function frameGeom(itemId: string, bounds: SelectionBounds): FrameGeom {
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  const el =
    typeof document === "undefined"
      ? null
      : document.querySelector(`[data-frame-id="${CSS.escape(itemId)}"]`);
  if (el === null) return { cx, cy, w: bounds.width, h: bounds.height, theta: 0 };

  const theta = parseRotationFromTransform(getComputedStyle(el).transform);
  const fallback = { w: bounds.width, h: bounds.height };
  const { w, h } =
    el instanceof HTMLElement && el.offsetWidth > 0 && el.offsetHeight > 0
      ? recoverUnrotatedSize(bounds.width, el.offsetWidth / el.offsetHeight, theta, fallback)
      : fallback;
  return { cx, cy, w, h, theta };
}

export function createPolyVertexHandleViewModel(
  deps: PolyVertexHandleDeps,
): ItemSelectionViewModel {
  /** Start a document-level pointer loop that moves `points[idx]` to follow the
   *  cursor (rotation-aware), dispatching weave.shape.setVertices each move. */
  /** Drag `points[idx]` (rotation-aware) and REFIT the frame to follow (DR-024).
   *  Two modes by handle role:
   *    • interior vertex → free move of that one point.
   *    • OPEN-poly endpoint (first / last) → a uniform similarity (scale +
   *      rotate) of the WHOLE polyline about the OPPOSITE endpoint, so the line
   *      stretches keeping its shape (DR-024 §B). A 2-point line has only
   *      endpoints, so this degenerates to free-moving that end.
   *  Every move recomputes from the captured base (points / frame / geom) +
   *  current cursor, then dispatches one `weave.item.update` patch (frame +
   *  subAttrs.points) — the 60Hz burst folds into a single undo. */
  const beginVertexDrag = (
    itemId: string,
    idx: number,
    basePoints: ReadonlyArray<PolyVertex>,
    baseFrame: PolyFrame,
    geom: FrameGeom,
    closed: boolean,
  ): void => {
    const n = basePoints.length;
    const isEndpoint = !closed && n >= 2 && (idx === 0 || idx === n - 1);
    const anchorIdx = idx === 0 ? n - 1 : 0;
    const baseScreen = basePoints.map((p) => localToScreen(geom, p.x, p.y));
    const move = (ev: PointerEvent) => {
      let newLocal: ReadonlyArray<PolyVertex>;
      const similarity = isEndpoint
        ? endpointSimilarityScreen(baseScreen, anchorIdx, ev.clientX, ev.clientY, idx)
        : null;
      if (similarity !== null) {
        newLocal = similarity.map((s) => screenToLocal(geom, s.x, s.y));
      } else {
        // Interior vertex, or a degenerate endpoint vector → free-move that point.
        const loc = screenToLocal(geom, ev.clientX, ev.clientY);
        newLocal = basePoints.map((p, i) => (i === idx ? loc : { x: p.x, y: p.y }));
      }
      const refit = refitFrameToPoints(newLocal, baseFrame, geom.theta);
      const compose = deps.composeAttrs ?? defaultComposeAttrs;
      deps.editor.exec("weave.item.update", {
        itemId,
        patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
          attrs: compose(prev.attrs, refit.frame, refit.points),
        }),
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
  };

  /** Set the point list (no frame change) via the kind-appropriate attrs path
   *  — used by midpoint-insert / double-click-remove for shape AND line. */
  const dispatchPoints = (itemId: string, points: ReadonlyArray<PolyVertex>): void => {
    const compose = deps.composeAttrs ?? defaultComposeAttrs;
    deps.editor.exec("weave.item.update", {
      itemId,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: compose(prev.attrs, undefined, points),
      }),
    });
  };

  return {
    itemKind: deps.itemKind ?? "shape",
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
                  beginVertexDrag(info.itemId, idx, cur.points, cur.frame, geom, cur.closed);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const cur = deps.getPoly(info.itemId);
                  if (cur === null || cur.points.length <= minPoints) return;
                  const next = cur.points.filter((_, i) => i !== idx);
                  dispatchPoints(info.itemId, next);
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
                  dispatchPoints(info.itemId, inserted);
                  beginVertexDrag(info.itemId, insertAt, inserted, cur.frame, geom, cur.closed);
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
