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

import { smoothPolyBounds } from "@agocraft/core";
import type {
  Editor,
  HandleCommandSink,
  HandlePointer,
  ItemSelectionViewModel,
  SelectionBounds,
} from "@agocraft/editor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@weave/design-system";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { startHandleGesture, toHandlePointer } from "./handle-gesture-runner.js";
import {
  type FrameGeom,
  localToScreen,
  type PolyFrame,
  type PolyVertex,
  parseRotationFromTransform,
  recoverUnrotatedSize,
  refitFrameToPoints,
} from "./poly-vertex-geometry.js";
import {
  applyDragStrategy,
  classifyPointHandle,
  handleBorderRadius,
  type PointHandleRole,
  type PointType,
  pointTypeOf,
  resolveDragStrategy,
  resolvePointHandle,
} from "./vertex-handle-roles.js";
import { removeVertexAndRefit } from "./vertex-ops.js";
import { useVertexSelected, vertexSelection } from "./vertex-selection.js";

export type { PolyFrame, PolyVertex } from "./poly-vertex-geometry.js";

export interface PolyShapeState {
  readonly points: ReadonlyArray<PolyVertex>;
  readonly closed: boolean;
  /** The item's frame (0..1 of parent). Vertex drags refit it to the points
   *  (DR-024 — the rubber-band follows the vertices). */
  readonly frame: PolyFrame;
  /** DR-033 — the line/poly's global `smooth` flag; a vertex with no own
   *  `smooth` falls back to it when deciding its corner/smooth type. */
  readonly smooth?: boolean;
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
  /** WI-065 / DR-031 — right-click a vertex to break the shape into a `line` at
   *  exactly that vertex ("도형의 특정 꼭지점 연결을 끊어 선으로"). Provided only
   *  for the closed-`poly` shape VM; omit for the `line` VM (already a line).
   *  The host owns the command dispatch + re-selecting the new line. */
  readonly onBreakAtVertex?: (itemId: string, vertexIndex: number) => void;
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

/** DR-033 — a single point handle. SHAPE encodes the point TYPE (smooth = round,
 *  corner = square) via the role registry; ROLE (vertex/endpoint) drives drag
 *  behavior (Rule 6 — resolved in the registry, no inline branching). Label /
 *  tooltip come from the role adapter. Double-click toggles type; right-click
 *  opens the vertex menu. */
/** forwardRef + `...rest` spread so the `ContextMenuTrigger asChild` wrapper can
 *  inject its ref + `onContextMenu` onto the underlying <button> (Radix Slot). */
const VertexHandle = forwardRef<
  HTMLButtonElement,
  {
    readonly itemId: string;
    readonly idx: number;
    readonly role: PointHandleRole;
    readonly pointType: PointType;
    readonly onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
    readonly onDoubleClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  } & ComponentPropsWithoutRef<"button">
>(function VertexHandle(
  { itemId, idx, role, pointType, onPointerDown, onDoubleClick, ...rest },
  ref,
) {
  const adapter = resolvePointHandle(role);
  const selected = useVertexSelected(itemId, idx); // WI-069 — reactive highlight
  // WI-069 — a SELECTED vertex is filled with the accent + a white ring and
  // slightly enlarged, so the active point (the Delete target) is unmistakable.
  const size = selected ? VERTEX_PX + 3 : VERTEX_PX;
  return (
    <button
      type="button"
      ref={ref}
      aria-label={`${adapter.label(idx)}${selected ? " (선택됨)" : ""}`}
      title={adapter.title}
      data-handle-kind="custom"
      data-handle-id={`poly.vertex.${idx}`}
      data-handle-role={role}
      data-point-type={pointType}
      data-selected={selected ? "true" : undefined}
      data-testid={`poly-vertex-${idx}`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      {...rest}
      style={{
        width: size,
        height: size,
        borderRadius: handleBorderRadius(pointType), // smooth → circle, corner → square
        background: selected ? "var(--accent, #4f46e5)" : "var(--surface-1, #fff)",
        border: selected
          ? "2px solid var(--surface-1, #fff)"
          : "1.5px solid var(--accent, #4f46e5)",
        boxShadow: selected
          ? "0 0 0 1.5px var(--accent, #4f46e5), 0 1px 3px rgba(0,0,0,0.25)"
          : "0 1px 3px rgba(0,0,0,0.18)",
        cursor: "move",
        padding: 0,
        touchAction: "none",
      }}
    />
  );
});

export function createPolyVertexHandleViewModel(
  deps: PolyVertexHandleDeps,
): ItemSelectionViewModel {
  /** Start a document-level pointer loop that moves `points[idx]` to follow the
   *  cursor (rotation-aware), dispatching weave.shape.setVertices each move. */
  /** Drag `points[idx]` (rotation-aware) and REFIT the frame to follow (DR-024).
   *  DR-032 — interaction runs through the uniform handle pipeline: the handle's
   *  pointerdown starts a `vertex-drag` gesture (per-handle FSM) and this VM only
   *  supplies the SINK. The sink's `update` resolves the drag strategy per move
   *  from the role registry — `resolveDragStrategy(role, p.altKey)` is the single
   *  gate that picks free-move vs endpoint-stretch (Rule 6) and lets the modifier
   *  toggle mid-drag. Each update dispatches one `weave.item.update` (frame +
   *  points); the 60Hz burst folds into a single undo via the merge key. The
   *  document-pointer loop lives in `startHandleGesture`, not here. */
  const beginVertexDrag = (
    itemId: string,
    idx: number,
    basePoints: ReadonlyArray<PolyVertex>,
    baseFrame: PolyFrame,
    geom: FrameGeom,
    closed: boolean,
    origin: HandlePointer,
    // WI-067 P4 — midpoint passes "vertex-insert" (the vertex was just inserted;
    // the gesture then drags it). Plain vertices use "vertex-drag". Both share
    // the drag FSM; the distinct kind keeps the handles individually registered.
    kind: "vertex-drag" | "vertex-insert" = "vertex-drag",
  ): void => {
    const n = basePoints.length;
    const adapter = resolvePointHandle(classifyPointHandle(idx, n, closed));
    const anchorIdx = idx === 0 ? n - 1 : 0;
    const baseScreen = basePoints.map((p) => localToScreen(geom, p.x, p.y));
    const compose = deps.composeAttrs ?? defaultComposeAttrs;
    const sink: HandleCommandSink = {
      update: (p) => {
        const strategy = resolveDragStrategy(adapter, p.altKey);
        const newLocal = applyDragStrategy(strategy, {
          basePoints,
          baseScreen,
          idx,
          anchorIdx,
          geom,
          clientX: p.clientX,
          clientY: p.clientY,
        });
        const refit = refitFrameToPoints(newLocal, baseFrame, geom.theta);
        deps.editor.exec("weave.item.update", {
          itemId,
          patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
            attrs: compose(prev.attrs, refit.frame, refit.points),
          }),
        });
      },
    };
    startHandleGesture({
      kind,
      handleId: `poly.vertex.${idx}`,
      itemId,
      origin,
      sink,
    });
  };

  /** Set the point list (no frame change) via the kind-appropriate attrs path
   *  — used by midpoint-insert / remove / point-type toggle for shape AND line. */
  const dispatchPoints = (itemId: string, points: ReadonlyArray<PolyVertex>): void => {
    const compose = deps.composeAttrs ?? defaultComposeAttrs;
    deps.editor.exec("weave.item.update", {
      itemId,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: compose(prev.attrs, undefined, points),
      }),
    });
  };

  /** DR-033 — flip a vertex between corner ↔ smooth (sets its explicit `smooth`
   *  to the opposite of its current EFFECTIVE type). One path can then mix
   *  straight + curved segments. */
  const togglePointType = (itemId: string, idx: number): void => {
    const cur = deps.getPoly(itemId);
    const pt = cur?.points[idx];
    if (cur === null || cur === undefined || pt === undefined) return;
    const defaultSmooth = cur.smooth ?? false;
    const nowSmooth = pt.smooth ?? defaultSmooth;
    const next = cur.points.map((q, i) => (i === idx ? { ...q, smooth: !nowSmooth } : q));
    // DR-033 / WI-069 — refit the frame to the GEOMETRY: when the path curves
    // anywhere, fit the curve's bbox (overshoot included) so the rubber-band
    // wraps the curve; all-corner → tighten to the points. (Same as drag.)
    const curvey = next.some((p) => (p.smooth ?? defaultSmooth) === true);
    const bounds = curvey
      ? (smoothPolyBounds(next, cur.closed, defaultSmooth) ?? undefined)
      : undefined;
    const refit = refitFrameToPoints(next, cur.frame, cur.frame.rotation ?? 0, bounds);
    const compose = deps.composeAttrs ?? defaultComposeAttrs;
    deps.editor.exec("weave.item.update", {
      itemId,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: compose(prev.attrs, refit.frame, refit.points),
      }),
    });
  };

  /** Remove a vertex (vertex right-click menu). Refits the frame to the
   *  survivors via the shared `removeVertexAndRefit` (DR-024). */
  const removeVertex = (itemId: string, idx: number): void => {
    const cur = deps.getPoly(itemId);
    if (cur === null) return;
    removeVertexAndRefit(
      deps.editor,
      {
        itemId,
        isLine: (deps.itemKind ?? "shape") === "line",
        points: cur.points,
        closed: cur.closed,
        frame: cur.frame,
      },
      idx,
    );
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

      // ── vertex handles (move / toggle type / right-click menu) ──
      const globalSmooth = poly.smooth ?? false;
      for (let idx = 0; idx < points.length; idx++) {
        const pt = points[idx]!;
        // WI-066 — classify the handle's role once; the registry owns the rest
        // (label, drag strategy). DR-033 — shape comes from the point TYPE.
        const role = classifyPointHandle(idx, points.length, closed);
        const pointType = pointTypeOf(pt.smooth, globalSmooth);
        const removable = points.length > minPoints;
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
            const handle = (
              <VertexHandle
                itemId={info.itemId}
                idx={idx}
                role={role}
                pointType={pointType}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  // WI-069 — primary press selects this vertex (Delete target).
                  if (e.button === 0) vertexSelection.set({ itemId: info.itemId, index: idx });
                  const cur = deps.getPoly(info.itemId);
                  if (cur === null || cur.points[idx] === undefined) return;
                  beginVertexDrag(
                    info.itemId,
                    idx,
                    cur.points,
                    cur.frame,
                    geom,
                    cur.closed,
                    toHandlePointer(e),
                  );
                }}
                // DR-033 — double-click toggles corner ↔ smooth.
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  togglePointType(info.itemId, idx);
                }}
              />
            );
            // Right-click → vertex menu: 전환 · 선으로 끊기(도형) · 삭제.
            return (
              <ContextMenu>
                <ContextMenuTrigger asChild>{handle}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    data-testid={`vtx-toggle-${idx}`}
                    onSelect={() => togglePointType(info.itemId, idx)}
                  >
                    {pointType === "smooth" ? "각진 점으로" : "곡선 점으로"}
                  </ContextMenuItem>
                  {deps.onBreakAtVertex !== undefined && (
                    <ContextMenuItem
                      data-testid={`vtx-break-${idx}`}
                      onSelect={() => deps.onBreakAtVertex?.(info.itemId, idx)}
                    >
                      선으로 끊기
                    </ContextMenuItem>
                  )}
                  {removable && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="danger"
                        data-testid={`vtx-remove-${idx}`}
                        onSelect={() => removeVertex(info.itemId, idx)}
                      >
                        꼭지점 삭제
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
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
                  // WI-067 P4 — insert the vertex, then drag it via the
                  // distinct `vertex-insert` interaction.
                  dispatchPoints(info.itemId, inserted);
                  beginVertexDrag(
                    info.itemId,
                    insertAt,
                    inserted,
                    cur.frame,
                    geom,
                    cur.closed,
                    toHandlePointer(e),
                    "vertex-insert",
                  );
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
