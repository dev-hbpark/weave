// WI-146 — on-canvas layout-edit handles for a selected flex/grid frame.
//
// Renders thin draggable LINES between a layout frame's children/tracks:
//   • auto-flex  → one line per inter-child boundary (main axis); drag adjusts
//     the uniform `gap` (DR-design-030: v1 = gap only).
//   • auto-grid  → one line per column boundary (vertical) + per row boundary
//     (horizontal); drag resizes the two adjacent tracks (pair-preserving).
//
// Mirrors the corner-radius handle (WI-109/DR-032): a freeform-anchored
// view-model whose render portals fixed-position elements tracked every rAF, and
// pointerdown → startHandleGesture(sink) → editor.exec. The coordinate math is
// the tested pure core (`layout-handle-geometry` + `layout-spec-edit`). The
// dispatch is the canonical `weave.frame.setLayout`.
//
// NOTE: rotation of a layout frame is assumed ~0 (layout frames are axis-aligned
// in practice); the zoom is derived from the DOM box like corner-radius.

import type { AutoFlexSpec, AutoGridSpec, LayoutSpec } from "@agocraft/core";
import type { Editor, ItemSelectionViewModel, SelectionBounds } from "@agocraft/editor";
import { SelectionChromeZ } from "@weave/design-system";
import { type JSX, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type PlaneProjection,
  planeProjection,
  type SceneItemGeom,
  sceneChildFramesOf,
  sceneGeomFor,
} from "./chrome-geom.js";
import { startHandleGesture, toHandlePointer } from "./handle-gesture-runner.js";
import { boundaryOffsets, projectPointer, resolveTrackSizes } from "./layout-handle-geometry.js";
import {
  type PaddingSide,
  resizeGridAxis,
  setFlexGap,
  setGridColumnGap,
  setGridRowGap,
  setPaddingSide,
} from "./layout-spec-edit.js";

const LINE_THICK = 3; // hit + visual thickness (screen px)
const GRIP_SIZE = 12; // gap-grip diamond size (screen px) — DR-design-031
// DR-design-033 — minimum screen-px inset a padding edge is drawn at. A ~0
// padding edge would otherwise sit ON the frame edge (over the solid selection
// ring) and produce the "외곽 점선과 실선이 겹쳐서 잘 안 보임" fringe. We instead
// pin it just INSIDE the ring (and clear of the corner resize handles) so it
// stays a grabbable handle even at 0 padding — dragging still authors from the
// live cursor, so the small resting offset costs nothing functionally.
const MIN_PADDING_EDGE_INSET_PX = 6;
// DR-design-033 — column gap grips ride a lane this far below the top edge; row
// gap grips a lane this far right of the left edge. Keeping the two axes in
// disjoint lanes (instead of both at the cross-centre) means a column-gap and a
// row-gap diamond can never stack on the same point — each stays independently
// visible + clickable, which the centred placement broke on symmetric grids.
const GRIP_LANE_PX = 18;
/** 4-side px padding (matches core FlexPadding / GridPadding shape). */
type Pad4Px = { top: number; right: number; bottom: number; left: number };

export interface LayoutFrameInfo {
  readonly layout: LayoutSpec;
  /** Padding ratios of the frame (left/right/top/bottom). */
  readonly pad: { l: number; r: number; t: number; b: number };
}

export interface LayoutEditHandlesDeps {
  readonly editor: Editor;
  /** Live read of a frame's layout + padding, or null if not a flex/grid frame. */
  readonly getFrame: (id: string) => LayoutFrameInfo | null;
}

interface FrameScreen {
  /** Frame top-left in client coords. */
  readonly left: number;
  readonly top: number;
  /** Screen size. */
  readonly w: number;
  readonly h: number;
  /** design→screen zoom (screen / offset). */
  readonly zoom: number;
  /** Unscaled design size. */
  readonly dw: number;
  readonly dh: number;
}

function readFrameScreen(el: HTMLElement): FrameScreen | null {
  const rect = el.getBoundingClientRect();
  const dw = Math.max(1, el.offsetWidth);
  const dh = Math.max(1, el.offsetHeight);
  if (rect.width <= 0 || rect.height <= 0) return null;
  const zoom = rect.width / dw;
  if (!(zoom > 0)) return null;
  return { left: rect.left, top: rect.top, w: rect.width, h: rect.height, zoom, dw, dh };
}

/** S3 / DR-138 — the frame's screen box straight from the engine scene (design
 *  px) + the live design-plane projection. Layout frames are axis-aligned in
 *  practice (rotation ~0), so the unrotated box top-left is the screen top-left. */
function frameScreenFromScene(g: SceneItemGeom, proj: PlaneProjection): FrameScreen {
  const zoom = proj.scale;
  return {
    left: proj.left + (g.cx - g.w / 2) * zoom,
    top: proj.top + (g.cy - g.h / 2) * zoom,
    w: g.w * zoom,
    h: g.h * zoom,
    zoom,
    dw: g.w,
    dh: g.h,
  };
}

interface ChildBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Direct child frame screen boxes from the engine scene (no child DOM query).
 *  Returns null when the scene isn't published yet (caller falls back to DOM). */
function childBoxesFromScene(frameId: string): ChildBox[] | null {
  const proj = planeProjection();
  const childIds = sceneChildFramesOf(frameId);
  if (proj === undefined || childIds.length === 0) return null;
  const boxes: ChildBox[] = [];
  for (const id of childIds) {
    const g = sceneGeomFor(id);
    if (g === undefined) continue;
    const left = proj.left + (g.cx - g.w / 2) * proj.scale;
    const top = proj.top + (g.cy - g.h / 2) * proj.scale;
    boxes.push({ left, top, right: left + g.w * proj.scale, bottom: top + g.h * proj.scale });
  }
  return boxes;
}

/** One boundary line spec in screen coords (vertical or horizontal). */
interface LineSpec {
  readonly key: string;
  readonly axis: "column" | "row"; // column → vertical line; row → horizontal line
  readonly boundaryIndex: number; // index in the track/gap array
  /** Screen position of the line centre (x for column, y for row). */
  readonly pos: number;
  /** Cross-span start/length in screen px (the line's drawn extent). */
  readonly crossStart: number;
  readonly crossLen: number;
}

/** Flex: boundaries are the midpoints between consecutive child DOM boxes along
 *  the main axis. Returns lines + the live spec for the drag sink. */
function flexLines(frameId: string, fs: FrameScreen, spec: AutoFlexSpec): LineSpec[] {
  const row = spec.direction === "row";
  // Direct child frame boxes from the engine scene (S3 / DR-138). Fallback: walk
  // the DOM for direct child `[data-frame-id]` boxes (a descendant whose nearest
  // `[data-frame-id]` ancestor IS this frame).
  let childBoxes = childBoxesFromScene(frameId);
  if (childBoxes === null) {
    const frameEl = document.querySelector<HTMLElement>(`[data-frame-id="${CSS.escape(frameId)}"]`);
    if (frameEl === null) return [];
    const fromDom: ChildBox[] = [];
    const seen = new Set<Element>();
    for (const node of frameEl.querySelectorAll<HTMLElement>("[data-frame-id]")) {
      const parent = node.parentElement?.closest("[data-frame-id]");
      if (parent === frameEl && !seen.has(node)) {
        seen.add(node);
        const r = node.getBoundingClientRect();
        fromDom.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      }
    }
    childBoxes = fromDom;
  }
  childBoxes.sort((a, b) => (row ? a.left - b.left : a.top - b.top));
  const lines: LineSpec[] = [];
  for (let i = 0; i < childBoxes.length - 1; i++) {
    const a = childBoxes[i];
    const b = childBoxes[i + 1];
    if (a === undefined || b === undefined) continue;
    const pos = row ? (a.right + b.left) / 2 : (a.bottom + b.top) / 2;
    lines.push({
      key: `flex-${i}`,
      axis: row ? "column" : "row",
      boundaryIndex: i,
      pos,
      crossStart: row ? fs.top : fs.left,
      crossLen: row ? fs.h : fs.w,
    });
  }
  return lines;
}

/** Grid: column + row track boundaries from resolved track sizes. */
function gridLines(fs: FrameScreen, spec: AutoGridSpec, pad: LayoutFrameInfo["pad"]): LineSpec[] {
  const lines: LineSpec[] = [];
  const colAvail = Math.max(0, 1 - pad.l - pad.r);
  const rowAvail = Math.max(0, 1 - pad.t - pad.b);
  const colSizes = resolveTrackSizes(spec.columns, spec.columnGap, colAvail);
  const rowSizes = resolveTrackSizes(spec.rows, spec.rowGap, rowAvail);
  const colB = boundaryOffsets(colSizes, spec.columnGap);
  const rowB = boundaryOffsets(rowSizes, spec.rowGap);
  colB.forEach((off, i) => {
    const xRatio = pad.l + off; // from frame left
    lines.push({
      key: `grid-col-${i}`,
      axis: "column",
      boundaryIndex: i,
      pos: fs.left + xRatio * fs.w,
      crossStart: fs.top + pad.t * fs.h,
      crossLen: (1 - pad.t - pad.b) * fs.h,
    });
  });
  rowB.forEach((off, i) => {
    const yRatio = pad.t + off;
    lines.push({
      key: `grid-row-${i}`,
      axis: "row",
      boundaryIndex: i,
      pos: fs.top + yRatio * fs.h,
      crossStart: fs.left + pad.l * fs.w,
      crossLen: (1 - pad.l - pad.r) * fs.w,
    });
  });
  return lines;
}

/** WI-219 — one draggable padding edge (the inner inset line of one frame side). */
interface PaddingEdgeSpec {
  readonly key: string;
  readonly side: PaddingSide;
  /** vertical line (left/right edge) vs horizontal line (top/bottom edge). */
  readonly vertical: boolean;
  /** Screen pos of the line (x for vertical, y for horizontal). */
  readonly pos: number;
  /** Drawn extent along the cross axis (inset by the perpendicular paddings so the
   *  line stays in the inner region, clear of the corner resize grips). */
  readonly crossStart: number;
  readonly crossLen: number;
}

/** The 4 padding edges of a flex/grid frame, at the current padded inset.
 *  DR-design-033 — each side's inset is clamped to ≥ MIN_PADDING_EDGE_INSET_PX
 *  (screen px) so a ~0 padding edge renders just INSIDE the selection ring
 *  (never on it) and clear of the corner resize handles, staying grabbable. The
 *  cross-axis extent uses the same clamped insets so the line never reaches the
 *  corners. Drag math reads the live cursor, so this resting offset is visual
 *  only. */
function paddingEdges(fs: FrameScreen, pad: LayoutFrameInfo["pad"]): PaddingEdgeSpec[] {
  const m = MIN_PADDING_EDGE_INSET_PX;
  const leftPx = Math.max(m, pad.l * fs.w);
  const rightPx = Math.max(m, pad.r * fs.w);
  const topPx = Math.max(m, pad.t * fs.h);
  const bottomPx = Math.max(m, pad.b * fs.h);
  const innerTop = fs.top + topPx;
  const innerH = Math.max(0, fs.h - topPx - bottomPx);
  const innerLeft = fs.left + leftPx;
  const innerW = Math.max(0, fs.w - leftPx - rightPx);
  return [
    {
      key: "pad-left",
      side: "left",
      vertical: true,
      pos: fs.left + leftPx,
      crossStart: innerTop,
      crossLen: innerH,
    },
    {
      key: "pad-right",
      side: "right",
      vertical: true,
      pos: fs.left + fs.w - rightPx,
      crossStart: innerTop,
      crossLen: innerH,
    },
    {
      key: "pad-top",
      side: "top",
      vertical: false,
      pos: fs.top + topPx,
      crossStart: innerLeft,
      crossLen: innerW,
    },
    {
      key: "pad-bottom",
      side: "bottom",
      vertical: false,
      pos: fs.top + fs.h - bottomPx,
      crossStart: innerLeft,
      crossLen: innerW,
    },
  ];
}

/** WI-219 — one grid gap grip (diamond) centered in a gap band. */
interface GapGripSpec {
  readonly key: string;
  readonly axis: "column" | "row";
  readonly boundaryIndex: number;
  /** Screen centre. */
  readonly cx: number;
  readonly cy: number;
}

/** Grid gap grips: one per column boundary (drag x → columnGap) + per row boundary
 *  (drag y → rowGap), each centered in the inner region of the cross axis so it is
 *  visually + hit-wise distinct from the full-extent track-boundary line. */
function gridGapGrips(
  fs: FrameScreen,
  spec: AutoGridSpec,
  pad: LayoutFrameInfo["pad"],
): GapGripSpec[] {
  const grips: GapGripSpec[] = [];
  const colAvail = Math.max(0, 1 - pad.l - pad.r);
  const rowAvail = Math.max(0, 1 - pad.t - pad.b);
  const colSizes = resolveTrackSizes(spec.columns, spec.columnGap, colAvail);
  const rowSizes = resolveTrackSizes(spec.rows, spec.rowGap, rowAvail);
  const colB = boundaryOffsets(colSizes, spec.columnGap);
  const rowB = boundaryOffsets(rowSizes, spec.rowGap);
  // DR-design-033 — disjoint lanes: column grips hug the TOP, row grips the
  // LEFT, so a column-gap and a row-gap diamond never stack on the same point
  // (which happened at the cross-centre for symmetric grids — the user couldn't
  // tell them apart or grab the lower one). Each axis now sits in its own lane.
  const innerTopPx = fs.top + pad.t * fs.h;
  const innerLeftPx = fs.left + pad.l * fs.w;
  const innerHpx = rowAvail * fs.h;
  const innerWpx = colAvail * fs.w;
  const colLaneY = innerTopPx + Math.min(GRIP_LANE_PX, innerHpx / 2);
  const rowLaneX = innerLeftPx + Math.min(GRIP_LANE_PX, innerWpx / 2);
  colB.forEach((off, i) => {
    grips.push({
      key: `gap-col-${i}`,
      axis: "column",
      boundaryIndex: i,
      cx: fs.left + (pad.l + off) * fs.w,
      cy: colLaneY,
    });
  });
  rowB.forEach((off, i) => {
    grips.push({
      key: `gap-row-${i}`,
      axis: "row",
      boundaryIndex: i,
      cx: rowLaneX,
      cy: fs.top + (pad.t + off) * fs.h,
    });
  });
  return grips;
}

function useFrameTick(frameId: string, getFrame: LayoutEditHandlesDeps["getFrame"]) {
  const [state, setState] = useState<{ fs: FrameScreen; info: LayoutFrameInfo } | null>(null);
  useEffect(() => {
    let raf = 0;
    let prevKey = "";
    const tick = (): void => {
      const info = getFrame(frameId);
      // Scene path (S3 / DR-138): frame box from the published scene + the live
      // design-plane projection. Fallback: measure the rendered element.
      const g = sceneGeomFor(frameId);
      const proj = planeProjection();
      const el =
        g !== undefined && proj !== undefined
          ? null
          : document.querySelector<HTMLElement>(`[data-frame-id="${CSS.escape(frameId)}"]`);
      if (
        info === null ||
        (g === undefined && el === null) ||
        (proj === undefined && el === null)
      ) {
        if (prevKey !== "") {
          prevKey = "";
          setState(null);
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const fs =
        g !== undefined && proj !== undefined
          ? frameScreenFromScene(g, proj)
          : el !== null
            ? readFrameScreen(el)
            : null;
      if (fs === null) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const key = `${fs.left.toFixed(1)},${fs.top.toFixed(1)},${fs.w.toFixed(1)},${fs.h.toFixed(1)}#${JSON.stringify(info.layout)}`;
      if (key !== prevKey) {
        prevKey = key;
        setState({ fs, info });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frameId, getFrame]);
  return state;
}

function LayoutLine({
  frameId,
  line,
  fs,
  info,
  editor,
}: {
  readonly frameId: string;
  readonly line: LineSpec;
  readonly fs: FrameScreen;
  readonly info: LayoutFrameInfo;
  readonly editor: Editor;
}): JSX.Element {
  const vertical = line.axis === "column";

  const onPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const layout = info.layout;
    const write = (clientX: number, clientY: number): void => {
      if (layout.kind === "auto-flex") {
        // Gap follows the pointer: design-px offset of the pointer from the line's
        // start position, as a ratio of the frame main size, added to the start gap.
        const mainClient = layout.direction === "row" ? clientX : clientY;
        const frameMain = layout.direction === "row" ? fs.dw : fs.dh;
        const deltaDesign = projectPointer(
          mainClient,
          0,
          { x: line.pos, y: 0 },
          { x: 1, y: 0 },
          fs.zoom,
        );
        // Boundary k sits at offset = padStart + Σchild + (k+0.5)·gap, so a uniform
        // gap change Δ moves it by (k+0.5)·Δ. Divide by (k+0.5) so the dragged
        // boundary follows the cursor 1:1 (no grow children); without it the common
        // 2-child case moves at half the cursor speed.
        const factor = line.boundaryIndex + 0.5;
        // WI-043 P5 — author a FIXED-px gap (Figma). The pointer delta is design
        // px, so gapPx grows by deltaDesign/factor directly. A ratio mirror
        // (gapPx ÷ the frame's current main px) keeps the immediate (no-dims)
        // reflow correct; on a later container resize the engine reads gapPx so
        // the gap stays fixed px instead of scaling with the container.
        const gapPxNow = layout.gapPx ?? layout.gap * frameMain;
        const nextGapPx = Math.max(0, gapPxNow + deltaDesign / factor);
        const nextGapRatio = frameMain > 0 ? nextGapPx / frameMain : 0;
        editor.exec("weave.frame.setLayout", {
          itemId: frameId,
          layout: { ...setFlexGap(layout, nextGapRatio), gapPx: nextGapPx },
        });
        return;
      }
      if (layout.kind === "auto-grid") {
        // Pointer ratio from the inner start. The handle LINE sits at the gap
        // CENTRE; the dragged track's new END is gap/2 BEFORE the cursor — subtract
        // it so the boundary tracks the pointer exactly (was the "어긋남" cause).
        const designPos = vertical ? (clientX - fs.left) / fs.zoom : (clientY - fs.top) / fs.zoom;
        const frameCross = vertical ? fs.dw : fs.dh;
        const padStart = vertical ? info.pad.l : info.pad.t;
        const gap = vertical ? layout.columnGap : layout.rowGap;
        const newBoundaryStart = designPos / Math.max(1, frameCross) - padStart - gap / 2;
        const avail = vertical
          ? Math.max(0, 1 - info.pad.l - info.pad.r)
          : Math.max(0, 1 - info.pad.t - info.pad.b);
        const next = resizeGridAxis(
          layout,
          vertical ? "column" : "row",
          avail,
          line.boundaryIndex,
          newBoundaryStart,
        );
        editor.exec("weave.frame.setLayout", { itemId: frameId, layout: next });
      }
    };
    startHandleGesture({
      kind: "layout-line-drag",
      handleId: `layout-line.${line.key}`,
      itemId: frameId,
      origin: toHandlePointer(e),
      sink: {
        update: (p) => write(p.clientX, p.clientY),
        commit: (p) => write(p.clientX, p.clientY),
      },
    });
  };

  return createPortal(
    <button
      type="button"
      aria-label={vertical ? "열/간격 조절" : "행/간격 조절"}
      data-handle-kind="custom"
      data-handle-id={`layout-line.${line.key}`}
      data-testid={`layout-line-${line.key}`}
      onPointerDown={onPointerDown}
      style={{
        position: "fixed",
        left: vertical ? line.pos : line.crossStart,
        top: vertical ? line.crossStart : line.pos,
        width: vertical ? LINE_THICK : line.crossLen,
        height: vertical ? line.crossLen : LINE_THICK,
        transform: vertical ? "translateX(-50%)" : "translateY(-50%)",
        background: "var(--accent, #4f46e5)",
        // DR-design-033 — the track/gap line is a SECONDARY guide; the diamond
        // grip is the primary grab target. Softened from 0.55 → 0.42 so the
        // elevated grip clearly dominates the line.
        opacity: 0.42,
        border: "none",
        padding: 0,
        margin: 0,
        cursor: vertical ? "col-resize" : "row-resize",
        touchAction: "none",
        // LINE handle (draggable stroke) — sits below every POINT handle by the
        // SelectionChromeZ contract, so the resize / gap / corner grips on top
        // of it stay clickable.
        zIndex: SelectionChromeZ.lineHandle,
      }}
    />,
    document.body,
  );
}

const PAD_LABEL: Record<PaddingSide, string> = {
  left: "왼쪽 패딩 조절",
  right: "오른쪽 패딩 조절",
  top: "위쪽 패딩 조절",
  bottom: "아래쪽 패딩 조절",
};

function PaddingEdge({
  frameId,
  edge,
  fs,
  info,
  editor,
}: {
  readonly frameId: string;
  readonly edge: PaddingEdgeSpec;
  readonly fs: FrameScreen;
  readonly info: LayoutFrameInfo;
  readonly editor: Editor;
}): JSX.Element | null {
  const layout = info.layout;
  if (layout.kind !== "auto-flex" && layout.kind !== "auto-grid") return null;

  const onPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const side = edge.side;
    // WI-043 px-first: a padding edge follows the cursor to an ABSOLUTE inset, so
    // we author paddingPx[side] directly + mirror the ratio (px ÷ design size).
    // The engine reads paddingPx on later resize → the padding stays fixed px.
    const curPadPx: Pad4Px =
      layout.paddingPx ??
      ({
        top: layout.padding.top * fs.dh,
        right: layout.padding.right * fs.dw,
        bottom: layout.padding.bottom * fs.dh,
        left: layout.padding.left * fs.dw,
      } satisfies Pad4Px);
    const write = (clientX: number, clientY: number): void => {
      // Inset of this side from its frame edge, in design px (clamped ≥ 0).
      const px =
        side === "left"
          ? (clientX - fs.left) / fs.zoom
          : side === "right"
            ? (fs.left + fs.w - clientX) / fs.zoom
            : side === "top"
              ? (clientY - fs.top) / fs.zoom
              : (fs.top + fs.h - clientY) / fs.zoom;
      const nextPx = Math.max(0, px);
      const axisPx = side === "left" || side === "right" ? fs.dw : fs.dh;
      const nextRatio = axisPx > 0 ? nextPx / axisPx : 0;
      const specWithRatio = setPaddingSide(layout, side, nextRatio);
      const nextPadPx: Pad4Px = { ...curPadPx, [side]: nextPx };
      editor.exec("weave.frame.setLayout", {
        itemId: frameId,
        layout: { ...specWithRatio, paddingPx: nextPadPx },
      });
    };
    startHandleGesture({
      kind: "layout-padding-drag",
      handleId: `layout-pad.${edge.key}`,
      itemId: frameId,
      origin: toHandlePointer(e),
      sink: {
        update: (p) => write(p.clientX, p.clientY),
        commit: (p) => write(p.clientX, p.clientY),
      },
    });
  };

  return createPortal(
    <button
      type="button"
      aria-label={PAD_LABEL[edge.side]}
      data-handle-kind="custom"
      data-handle-id={`layout-pad.${edge.key}`}
      data-testid={`layout-pad-${edge.side}`}
      onPointerDown={onPointerDown}
      style={{
        position: "fixed",
        left: edge.vertical ? edge.pos : edge.crossStart,
        top: edge.vertical ? edge.crossStart : edge.pos,
        width: edge.vertical ? LINE_THICK : edge.crossLen,
        height: edge.vertical ? edge.crossLen : LINE_THICK,
        transform: edge.vertical ? "translateX(-50%)" : "translateY(-50%)",
        // Dashed accent → distinct from the solid gap/track lines (DR-design-031).
        backgroundImage: edge.vertical
          ? "repeating-linear-gradient(to bottom, var(--accent, #4f46e5) 0 5px, transparent 5px 9px)"
          : "repeating-linear-gradient(to right, var(--accent, #4f46e5) 0 5px, transparent 5px 9px)",
        // DR-design-033 — padding dash is a secondary guide; softened
        // 0.7 → 0.6 to match the track-line guide weight.
        opacity: 0.6,
        border: "none",
        padding: 0,
        margin: 0,
        cursor: edge.vertical ? "col-resize" : "row-resize",
        touchAction: "none",
        zIndex: SelectionChromeZ.lineHandle, // LINE handle — below point handles
      }}
    />,
    document.body,
  );
}

function GapGrip({
  frameId,
  grip,
  fs,
  info,
  editor,
}: {
  readonly frameId: string;
  readonly grip: GapGripSpec;
  readonly fs: FrameScreen;
  readonly info: LayoutFrameInfo;
  readonly editor: Editor;
}): JSX.Element | null {
  const layout = info.layout;
  if (layout.kind !== "auto-grid") return null;
  const column = grip.axis === "column";

  const onPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation();
    if (e.button !== 0) return;
    // Uniform gap follows the cursor 1:1: boundary k moves by (k+0.5)·Δgap, so
    // divide the pointer delta by (k+0.5). px-first + ratio mirror (WI-043 P5).
    const startCx = grip.cx;
    const startCy = grip.cy;
    const factor = grip.boundaryIndex + 0.5;
    const axisPx = column ? fs.dw : fs.dh;
    const gapPxNow = column
      ? (layout.columnGapPx ?? layout.columnGap * fs.dw)
      : (layout.rowGapPx ?? layout.rowGap * fs.dh);
    const write = (clientX: number, clientY: number): void => {
      const deltaDesign = projectPointer(
        column ? clientX : clientY,
        0,
        { x: column ? startCx : startCy, y: 0 },
        { x: 1, y: 0 },
        fs.zoom,
      );
      const nextGapPx = Math.max(0, gapPxNow + deltaDesign / factor);
      const nextRatio = axisPx > 0 ? nextGapPx / axisPx : 0;
      const next = column
        ? { ...setGridColumnGap(layout, nextRatio), columnGapPx: nextGapPx }
        : { ...setGridRowGap(layout, nextRatio), rowGapPx: nextGapPx };
      editor.exec("weave.frame.setLayout", { itemId: frameId, layout: next });
    };
    // touch the start coords so the closure keeps them (no live-pos drift)
    void startCy;
    startHandleGesture({
      kind: "layout-gap-grip-drag",
      handleId: `layout-gap.${grip.key}`,
      itemId: frameId,
      origin: toHandlePointer(e),
      sink: {
        update: (p) => write(p.clientX, p.clientY),
        commit: (p) => write(p.clientX, p.clientY),
      },
    });
  };

  return createPortal(
    <button
      type="button"
      aria-label={column ? "열 간격 조절" : "행 간격 조절"}
      data-handle-kind="custom"
      data-handle-id={`layout-gap.${grip.key}`}
      data-testid={`layout-gap-${grip.axis}-${grip.boundaryIndex}`}
      onPointerDown={onPointerDown}
      style={{
        position: "fixed",
        left: grip.cx,
        top: grip.cy,
        width: GRIP_SIZE,
        height: GRIP_SIZE,
        transform: "translate(-50%, -50%) rotate(45deg)", // diamond
        // DR-design-033 — OPAQUE white fill (parity with the square resize
        // handles' `#ffffff`), not the translucent `--surface-1` glass: a
        // see-through grip let the track/gap lines cross visibly through it and
        // read as hollow/unfinished. Solid fill + accent border + elevation
        // shadow makes it the obvious grab TARGET while the lines stay
        // secondary guides. radius softens the diamond tips.
        background: "#ffffff",
        border: "2px solid var(--accent, #4f46e5)",
        borderRadius: 2,
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.22)",
        padding: 0,
        margin: 0,
        cursor: column ? "col-resize" : "row-resize",
        touchAction: "none",
        // POINT handle (draggable dot) — above every line handle so the grip
        // wins its spot over the track/padding strokes it sits among.
        zIndex: SelectionChromeZ.pointHandle,
      }}
    />,
    document.body,
  );
}

function LayoutEditHandles({
  itemId,
  editor,
  getFrame,
}: {
  readonly itemId: string;
  readonly editor: Editor;
  readonly getFrame: LayoutEditHandlesDeps["getFrame"];
}): JSX.Element | null {
  const state = useFrameTick(itemId, getFrame);
  if (state === null) return null;
  const { fs, info } = state;
  const isFlex = info.layout.kind === "auto-flex";
  const isGrid = info.layout.kind === "auto-grid";
  if (!isFlex && !isGrid) return null;
  const lines = isFlex
    ? flexLines(itemId, fs, info.layout as AutoFlexSpec)
    : gridLines(fs, info.layout as AutoGridSpec, info.pad);
  // WI-219 — padding edges (both kinds) + grid gap grips (grid only). The edges
  // are always rendered (DR-design-033 — they stay grabbable even at 0 padding;
  // paddingEdges() pins them just inside the ring so they no longer overlap it).
  const edges = paddingEdges(fs, info.pad);
  const grips = isGrid ? gridGapGrips(fs, info.layout as AutoGridSpec, info.pad) : [];
  return (
    <>
      {lines.map((line) => (
        <LayoutLine
          key={line.key}
          frameId={itemId}
          line={line}
          fs={fs}
          info={info}
          editor={editor}
        />
      ))}
      {edges.map((edge) => (
        <PaddingEdge
          key={edge.key}
          frameId={itemId}
          edge={edge}
          fs={fs}
          info={info}
          editor={editor}
        />
      ))}
      {grips.map((grip) => (
        <GapGrip key={grip.key} frameId={itemId} grip={grip} fs={fs} info={info} editor={editor} />
      ))}
    </>
  );
}

/** Register for the `frame` kind; merges with the frame default chrome. Renders
 *  nothing unless the frame has an auto-flex / auto-grid layout. */
export function createLayoutEditHandlesViewModel(
  deps: LayoutEditHandlesDeps,
): ItemSelectionViewModel {
  return {
    itemKind: "frame",
    priority: 25, // above resize chrome so the thin lines win the pointer
    handles(info) {
      return [
        {
          id: "layout-edit",
          order: 250,
          anchor: {
            type: "freeform" as const,
            layout: (_b: SelectionBounds) => ({ x: -99999, y: -99999 }),
          },
          render: () => (
            <LayoutEditHandles itemId={info.itemId} editor={deps.editor} getFrame={deps.getFrame} />
          ),
        },
      ];
    },
  };
}
