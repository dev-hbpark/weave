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
import { type JSX, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { startHandleGesture, toHandlePointer } from "./handle-gesture-runner.js";
import { boundaryOffsets, projectPointer, resolveTrackSizes } from "./layout-handle-geometry.js";
import { resizeGridAxis, setFlexGap } from "./layout-spec-edit.js";

const LINE_THICK = 3; // hit + visual thickness (screen px)

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
  // Collect DIRECT child frame boxes (a descendant [data-frame-id] whose nearest
  // [data-frame-id] ancestor IS this frame).
  const frameEl = document.querySelector<HTMLElement>(`[data-frame-id="${CSS.escape(frameId)}"]`);
  if (frameEl === null) return [];
  const childBoxes: DOMRect[] = [];
  const seen = new Set<Element>();
  for (const node of frameEl.querySelectorAll<HTMLElement>("[data-frame-id]")) {
    // only DIRECT child frames: nearest ancestor [data-frame-id] is the frame
    const parent = node.parentElement?.closest("[data-frame-id]");
    if (parent === frameEl && !seen.has(node)) {
      seen.add(node);
      childBoxes.push(node.getBoundingClientRect());
    }
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

function useFrameTick(frameId: string, getFrame: LayoutEditHandlesDeps["getFrame"]) {
  const [state, setState] = useState<{ fs: FrameScreen; info: LayoutFrameInfo } | null>(null);
  useEffect(() => {
    let raf = 0;
    let prevKey = "";
    const tick = (): void => {
      const el = document.querySelector<HTMLElement>(`[data-frame-id="${CSS.escape(frameId)}"]`);
      const info = getFrame(frameId);
      if (el === null || info === null) {
        if (prevKey !== "") {
          prevKey = "";
          setState(null);
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const fs = readFrameScreen(el);
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
        const nextGap = layout.gap + deltaDesign / Math.max(1, frameMain);
        editor.exec("weave.frame.setLayout", {
          itemId: frameId,
          layout: setFlexGap(layout, nextGap),
        });
        return;
      }
      if (layout.kind === "auto-grid") {
        // New boundary start = pointer position as a ratio from the inner start.
        const designPos = vertical ? (clientX - fs.left) / fs.zoom : (clientY - fs.top) / fs.zoom;
        const frameCross = vertical ? fs.dw : fs.dh;
        const padStart = vertical ? info.pad.l : info.pad.t;
        const ratioFromInner = designPos / Math.max(1, frameCross) - padStart;
        const avail = vertical
          ? Math.max(0, 1 - info.pad.l - info.pad.r)
          : Math.max(0, 1 - info.pad.t - info.pad.b);
        const next = resizeGridAxis(
          layout,
          vertical ? "column" : "row",
          avail,
          line.boundaryIndex,
          ratioFromInner,
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
        opacity: 0.55,
        border: "none",
        padding: 0,
        margin: 0,
        cursor: vertical ? "col-resize" : "row-resize",
        touchAction: "none",
        zIndex: 49,
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
  const lines =
    info.layout.kind === "auto-flex"
      ? flexLines(itemId, fs, info.layout)
      : info.layout.kind === "auto-grid"
        ? gridLines(fs, info.layout, info.pad)
        : [];
  if (lines.length === 0) return null;
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
