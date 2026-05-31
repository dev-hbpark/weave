// Top-level floating selection chrome.
//
// Replaces the older in-place renderer that lived inside the selected
// element's transformed subtree — handles there inherited the design
// plane's pan + zoom scale, so they shrank to slivers when the canvas was
// zoomed out. The new layer:
//
//   1. Tracks the target via `requestAnimationFrame` (the only reliable
//      signal for getBoundingClientRect changes caused by CSS transforms
//      driven by Framer-Motion; ResizeObserver alone misses transform-only
//      changes, MutationObserver misses style-property updates on motion's
//      ref).
//   2. Renders its chrome through `createPortal` straight into
//      `document.body`, where it sits above every editor surface and is no
//      longer subject to any ancestor's transform. Handle sizes are
//      therefore measured in viewport CSS pixels — they stay constant
//      regardless of the canvas scale, which is what the user expects from
//      a "selection ring" in a design tool.
//   3. Positions handles by their *center* on the target's corners /
//      edges via `translate(-50%, -50%)`, so the visible hit-target sits
//      half inside / half outside the box for the corner cases the user
//      flagged.

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { type HandleDir, SelectionHandle } from "./SelectionHandle.js";

export interface SelectionLayerCapability {
  readonly moveable: boolean;
  readonly resizable: boolean;
  readonly rotatable: boolean;
  readonly resizeHandles: ReadonlyArray<HandleDir>;
}

// DR-018 — extension-first handle slot.
//
// Host supplies a `resolveHandles(bounds)` closure that returns the
// placements for the current bounds. SelectionLayer's rAF tracker runs
// the closure on each tick, so handles stay glued to the selection
// box as the camera animates / the design plane pans / the user
// drags. The registry + anchor math live in
// `@agocraft/editor/selection-chrome`; this file stays vanilla-React.
export interface ExternalHandlePlacement {
  /** Stable id within the list. Used as React key. */
  readonly id: string;
  /** Pre-resolved viewport coords. SelectionLayer wraps the rendered
   *  node in an absolutely-positioned container centred via
   *  `translate(-50%, -50%)` on (x, y). */
  readonly x: number;
  readonly y: number;
  /** Rendered node. */
  readonly node: ReactNode;
  /** Selected item's id. Mounted as `data-selection-handle-item-id` on
   *  the placement wrapper so gesture bindings (resize / rotate) can
   *  walk up from the click target and find the owning item without a
   *  separate lookup. */
  readonly itemId?: string;
}

export interface SelectionLayerBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface SelectionLayerProps {
  /** Element the chrome should track. The layer measures this ref's
   *  `getBoundingClientRect()` on every animation frame and renders its
   *  outline + handles at the corresponding viewport coordinates. */
  readonly targetRef: RefObject<HTMLElement | null>;
  /** DR-018 — externally-resolved handles. SelectionLayer calls this on
   *  every rAF tick with the live bounds; the returned placements
   *  render. When supplied, `capability` + legacy `onResizeStart` /
   *  `onRotateStart` props are ignored. */
  readonly resolveHandles?: (
    bounds: SelectionLayerBounds,
  ) => ReadonlyArray<ExternalHandlePlacement>;
  /** Legacy path — `capability` + start callbacks generate the built-in
   *  8-resize-handle + 1-rotation-handle chrome. Used by callers that
   *  haven't migrated to the registry yet. */
  readonly capability?: SelectionLayerCapability;
  readonly onMoveStart?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onResizeStart?: (dir: HandleDir, e: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onRotateStart?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly moveLabel?: string;
  /** WI-036 follow-up v3 — when true, the layer skips its own accent
   *  outline div and renders only the handles. The host's multi-
   *  selection bounding-box marquee owns the "selected" indicator in
   *  that mode; rendering both would draw a redundant solid line
   *  over the dashed one. Default false. */
  readonly hideOutline?: boolean;
  /** Optional override for how the tracked bounds are read from `targetRef`.
   *  Defaults to `el.getBoundingClientRect()`. A host supplies this to compose
   *  bounds from more than the target box — e.g. an auto-width text item whose
   *  box is model-sized (lags a debounce behind typing) but whose live content
   *  element tracks the text every layout pass: the host returns the content's
   *  dimension on the auto axis and the box's on the manual axis, so the chrome
   *  hugs the text live without waiting for the model to catch up. Runs every
   *  rAF tick, so it must be cheap (a couple of `getBoundingClientRect`s). */
  readonly boundsOf?: (target: HTMLElement) => SelectionLayerBounds;
}

interface TrackedBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function SelectionLayer({
  targetRef,
  resolveHandles,
  capability,
  // onMoveStart / moveLabel are part of the props contract but unused by this
  // impl (move is driven through the host) — kept on the type, not destructured.
  onResizeStart,
  onRotateStart,
  hideOutline,
  boundsOf,
}: SelectionLayerProps) {
  const [box, setBox] = useState<TrackedBox | null>(null);
  // Read through a ref so the rAF effect doesn't re-subscribe when the host
  // passes a fresh closure each render.
  const boundsOfRef = useRef(boundsOf);
  boundsOfRef.current = boundsOf;

  useEffect(() => {
    let raf = 0;
    let lastKey = "";
    const measure = () => {
      const el = targetRef.current;
      if (el === null) {
        if (lastKey !== "") {
          lastKey = "";
          setBox(null);
        }
      } else {
        const fn = boundsOfRef.current;
        const r = fn !== undefined ? fn(el) : el.getBoundingClientRect();
        // 0.1px quantisation kills jitter from sub-pixel float math during
        // transform animations without making the chrome visibly lag.
        const key = `${r.left.toFixed(1)}|${r.top.toFixed(1)}|${r.width.toFixed(
          1,
        )}|${r.height.toFixed(1)}`;
        if (key !== lastKey) {
          lastKey = key;
          setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
        }
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [targetRef]);

  if (typeof document === "undefined" || box === null) return null;

  return createPortal(
    <div
      data-selection-layer
      style={{
        position: "fixed",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        pointerEvents: "none",
        // Above frames, below tooltips. Tooltips/popovers (the AITooltip
        // surface, RecommendationPopover) sit at z 50; this 40 keeps
        // chrome interactive without blocking the higher overlays.
        zIndex: 40,
      }}
    >
      {/* Selection outline. `outline` (not `border`) keeps the box's hit
          area unchanged — borders would push children outward and shift
          the move-body button by 1.5px. `outlineOffset: -1` paints the
          stroke fully inside the bounds so handles centred on the corners
          still align with the visible edge.
          WI-036 follow-up v3 — `hideOutline` lets a multi-select host
          suppress this so the bounding-box dashed marquee owns the
          selected-indicator visual without a redundant solid line. */}
      {hideOutline ? null : (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            outline: "1.5px solid var(--accent)",
            outlineOffset: -1,
            pointerEvents: "none",
          }}
        />
      )}

      {/*
        The body of the box is intentionally NOT an interactive button.
        With the layer portaled to <body>, an `inset:0` move handle would
        sit above the canvas everywhere inside the selected element's
        bounds — including over shapes, contenteditable text and other
        directly-selectable inner items, swallowing every click meant
        for them. Move drag is handled in the host (NestedFrame /
        CanvasBlock) directly on the target's own `pointerdown` instead,
        which preserves the "first press selects + starts drag" gesture
        for the frame body while letting inner items receive their own
        presses normally.
       */}

      {/* DR-018 — externally-resolved handles take precedence. The
          host's resolver runs against the LIVE bounds (`box`) each
          render; SelectionLayer's rAF tick triggers re-render on
          bounds change. Shape / color / behavior all flow from the
          host. */}
      {resolveHandles !== undefined ? (
        resolveHandles(box).map((p) => (
          <div
            key={p.id}
            data-selection-handle-id={p.id}
            data-selection-handle-item-id={p.itemId}
            style={{
              position: "absolute",
              // Convert viewport-coords to layer-local coords (the
              // layer's wrapper sits at box.left/box.top, so we
              // offset by that origin).
              left: p.x - box.left,
              top: p.y - box.top,
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto",
            }}
          >
            {p.node}
          </div>
        ))
      ) : // Legacy fallback — built-in 8 resize + 1 rotate. Triggered
      // only when `resolveHandles` is omitted; eventually removed
      // once all call sites adopt the registry.
      capability !== undefined ? (
        <>
          {capability.resizable && onResizeStart
            ? capability.resizeHandles.map((dir) => (
                <SelectionHandle
                  key={dir}
                  kind={
                    dir === "n" || dir === "e" || dir === "s" || dir === "w" ? "edge" : "corner"
                  }
                  dir={dir}
                  ariaLabel={`Resize ${dir}`}
                  onPointerDown={(e) => onResizeStart(dir, e)}
                />
              ))
            : null}
          {capability.rotatable && onRotateStart ? (
            <SelectionHandle
              kind="rotation"
              ariaLabel="Rotate selection"
              onPointerDown={onRotateStart}
            />
          ) : null}
        </>
      ) : null}
    </div>,
    document.body,
  );
}
