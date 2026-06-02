// Phase 11b / 12a — the Figma-style frame canvas.
//
// Design space is an absolute pixel rectangle (design.width × design.height).
// FrameStage owns an outer wrapper that fits the viewport and uses a CSS
// `transform: scale(...)` (driven by ResizeObserver) so the design-plane
// inside renders at its native pixel size and gets uniformly scaled to the
// available width. Two consequences:
//
//   1. Every Frame's *content* (typography, padding, etc.) is authored in
//      design-pixel units. Frames don't clip text just because they happen
//      to be small fractions of the design — the whole plane scales as a
//      unit, so a 0.2-wide frame renders at 0.2 × design.width px.
//   2. Frame positioning becomes ordinary px arithmetic — `frame.x * parentW`
//      — and recurses naturally for nested frames.

import type { Document as AgocraftDocument, Item as AgocraftItem, ItemId } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import {
  createFrameMoveBinding,
  createModifierOverride,
  createPanBinding,
  createRubberBandBinding,
  type FrameAccess,
  type FrameGeom,
  GESTURE_PRIORITY_ELEMENT_BODY,
  GESTURE_PRIORITY_FALLBACK,
  type ResizeDir,
} from "@agocraft/editor";
import { motion, useMotionValue } from "motion/react";
import type React from "react";
import {
  type CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ItemFrame } from "../document";
import {
  useFrameDragBindingsAllowed,
  useFrameSelectionAllowed,
  useInteractionMode,
} from "../document";
import { isDomainItem } from "../document/agocraft-mirror.js";
import { resizeCropWindow, setStraighten } from "../document/crop-geometry.js";
import { defaultInsertableRegistry } from "../document/insertable/default-registry.js";
import { croppingState } from "../document/interactions/cropping-state.js";
import { EditorVMContext } from "../document/interactions/editor-vm-context.js";
import { useRouterOrNull } from "../document/interactions/router-context.js";
import { TotalScaleContext } from "../document/interactions/total-scale-context.js";
import { ViewportCullContext } from "../document/interactions/viewport-cull-context.js";
import { findFramesAtPoint, type LayerHit } from "../document/layer-picker/index.js";
// WI-019/WI-021 — layout-driven manipulation constraints. The agocraft
// LayoutEngine is the single owner: weave only READS
// `getChildConstraints` and reflects it in the selection chrome (resize
// handles) + move gate. No layout branching lives here.
import { getLayoutEngine, LAYOUT_FEATURE_ENABLED } from "../document/layout/registry.js";
import { MarqueeSelectionLayer } from "../document/marquee/MarqueeSelectionLayer.js";
import { snapRotation } from "../document/rotation-snap.js";
import { adaptWeaveCapabilityToAgocraft } from "../document/rubber-band/agocraft-adapter.js";
import { RubberBandLayer } from "../document/rubber-band/RubberBandLayer.js";
import { createFrameMoveSnap } from "../document/selection-chrome/frame-move-snap.js";
// DR-032 / WI-067 P3 — resize/rotate handles run through the uniform handle
// interaction pipeline (createFrameResizeBinding/createFrameRotateBinding
// retired from the GestureRouter).
import {
  startHandleGesture,
  toHandlePointer,
} from "../document/selection-chrome/handle-gesture-runner.js";
import { rotationSnapFeedback } from "../document/selection-chrome/rotation-snap-feedback.js";

import { type DesignBox, setCameraFitBox } from "./frame-camera-bridge.js";

/** WI-033 A4 — context passed to `renderFrameMenu` so the callback
 *  (typically a per-frame ContextMenu) can render a Layer Picker
 *  section listing every frame overlapping the right-clicked point.
 *  Empty `layers` → the section is elided. */
import { nextPanForZoom } from "./frame-stage/camera-math.js";
import { perceivedLuminance } from "./frame-stage/luminance.js";
import { NestedFrame } from "./frame-stage/NestedFrame.js";
import { useViewportCulling } from "./frame-stage/use-viewport-culling.js";

export interface FrameMenuContext {
  readonly layers: ReadonlyArray<LayerHit>;
  readonly onPickLayer: (id: string) => void;
}

export interface FrameStageProps {
  readonly designWidth: number;
  readonly designHeight: number;
  /** Canvas background — CSS color string. Drives both the design plane's
   *  paint and the `data-bg-tone` flag that scopes document-context tokens
   *  to readable values on this surface. Defaults to white. */
  readonly background?: string;
  /** Edit-vs-present switch. Defaults to true (DesignPage uses this). When
   *  false, the stage and frames render without authoring chrome — used by
   *  any read-only host that wants the same recursion logic. */
  readonly editing?: boolean;
  /** Mixed flavor renders as an infinite panable canvas (Figma-style).
   *  Defaults to false, which keeps the legacy fit-to-viewport behavior. */
  readonly infiniteCanvas?: boolean;
  /** Externally-controlled hand-mode flag (toolbar V/H toggle). When true,
   *  every pointer down on the canvas pans rather than starting a rubber-
   *  band. Space+drag also activates pan independent of this flag. */
  readonly handMode?: boolean;
  readonly root: AgocraftItem;
  /**
   * Phase F (WI-017) — when provided, the design plane is wrapped with
   * `<RubberBandLayer containerKind="design">` so dragging on empty space
   * opens the recommendation popover. When undefined, FrameStage renders
   * the plane as a plain div (legacy behavior, zero regression).
   */
  readonly editor?: Editor | undefined;
  readonly selectedId?: string | undefined;
  /** Multi-selection set. When provided, every id in here gets the
   *  selected outline; `selectedId` stays the "primary" single pick that
   *  drives selection chrome (resize/rotation handles, hotspot overlays). */
  readonly selectedIds?: ReadonlySet<string> | undefined;
  /** WI-039 — Stage 1 set. Frames whose id appears here render at
   *  `--focus-dim-opacity` AND with `pointer-events: none`, so the focused
   *  tree below remains the sole interactive surface. The host populates
   *  this with every frame painted ABOVE the focused tree in z-order
   *  (later siblings of each ancestor, plus their descendants). The two
   *  focus sets are mutually exclusive — at most one is non-empty at a time. */
  readonly dimmedFrameIds?: ReadonlySet<string> | undefined;
  /** WI-039 — Stage 2 set. Frames whose id appears here render at
   *  `--focus-isolate-opacity` (0 — fully invisible) AND with
   *  `pointer-events: none`. The host populates this with every frame
   *  OUTSIDE the focused frame's subtree (non-trail children of every
   *  ancestor, with their subtrees). Ancestors themselves stay
   *  interactive so the DOM chain that mounts the focused frame keeps
   *  paint + event flow. */
  readonly isolatedFrameIds?: ReadonlySet<string> | undefined;
  readonly onSelect?: ((itemId: string | undefined) => void) | undefined;
  /** Shift/Cmd/Ctrl + click on a frame toggles it in/out of the multi
   *  selection (Figma parity). Fires alongside the existing `onSelect`
   *  callback. Plain click on a frame already in the multi-selection
   *  preserves the selection (handled in NestedFrame without a callback). */
  readonly onToggleSelect?: ((itemId: string) => void) | undefined;
  /** Plain drag on empty design-plane space dispatches a marquee selection.
   *  Intent is captured at drag start: no modifier = replace, Shift = add,
   *  Cmd / Ctrl = toggle. Alt is reserved for the rubber-band add gesture
   *  so it never reaches this callback. */
  readonly onMarqueeSelect?:
    | ((intent: "replace" | "add" | "toggle", ids: ReadonlyArray<string>) => void)
    | undefined;
  readonly onUpdateItem?:
    | ((itemId: string, patch: (attrs: Record<string, unknown>) => Record<string, unknown>) => void)
    | undefined;
  readonly onUpdateShape?: ((itemId: string, shapeId: string, patch: object) => void) | undefined;
  readonly onRemoveShape?: ((itemId: string, shapeId: string) => void) | undefined;
  readonly onDropAdd?:
    | ((e: React.DragEvent<HTMLDivElement>, containerId: string) => void)
    | undefined;
  readonly onDragOver?: ((e: React.DragEvent<HTMLDivElement>) => void) | undefined;
  readonly renderFrameMenu?:
    | ((itemId: string, children: React.ReactNode, ctx?: FrameMenuContext) => React.ReactNode)
    | undefined;
  /** Phase 12b — commit a frame's full ItemFrame after a manipulation drag. */
  readonly onCommitFrame?: ((itemId: string, next: ItemFrame) => void) | undefined;
  // WI-033 P2 — `enteredId` / `onEnter` removed with drill-in mode.
  /** Double-clicking truly empty design-plane space fits the camera to the
   *  union bounds of every top-level item, so the whole design comes into
   *  view at once. No-op when omitted. */
  readonly onFitAll?: (() => void) | undefined;
  /** Optional reference to the full document so the stage can compute an
   *  absolute-frame transform for the entered frame (trail walk). */
  readonly document?: AgocraftDocument | undefined;
  /** Phase 13c-2 — visual hotspot region overlay. */
  readonly selectedHotspotId?: string | undefined;
  readonly onSelectHotspot?: ((hotspotId: string | undefined) => void) | undefined;
  readonly onCommitHotspotRegion?:
    | ((
        itemId: string,
        hotspotId: string,
        region: { x: number; y: number; width: number; height: number },
      ) => void)
    | undefined;
  /** WI-040 Phase 3 — host-supplied overlay rendered inside the
   *  design-plane subtree (under the same camera transform as frames)
   *  so design-space rects line up with frames pixel-for-pixel. Slot
   *  fires every render and is expected to be cheap — typically the
   *  host returns `<HoverAffordanceLayer .../>` or `null`. */
  readonly renderHoverOverlay?: (() => React.ReactNode) | undefined;
}

// WI-033 P2 — `computeDrillStaggered` / `computeDrillDimFlags` (Phase 13e
// drill-in opacity / dim helpers) removed alongside the drill-in mode.

export function FrameStage(props: FrameStageProps) {
  const {
    designWidth,
    designHeight,
    root,
    editor,
    onSelect,
    onToggleSelect,
    onMarqueeSelect,
    onFitAll,
    onDropAdd,
    onDragOver,
    document: doc,
    editing = true,
    infiniteCanvas = false,
    handMode = false,
    background = "#ffffff",
    renderHoverOverlay,
  } = props;

  const bgTone: "light" | "dark" = useMemo(
    () => (perceivedLuminance(background) >= 0.5 ? "light" : "dark"),
    [background],
  );
  const rootId = String(root.id);
  const frames = root.children.filter(isDomainItem);
  // WI-033 P2 — `reduceMotion` useMemo removed alongside the drill-in
  // spring animation. The design plane now snaps to base camera
  // synchronously on resize, which already honours the user's
  // motion preference (no animation at all).

  // WI-033 P2 — drill-in mode removed (DR-017). The design plane sits
  // at base camera (computed below from outer size + designWidth/
  // Height); user pan/wheel adjusts pan via `vm.camera`. No spring is
  // needed since there's no entered-frame target to animate to.

  const outerRef = useRef<HTMLDivElement | null>(null);
  // Live handle on the design-plane DOM node so the rubber-band layer (now
  // hosted at the outer FrameStage level so its events cover the whole
  // viewport) can project pointer client coords into design-pixel space —
  // and so its visual rect can be portalled back into the design plane
  // where the existing pan + drill transforms render it at the right
  // viewport position automatically.
  const designPlaneRef = useRef<HTMLDivElement | null>(null);
  // Viewport → design-pixel coord conversion (depends only on
  // designPlaneRef's current rect + the configured design size).
  // Declared here so any useEffect below can list it in its deps.
  const clientToDesignLocal = useCallback(
    (clientX: number, clientY: number) => {
      const dp = designPlaneRef.current;
      if (dp === null) return { x: 0, y: 0 };
      const r = dp.getBoundingClientRect();
      const sx = r.width / designWidth;
      const sy = r.height / designHeight;
      if (sx === 0 || sy === 0) return { x: 0, y: 0 };
      return {
        x: (clientX - r.left) / sx,
        y: (clientY - r.top) / sy,
      };
    },
    [designWidth, designHeight],
  );

  // WI-033 A4 — Layer Picker plumbing. NestedFrame's onContextMenu
  // request fires here on every right-click; we compute the overlapping
  // frames at the cursor (design-plane local px) and stash them so the
  // ContextMenu's first render sees the layer list. React 18's automatic
  // batching commits this state-update alongside Radix's open trigger
  // (both setState calls happen inside the same right-click event), so
  // no `flushSync` is needed.
  //
  // `doc` is already destructured above as `props.document` aliased; we
  // reach for `props.document` directly here to stay decoupled from the
  // current destructure order.
  const [pickerCtx, setPickerCtx] = useState<{
    readonly targetId: string;
    readonly layers: ReadonlyArray<LayerHit>;
  } | null>(null);
  const handleFrameContextMenu = useCallback(
    (itemId: string, clientX: number, clientY: number) => {
      const d = props.document;
      if (d === undefined) return;
      const local = clientToDesignLocal(clientX, clientY);
      const layers = findFramesAtPoint(d, local.x, local.y, designWidth, designHeight);
      setPickerCtx({ targetId: itemId, layers });
    },
    [props.document, clientToDesignLocal, designWidth, designHeight],
  );
  const handlePickLayer = useCallback(
    (id: string) => {
      props.onSelect?.(id);
      setPickerCtx(null);
    },
    [props],
  );
  const wrappedRenderFrameMenu = useMemo<FrameStageProps["renderFrameMenu"]>(() => {
    if (props.renderFrameMenu === undefined) return undefined;
    const rfm = props.renderFrameMenu;
    return (itemId, children) => {
      const layers = pickerCtx !== null && pickerCtx.targetId === itemId ? pickerCtx.layers : [];
      return rfm(itemId, children, { layers, onPickLayer: handlePickLayer });
    };
  }, [props.renderFrameMenu, pickerCtx, handlePickLayer]);
  const [outerSize, setOuterSize] = useState<{ width: number; height: number }>({
    width: designWidth,
    height: designHeight,
  });
  // Measure outer rect before first paint so the design plane's scale is
  // correct on initial render. Without this, e2e or any code that reads
  // element rects right after mount would see the un-scaled layout for one
  // frame and chase a moving target.
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setOuterSize({ width: r.width, height: r.height });
  }, []);
  useEffect(() => {
    const el = outerRef.current;
    if (el === null) return undefined;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r !== undefined && r.width > 0 && r.height > 0) {
        setOuterSize({ width: r.width, height: r.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Base fit scale: shrink the design plane to fit inside the outer box.
  // Mixed/infinite canvas gets 10% breathing room so frames near the edges
  // aren't pressed against the viewport; stacked flavors use the full box
  // (legacy width-fit when outer has aspectRatio matches the design).
  const paddingFactor = infiniteCanvas ? 0.9 : 1;
  const baseScale =
    Math.min(outerSize.width / designWidth, outerSize.height / designHeight) * paddingFactor;
  const baseTx = (outerSize.width - designWidth * baseScale) / 2;
  const baseTy = (outerSize.height - designHeight * baseScale) / 2;

  // DR-017 Phase 2 — pan state lives on vm.camera (MotionValue slots).
  // Local `pan` mirror is kept so the existing render code reading
  // `pan.tx / pan.ty / pan.scale` continues to work unchanged; it
  // syncs from vm.camera via `on("change")` subscriptions. Writers
  // (wheel handler, PanBinding) target vm.camera directly.
  const vm = useContext(EditorVMContext);
  // Stable ref so closures (frameAccess.resolveTarget, etc.) can read
  // the current vm without rebuilding when vm becomes non-null.
  const vmRef = useRef(vm);
  useEffect(() => {
    vmRef.current = vm;
  }, [vm]);
  const [pan, setPanState] = useState<{ tx: number; ty: number; scale: number }>(() =>
    vm !== null
      ? { tx: vm.camera.tx.get(), ty: vm.camera.ty.get(), scale: vm.camera.scale.get() }
      : { tx: 0, ty: 0, scale: 1 },
  );
  useEffect(() => {
    if (vm === null) return undefined;
    const sub = () =>
      setPanState({
        tx: vm.camera.tx.get(),
        ty: vm.camera.ty.get(),
        scale: vm.camera.scale.get(),
      });
    const offs = [
      vm.camera.tx.on("change", sub),
      vm.camera.ty.on("change", sub),
      vm.camera.scale.on("change", sub),
    ];
    sub();
    return () => {
      for (const off of offs) off();
    };
  }, [vm]);
  // Helper to write pan via vm.camera so all writers share one channel.
  const setPan = useCallback(
    (
      next:
        | { tx: number; ty: number; scale: number }
        | ((prev: { tx: number; ty: number; scale: number }) => {
            tx: number;
            ty: number;
            scale: number;
          }),
    ) => {
      if (vm === null) return;
      const cur = {
        tx: vm.camera.tx.get(),
        ty: vm.camera.ty.get(),
        scale: vm.camera.scale.get(),
      };
      const out = typeof next === "function" ? next(cur) : next;
      vm.camera.tx.set(out.tx);
      vm.camera.ty.set(out.ty);
      vm.camera.scale.set(out.scale);
    },
    [vm],
  );

  // Move + zoom the camera so a design-px box fills the viewport. Used by
  // the "add into a selected frame → bring that frame full-screen" rule
  // (triggered from DesignPage via the camera bridge). The math mirrors the
  // wheel-zoom transform: a design point (dx) maps to screen as
  // `(baseTx + dx*baseScale - W/2)*scale + W/2 + tx`, so to centre the box
  // we solve tx/ty for its centre and pick the scale that fits W×H with a
  // small margin. Only meaningful while the infinite canvas (user camera)
  // is active; setPan is a no-op when vm is null.
  const zoomToBox = useCallback(
    (box: DesignBox, fillFactor = 1) => {
      const W = outerSize.width;
      const H = outerSize.height;
      if (W <= 0 || H <= 0 || box.w <= 0 || box.h <= 0 || baseScale <= 0) return;
      // 0.9 = the normal fit margin; `fillFactor` (default 1) scales it further
      // down so callers can fit at a fraction of the usual size (e.g. 0.7).
      const MARGIN = 0.9 * fillFactor;
      const rawScale = Math.min(
        (W * MARGIN) / (box.w * baseScale),
        (H * MARGIN) / (box.h * baseScale),
      );
      const scale = Math.max(0.1, Math.min(8, rawScale));
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const olx = baseTx + cx * baseScale;
      const oly = baseTy + cy * baseScale;
      setPan({ tx: -(olx - W / 2) * scale, ty: -(oly - H / 2) * scale, scale });
    },
    [outerSize, baseScale, baseTx, baseTy, setPan],
  );
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    return setCameraFitBox(zoomToBox);
  }, [infiniteCanvas, zoomToBox]);

  // WI-033 P2 — pan-reset-on-entered-frame-change effect removed
  // alongside drill-in mode (DR-017). The user's pan/zoom now persists
  // across all selection changes; explicit Zoom controls (Ctrl+Wheel /
  // ZoomBar) are the only ways to reset it.
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  // Track Space-held for hold-to-pan. Only enabled when infinite canvas is
  // on — for stacked flavors there's nothing to pan to.
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLElement && t.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }
      e.preventDefault();
      setIsSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setIsSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [infiniteCanvas]);

  const panActive = infiniteCanvas && (isSpaceDown || handMode);

  // Pan drag publishes "panning" into the editor-wide interaction mode so
  // tooltips, the rubber band, and frame click-to-select stand down while
  // the user is dragging the canvas. Wheel zoom is fire-and-forget — no
  // gating necessary because it doesn't conflict with other sources.
  const { transitionFrom, restoreIdleFrom } = useInteractionMode();
  // Mode-isolation gate for selection-related entry points (background
  // deselect, marquee acceptTarget). NestedFrame has its own copy via
  // the same hook — kept consistent so every mode toggles cleanly with
  // zero side effects on selection state.
  const selectionAllowedOuter = useFrameSelectionAllowed();

  // Hand-armed publishing — when the hand tool is toggled OR Space is held,
  // surface that as the "hand" mode. With the mode machine flipped from
  // "idle" to "hand", rubber-band's `transitionFrom("idle", "rubber-band")`
  // gate refuses the pointerdown and the bubble path continues up to the
  // outer pan handler. Without this, rubber-band kept winning the press in
  // hand mode because nothing was gating its entry — only the cursor changed.
  // The transition is guarded so an in-flight rubber-band / context-menu /
  // manipulation isn't stomped if the user happens to hit Space mid-gesture.
  useEffect(() => {
    if (!infiniteCanvas) return;
    if (panActive) {
      transitionFrom("idle", "hand");
    } else {
      restoreIdleFrom("hand");
    }
  }, [infiniteCanvas, panActive, transitionFrom, restoreIdleFrom]);

  // WI-037 / DR-018 — gesture-gated `will-change: transform` signal.
  // Permanent `will-change` on the design plane pinned the composited
  // layer at a fixed raster resolution, so after the user zoomed in
  // 3-5× the texture exceeded Chromium's GPU tile budget (~4096-8192px)
  // and visible tiles dropped out as checker-blanks. We now flip
  // `will-change` on only while a zoom/pan gesture is in flight
  // (PanBinding drag OR wheel within the last 200ms) and clear it on
  // settle so the browser re-rasterises at the new on-screen
  // resolution. Defined here (above the wheel handler) so the handler
  // can call `bumpWheel()`; the merged `gestureActive` is derived
  // alongside `panDragging` further down.
  const [recentWheel, setRecentWheel] = useState(false);
  const wheelTimeoutRef = useRef<number | null>(null);
  const bumpWheel = useCallback(() => {
    setRecentWheel(true);
    if (wheelTimeoutRef.current !== null) {
      window.clearTimeout(wheelTimeoutRef.current);
    }
    wheelTimeoutRef.current = window.setTimeout(() => {
      wheelTimeoutRef.current = null;
      setRecentWheel(false);
    }, 200);
  }, []);
  useEffect(
    () => () => {
      if (wheelTimeoutRef.current !== null) {
        window.clearTimeout(wheelTimeoutRef.current);
        wheelTimeoutRef.current = null;
      }
    },
    [],
  );

  // Wheel handling lives on a *native* non-passive listener so that the
  // ctrl+wheel pinch gesture (trackpad pinch-to-zoom; mouse Cmd+wheel) is
  // captured here and `preventDefault()` actually blocks the browser-level
  // page zoom. React's synthetic onWheel attaches as passive on modern
  // engines, which means `e.preventDefault()` is a no-op and the browser
  // proceeds to zoom the entire document — visible as the header/footer
  // sliding out of the viewport on pinch.
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    const el = outerRef.current;
    if (el === null) return undefined;
    const handler = (e: WheelEvent) => {
      // WI-037 — keep the design-plane composited layer warm for the
      // duration of the wheel burst; settle-debounced clear lets the
      // browser re-rasterise once the user stops.
      bumpWheel();
      if (e.ctrlKey || e.metaKey) {
        // pinch / Cmd+wheel → custom canvas zoom, anchored at the
        // pointer so the design-pixel under the cursor stays still
        // across the scale change. A future hotkey / button caller
        // would invoke `nextPanForZoom` with `{ x: W/2, y: H/2 }`.
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1 / 1.08 : 1.08;
        const rect = el.getBoundingClientRect();
        const anchor = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          outerW: rect.width,
          outerH: rect.height,
        };
        setPan((p) => nextPanForZoom(p, factor, anchor));
      } else {
        // plain wheel → canvas pan (also non-passive so the page itself
        // doesn't scroll behind our pan offset)
        e.preventDefault();
        setPan((p) => ({ ...p, tx: p.tx - e.deltaX, ty: p.ty - e.deltaY }));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
    };
  }, [infiniteCanvas, bumpWheel]);

  // Zoom hotkeys (Figma parity): Cmd/Ctrl + "=" zoom in, "-" zoom out
  // (anchored at the viewport centre via `nextPanForZoom`), "0" resets to
  // the base fit (scale 1, no pan). preventDefault stops the browser's
  // own page-zoom. Lives here — not the agocraft hotkey registry — so it
  // shares the camera channel + outer rect the wheel zoom already uses.
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const el = outerRef.current;
      if (el === null) return;
      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.width / 2,
        y: rect.height / 2,
        outerW: rect.width,
        outerH: rect.height,
      };
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setPan((p) => nextPanForZoom(p, 1.2, center));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setPan((p) => nextPanForZoom(p, 1 / 1.2, center));
      } else if (e.key === "0") {
        e.preventDefault();
        setPan({ tx: 0, ty: 0, scale: 1 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infiniteCanvas, setPan]);

  // DR-017 Phase 2~4 — Pan / FrameMove gestures live on the GestureRouter.
  // PanBinding writes vm.camera.tx/ty directly (60Hz MotionValue).
  // FrameMoveBinding reads/writes frames via a host-supplied FrameAccess
  // adapter that wraps weave's 0..1 ratio frame schema + commitFrame
  // pipeline. Both bindings are registered on FrameStage's outer host.
  const panActiveRef = useRef(panActive);
  panActiveRef.current = panActive;
  const router = useRouterOrNull();
  const onCommitFrame = props.onCommitFrame;
  const onCommitFrameRef = useRef(onCommitFrame);
  onCommitFrameRef.current = onCommitFrame;
  // Phase 15 — proportional-resize side channel for text. When a corner-
  // resize on a text item runs, frameAccess.computeResize stashes a
  // `__newFontSize` on the next frame; commitFrame dispatches it through
  // this attrs-update path so fontSize scales alongside the frame.
  const onUpdateItemRef = useRef(props.onUpdateItem);
  onUpdateItemRef.current = props.onUpdateItem;
  const docRef = useRef(doc);
  docRef.current = doc;
  // Selection-follows-move: the FrameMoveBinding runs with
  // `disableSelectionSet: true` so plain clicks keep selectFromHit's
  // parent-first model, and after a drag its onPointerUp swallows the
  // click — so neither path switches selection when a drag starts on an
  // UNSELECTED frame. commitFrame reconciles it once per gesture. These
  // refs let the stable (deps-`[]`) frameAccess closure reach the live
  // onSelect and remember which session it already reconciled.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const moveSelectionSessionRef = useRef<string | null>(null);

  const frameAccess = useMemo<FrameAccess>(() => {
    function findFrameElement(itemId: ItemId): HTMLElement | null {
      if (typeof document === "undefined") return null;
      return document.querySelector(`[data-frame-id="${String(itemId)}"]`);
    }
    function findItem(
      itemId: ItemId,
    ): { kind: string; attrs: Readonly<Record<string, unknown>> } | undefined {
      const d = docRef.current;
      if (d === undefined) return undefined;
      const walk = (node: {
        id: string | number;
        kind: string;
        attrs: Readonly<Record<string, unknown>>;
        children: ReadonlyArray<unknown>;
      }): { kind: string; attrs: Readonly<Record<string, unknown>> } | undefined => {
        if (String(node.id) === String(itemId)) return { kind: node.kind, attrs: node.attrs };
        for (const c of node.children as ReadonlyArray<typeof node>) {
          const found = walk(c);
          if (found !== undefined) return found;
        }
        return undefined;
      };
      return walk(d.root as unknown as Parameters<typeof walk>[0]);
    }
    /** Direct parent id of `targetId` within the live doc, or undefined if
     *  it is the root / absent. Used by `resolveTarget`'s movable-ancestor
     *  climb. */
    function findParentId(targetId: ItemId): ItemId | undefined {
      const d = docRef.current;
      if (d === undefined) return undefined;
      type Node = { id: string | number; children: ReadonlyArray<Node> };
      const stack: Node[] = [d.root as unknown as Node];
      while (stack.length > 0) {
        const node = stack.pop()!;
        for (const c of node.children) {
          if (String(c.id) === String(targetId)) return node.id as ItemId;
          stack.push(c);
        }
      }
      return undefined;
    }
    /** Climb `id` to the nearest ancestor whose layout permits MOVING its
     *  own position. A layout-managed child (flex/grid) returns its
     *  container; an absolute / top-level frame returns itself. The
     *  agocraft LayoutEngine owns `canMove` — weave only reads it to climb. */
    function climbToMovable(id: ItemId): ItemId {
      const d = docRef.current;
      if (!LAYOUT_FEATURE_ENABLED || d === undefined) return id;
      const engine = getLayoutEngine();
      let cur = id;
      let guard = 0;
      while (guard++ < 64 && !engine.getChildConstraints({ root: d.root, itemId: cur }).canMove) {
        const parent = findParentId(cur);
        if (parent === undefined || String(parent) === String(d.root.id)) break;
        cur = parent;
      }
      return cur;
    }
    return {
      resolveTarget(target) {
        // Accept any Element (HTML or SVG). SVG elements appear when the
        // pointer-down lands on a shape kind (ShapeBlock renders an `<svg>`
        // with `<rect>` / `<polygon>` / `<path>` inside). `closest()` is
        // defined on Element so the walk works for both.
        if (!(target instanceof Element)) return null;
        // Inner gesture owners always win — never start a frame-move while
        // editing text, on an input, on a selection handle, or on a hotspot.
        if (
          target.closest('[contenteditable="true"]') !== null ||
          target.closest("input, textarea") !== null ||
          target.closest("[data-selection-layer]") !== null ||
          target.closest("[data-hotspot-id]") !== null
        )
          return null;
        // WI-019/WI-021 — Figma move model: a SELECTED frame is draggable
        // from ANYWHERE inside it (its body, a shape/text child, a nested
        // frame). This keeps an auto-layout container movable even when its
        // children fill it (the children, being layout-managed, don't own
        // their position — the container does). If the press lands inside
        // the current selection, that frame (climbed to its nearest movable
        // ancestor) is the move target.
        const vmNow = vmRef.current;
        if (vmNow !== null) {
          const sel = vmNow.itemSelection.state.get();
          const selIds: string[] =
            sel.kind === "single"
              ? [String(sel.itemId)]
              : sel.kind === "multi"
                ? Array.from(sel.items as Iterable<unknown>, (x) => String(x))
                : [];
          for (const sid of selIds) {
            if (target.closest(`[data-frame-id="${CSS.escape(sid)}"]`) !== null) {
              return climbToMovable(sid as ItemId);
            }
          }
        }
        // No selection redirect → the press must land on a frame body, not
        // a shape's geometry: pressing a shape with nothing selected keeps
        // the legacy "select, don't move" behavior. Resolve the deepest
        // frame, then climb to its nearest movable ancestor (a layout child
        // moves its container — Figma auto-layout parity).
        if (target.closest("[data-shape-id]") !== null) return null;
        const frameEl = target.closest("[data-frame-id]");
        if (frameEl === null) return null;
        const raw = frameEl.getAttribute("data-frame-id");
        if (raw === null) return null;
        return climbToMovable(raw as ItemId);
      },
      readFrame(itemId) {
        const item = findItem(itemId);
        const frame = (item?.attrs as { frame?: ItemFrame } | undefined)?.frame;
        if (frame === undefined) return undefined;
        // Phase 15 — text items carry their fontSize through the resize
        // pipeline as `__origFontSize` on the FrameGeom. computeResize
        // reads this to compute the proportional scale on corner drags
        // (DR-022 — diagonal resize scales the glyph by the box height
        // ratio). The agocraft binding treats FrameGeom as opaque, so the
        // helper fields ride through untouched.
        if (item?.kind === "text") {
          const tattrs = item.attrs as {
            fontSize?: number;
            fontSizeSpec?: import("@agocraft/core").FontSizeSpec;
          };
          const fs = tattrs.fontSize ?? 24;
          // __designWidth is the design's full design-pixel width — used
          // by computeResize below to clamp the minimum frame.width to
          // roughly one character (≈ fontSize × 0.6) for text items.
          // __origFontSizeSpec preserves the explicit-unit spec so corner
          // scaling rewrites it losslessly — for `kind:"px"` and `"ratio"`
          // alike the new `value` is just `value × scaleFactor` (a ratio
          // is a fraction of the unchanged parent height, so the same
          // factor that scales the legacy px scales the ratio value).
          return {
            ...frame,
            __origFontSize: fs,
            __designWidth: designWidth,
            ...(tattrs.fontSizeSpec !== undefined
              ? { __origFontSizeSpec: tattrs.fontSizeSpec }
              : {}),
          } as unknown as FrameGeom;
        }
        return frame as unknown as FrameGeom;
      },
      commitFrame(itemId, next, sessionId) {
        // Selection follows a body-drag move. On the first commit of a
        // new gesture, if the moved item isn't already in the selection,
        // make it the single selection (Figma parity: dragging an
        // unselected object selects it). Items already in a single /
        // multi selection are left untouched so a multi-drag keeps its
        // set, and a drag-from-inside the selected container (which
        // resolves the move to the selected ancestor) is a no-op. The
        // session-id guard fires this once per gesture, not on every
        // 60 Hz move frame. Resize / rotate also commit here but only on
        // an already-selected item, so they no-op.
        if (sessionId !== moveSelectionSessionRef.current) {
          moveSelectionSessionRef.current = sessionId;
          const vmNow = vmRef.current;
          if (vmNow !== null) {
            const sel = vmNow.itemSelection.state.get();
            const sid = String(itemId);
            const already =
              (sel.kind === "single" && String(sel.itemId) === sid) ||
              (sel.kind === "multi" &&
                Array.from(sel.items as Iterable<unknown>, (x) => String(x)).includes(sid));
            if (!already) onSelectRef.current?.(sid);
          }
        }
        const n = next as unknown as ItemFrame & {
          __newFontSize?: number;
          __newFontSizeSpec?: import("@agocraft/core").FontSizeSpec;
          __origFontSize?: number;
        };
        const cleanFrame: ItemFrame = {
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          rotation: n.rotation,
        };
        const nextFontSize = n.__newFontSize;
        const nextFontSizeSpec = n.__newFontSizeSpec;
        // Phase 15 — for text proportional resize we MUST dispatch frame
        // + fontSize in a single `weave.item.update` patch. Splitting them
        // into two consecutive execs loses the first one: each patch
        // emits a FULL `attrs.after` snapshot, and the second exec's
        // patcher reads `prev.attrs` from the doc-before-applied state in
        // some commit orderings, so the second `after` clobbers the
        // first's frame change. Combining into one patch keeps both.
        // DR-022 — when the original font carried an explicit `fontSizeSpec`
        // we rewrite both the legacy px mirror (`fontSize`) and the spec so
        // px / ratio units survive the resize. `fontSize` stays the resolved
        // px for legacy readers; `fontSizeSpec` keeps the unit semantics.
        if (nextFontSize !== undefined) {
          const upd = onUpdateItemRef.current;
          if (upd !== undefined) {
            upd(String(itemId), (prev) => ({
              ...prev,
              frame: cleanFrame,
              fontSize: nextFontSize,
              ...(nextFontSizeSpec !== undefined ? { fontSizeSpec: nextFontSizeSpec } : {}),
            }));
          }
          return;
        }
        const commit = onCommitFrameRef.current;
        if (commit !== undefined) {
          commit(String(itemId), cleanFrame);
        }
      },
      computeMove(orig, dx, dy, parent) {
        const o = orig as unknown as ItemFrame;
        const w = parent.width > 0 ? parent.width : 1;
        const h = parent.height > 0 ? parent.height : 1;
        return {
          ...o,
          x: o.x + dx / w,
          y: o.y + dy / h,
        } as unknown as FrameGeom;
      },
      computeResize(orig, dir: ResizeDir, dx, dy, parent) {
        // DR-022 (2026-05-31, supersedes DR-016 corner clause): text item
        // DIAGONAL (corner) resize scales the glyph proportionally to the
        // box HEIGHT ratio (nh / origHeight); pure edge drags (e/w, n/s)
        // still change box dimensions only. Edge drag clamps to one-
        // character min-width using the fontSize meta. Mode-specific handle
        // exposure is gated upstream (createFrameDefaultViewModel call site)
        // so this function trusts the dirs it receives.
        const o = orig as unknown as ItemFrame & {
          __origFontSize?: number;
          __designWidth?: number;
          __origFontSizeSpec?: import("@agocraft/core").FontSizeSpec;
        };
        const w = parent.width > 0 ? parent.width : 1;
        const h = parent.height > 0 ? parent.height : 1;
        const ddx = dx / w;
        const ddy = dy / h;
        let nx = o.x;
        let ny = o.y;
        let nw = o.width;
        let nh = o.height;
        if (dir.includes("w")) {
          nx = o.x + ddx;
          nw = o.width - ddx;
        }
        if (dir.includes("e")) nw = o.width + ddx;
        if (dir.includes("n")) {
          ny = o.y + ddy;
          nh = o.height - ddy;
        }
        if (dir.includes("s")) nh = o.height + ddy;
        // Text-specific min-width clamp (one character). Applies to every
        // direction that changes width — kept after DR-016 because a box
        // narrower than ~1ch becomes visually unusable.
        const isText = o.__origFontSize !== undefined;
        if (isText && (dir.includes("e") || dir.includes("w"))) {
          const designW = o.__designWidth ?? 1920;
          const minWidthRatio = ((o.__origFontSize as number) * 0.6) / designW;
          if (nw < minWidthRatio) {
            nw = minWidthRatio;
            if (dir.includes("w")) nx = o.x + o.width - nw;
          }
        }
        // DR-022 — diagonal (corner) drag scales the glyph by the box
        // HEIGHT ratio. A corner is a two-letter dir (ne/nw/se/sw); pure
        // edge drags (length 1) never touch fontSize. The new px is mirrored
        // onto the legacy `fontSize`, and any explicit `fontSizeSpec` has its
        // `value` scaled by the same factor (px → new px, ratio → new
        // fraction of the unchanged parent height — both correct since the
        // factor is unit-agnostic). commitFrame dispatches both in one patch.
        let fontExtra: {
          __newFontSize?: number;
          __newFontSizeSpec?: import("@agocraft/core").FontSizeSpec;
        } = {};
        const isCorner = dir.length === 2;
        if (isText && isCorner && o.height > 0) {
          const scaleFactor = Math.max(0.01, nh) / o.height;
          const spec = o.__origFontSizeSpec;
          fontExtra = {
            __newFontSize: (o.__origFontSize as number) * scaleFactor,
            ...(spec !== undefined
              ? {
                  __newFontSizeSpec:
                    spec.kind === "ratio"
                      ? { kind: "ratio", value: spec.value * scaleFactor }
                      : { kind: "px", value: spec.value * scaleFactor },
                }
              : {}),
          };
        }
        return {
          ...o,
          x: nx,
          y: ny,
          width: Math.max(0.01, nw),
          height: Math.max(0.01, nh),
          ...fontExtra,
        } as unknown as FrameGeom;
      },
      computeRotate(orig, center, startVec, cursor) {
        const o = orig as unknown as ItemFrame;
        const startAngle = Math.atan2(startVec.y, startVec.x);
        const curAngle = Math.atan2(cursor.y - center.y, cursor.x - center.x);
        const next = (o.rotation ?? 0) + (curAngle - startAngle);
        return { ...o, rotation: next } as unknown as FrameGeom;
      },
      parentRectOf(itemId) {
        const el = findFrameElement(itemId);
        const parent = el?.parentElement;
        if (parent === null || parent === undefined) return { width: 1, height: 1 };
        const r = parent.getBoundingClientRect();
        return { width: r.width, height: r.height };
      },
    };
  }, []);

  // Adapted weave capability for the design root container — used by
  // the Alt-override rubber-band binding registered on the outer router
  // below. Same capability the design-plane RubberBandLayer uses for
  // its (lower priority) plain-drag binding.
  // WI-073 — snap guide lines while dragging a frame/item. Stable instance; it
  // captures DOM viewport rects on each drag's `begin` and publishes guides to
  // the `snapFeedback` store (drawn by SnapFeedbackLayer). Injected into the
  // move binding below.
  const frameMoveSnap = useMemo(() => createFrameMoveSnap({ hostEl: () => outerRef.current }), []);

  const designCapability = useMemo(() => defaultInsertableRegistry.get("design"), []);
  const designAdaptedCapability = useMemo(
    () =>
      designCapability === undefined || editor === undefined
        ? undefined
        : adaptWeaveCapabilityToAgocraft(designCapability, editor),
    [designCapability, editor],
  );

  // WI-040 — frame-drag bindings (alt-rubber-band, frame-move) register
  // only while the mode permits a drag to start or continue. Pan stays
  // registered always — it carries its own `enabled` predicate and is
  // the gesture the user typically wants when in `hand` / `panning`.
  const frameDragAllowed = useFrameDragBindingsAllowed();
  useEffect(() => {
    if (router === null) return undefined;
    if (vm === null) return undefined;
    // Alt-drag = "draw a new frame anywhere" override. Built via
    // `createModifierOverride` so the layering is self-documenting:
    // the SAME base binding the design-plane RubberBandLayer
    // registers (priority REGION_GESTURE=10, plain modifier), lifted
    // to MODIFIER_OVERRIDE=90 with `alt: "required"`. Wins over
    // Resize / Rotate handles (80) / FrameMove (50) / Pan (5).
    const altRubberBand =
      !frameDragAllowed || designAdaptedCapability === undefined
        ? null
        : createModifierOverride({
            base: createRubberBandBinding({
              // Same hostId as the design-plane RubberBandLayer so the
              // visual layer's hostId-based mirror picks up the state.
              hostId: String(root.id),
              containerId: String(root.id),
              containerSize: { width: designWidth, height: designHeight },
              clientToLocal: clientToDesignLocal,
              capability: designAdaptedCapability,
              snapSize: 20,
              name: "rubber-band:design-root",
            }),
          });
    // WI-040 — frame-move excluded outside idle / frame-manipulating so
    // hand/panning, context-menu (LayerPicker open), text-editing, and
    // rubber-band reviewing don't allow a competing item drag.
    const frameMove = frameDragAllowed
      ? createFrameMoveBinding({
          access: frameAccess,
          // WI-073 — alignment / bounds / equal-spacing snap guides during move.
          snap: frameMoveSnap,
          priority: GESTURE_PRIORITY_ELEMENT_BODY,
          moveThreshold: 3,
          // HANDOFF-011 / WI-033 — opt out of the binding's raw
          // `vm.itemSelection.set(itemId)` on plain pointerdown so
          // NestedFrame's onClick can apply Figma's parent-first /
          // Cmd-deep / Shift-toggle semantics via `selectFromHit`.
          disableSelectionSet: true,
          // WI-019/WI-021 — body-drag move is resolved through
          // `frameAccess.resolveTarget`, which climbs a layout-managed
          // child up to the nearest MOVABLE ancestor (the layout
          // container) so the frame itself stays draggable even when its
          // children fill it. No acceptTarget gate is needed: the climb
          // already guarantees the moved item is movable (the agocraft
          // LayoutEngine owns `canMove`; weave only reads it).
          // WI-034 — Alt+drag on a frame is reserved for
          // RubberBandLayer's "add child" gesture; frame-move declines
          // so the lower-priority alt-rubber-band binding can claim.
          modifiers: { alt: "forbidden", button: 0 },
        })
      : null;
    return router.register({
      host: outerRef,
      bindings: [
        // Priority order (high → low):
        //   • Alt rubber-band  (90, MODIFIER_OVERRIDE) — Alt+drag wins
        //     over every per-element gesture so the user can draw a
        //     new frame anywhere while holding Alt.
        //   • Resize handles   (80, ELEMENT_HANDLE) — most specific,
        //     gated by `data-handle-kind="corner|edge"` + dir.
        //   • Rotate handle    (80, ELEMENT_HANDLE) — gated by
        //     `data-handle-kind="rotation"`.
        //   • Frame-move       (50, ELEMENT_BODY) — frame-body press;
        //     canStart filters out contenteditable / shape / handle /
        //     hotspot targets.
        //   • Pan              ( 5, FALLBACK) — only when hand tool /
        //     space-down is active.
        ...(altRubberBand === null ? [] : [altRubberBand]),
        ...(frameMove === null ? [] : [frameMove]),
        createPanBinding({
          enabled: () => panActiveRef.current,
          priority: GESTURE_PRIORITY_FALLBACK,
        }),
      ],
    });
  }, [
    router,
    vm,
    frameAccess,
    designAdaptedCapability,
    root.id,
    designWidth,
    designHeight,
    clientToDesignLocal,
    frameDragAllowed,
  ]);

  // FrameResize + FrameRotate live on a SEPARATE router host attached
  // to `document.body`. SelectionLayer renders its handles via
  // `createPortal(..., document.body)` — they're siblings of the
  // editor's outer div in the DOM, NOT children of `outerRef`. The
  // outer router's capture listener therefore never sees handle
  // clicks. A body-scoped host catches them at the document level.
  // `acceptTarget` keeps the binding inert for non-handle presses, so
  // every other gesture (including outer-router clicks) is unaffected.
  // WI-040 — same mode gate as the outer router: skip registration in
  // hand / panning / rubber-band / context-menu / text-editing. Handle
  // hit-testing via `acceptTarget` is not enough on its own — a hand-
  // tool drag that happened to land on a portal'd handle would still
  // claim a resize despite the user's pan intent.
  // DR-032 / WI-067 P3 — resize + rotate handles now run through the UNIFORM
  // handle-interaction pipeline, not the GestureRouter. SelectionLayer portals
  // its handles to `document.body`, so a capture-phase pointerdown listener
  // there detects a resize / rotate handle via the SAME DOM markers, builds a
  // sink that REUSES `frameAccess.computeResize/computeRotate + commitFrame`
  // (full parity — identical math + mergeKey), and starts the per-handle FSM
  // gesture (`startHandleGesture` owns the document pointer loop). Move / marquee
  // / pan stay on the GestureRouter — they are not handles.
  useEffect(() => {
    if (vm === null) return undefined;
    if (typeof document === "undefined") return undefined;
    if (!frameDragAllowed) return undefined;
    let seq = 0;
    const RESIZE_DIRS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
    const handleItemId = (el: Element | null): ItemId | null => {
      const id =
        el
          ?.closest("[data-selection-handle-item-id]")
          ?.getAttribute("data-selection-handle-item-id") ?? null;
      return id as ItemId | null;
    };
    const centerOf = (itemId: ItemId): { x: number; y: number } => {
      const el = document.querySelector(`[data-frame-id="${CSS.escape(String(itemId))}"]`);
      if (el !== null) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      const b = vm.selectedFrameBoundsViewport.get();
      return b === null ? { x: 0, y: 0 } : { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    };

    // Resolve from the PRESS TARGET only (matches the prior GestureRouter's
    // `e.target` semantics). A point-stack scan is deliberately NOT used: a
    // closed poly stacks resize handles (shape VM) UNDER its vertex handles
    // (poly VM), so scanning the point would hijack a vertex press into a
    // resize. The press target is authoritative — each handle owns its own hit.
    const handleAt = (e: PointerEvent, selector: string): Element | null => {
      const t = e.target;
      return t instanceof HTMLElement ? t.closest(selector) : null;
    };

    const onDown = (e: PointerEvent): void => {
      // WI-074 D8 P2 — while an item is being cropped, its (still-shown) resize +
      // rotate handles edit the crop draft instead of the frame.
      const cropId = croppingState.activeId();
      // Rotate handle.
      const rot = handleAt(e, "[data-handle-kind='rotation']");
      if (rot !== null) {
        const itemId = handleItemId(rot);
        if (itemId === null) return;
        const center = centerOf(itemId);
        const origin = toHandlePointer(e);
        const startVec = { x: origin.clientX - center.x, y: origin.clientY - center.y };
        e.preventDefault();
        e.stopPropagation();
        if (cropId !== null && String(itemId) === cropId) {
          // Rotate handle → crop straighten (content rotation).
          const start = croppingState.getDraft();
          if (start === null) return;
          const startAng = Math.atan2(startVec.y, startVec.x);
          startHandleGesture({
            kind: "frame-rotate",
            handleId: "crop-rotate",
            itemId: String(itemId),
            origin,
            sink: {
              // WI-074 — Shift = 10° steps; otherwise snap to 0/90/180/270 (guide).
              update: (p) => {
                const ang = Math.atan2(p.clientY - center.y, p.clientX - center.x);
                const snap = snapRotation(start.rotation + (ang - startAng), p.shiftKey);
                croppingState.setDraft(setStraighten(start, snap.rotation));
                if (snap.cardinalDeg !== null) {
                  rotationSnapFeedback.set({
                    cx: center.x,
                    cy: center.y,
                    deg: snap.cardinalDeg,
                    rad: snap.rotation,
                  });
                } else rotationSnapFeedback.clear();
              },
              commit: () => rotationSnapFeedback.clear(),
              cancel: () => rotationSnapFeedback.clear(),
            },
          });
          return;
        }
        const orig = frameAccess.readFrame(itemId);
        if (orig === undefined) return;
        const sessionId = `${String(itemId)}/rotate/${seq++}`;
        startHandleGesture({
          kind: "frame-rotate",
          handleId: "rotate",
          itemId: String(itemId),
          origin,
          sink: {
            // WI-074 — Shift = 10° steps; otherwise snap to 0/90/180/270 (guide).
            update: (p) => {
              const geom = frameAccess.computeRotate(orig, center, startVec, {
                x: p.clientX,
                y: p.clientY,
              });
              const snap = snapRotation((geom as unknown as ItemFrame).rotation ?? 0, p.shiftKey);
              frameAccess.commitFrame(
                itemId,
                {
                  ...(geom as unknown as ItemFrame),
                  rotation: snap.rotation,
                } as unknown as FrameGeom,
                sessionId,
              );
              if (snap.cardinalDeg !== null) {
                rotationSnapFeedback.set({
                  cx: center.x,
                  cy: center.y,
                  deg: snap.cardinalDeg,
                  rad: snap.rotation,
                });
              } else rotationSnapFeedback.clear();
            },
            commit: () => rotationSnapFeedback.clear(),
            cancel: () => rotationSnapFeedback.clear(),
          },
        });
        return;
      }

      // Resize handle (edge / corner + dir).
      const rsz = handleAt(e, "[data-handle-kind][data-handle-dir]");
      if (rsz === null) return;
      const kind = rsz.getAttribute("data-handle-kind");
      if (kind !== "edge" && kind !== "corner") return;
      const dirAttr = rsz.getAttribute("data-handle-dir");
      if (!RESIZE_DIRS.includes(dirAttr as (typeof RESIZE_DIRS)[number])) return;
      const dir = dirAttr as ResizeDir;
      const itemId = handleItemId(rsz);
      if (itemId === null) return;
      e.preventDefault();
      e.stopPropagation();
      const origin = toHandlePointer(e);
      if (cropId !== null && String(itemId) === cropId) {
        // Resize handle → crop window resize (cropRatio). Frame box stays fixed;
        // deltas are fractions of the frame box's on-screen rect.
        const start = croppingState.getDraft();
        const fr = document
          .querySelector(`[data-frame-id="${CSS.escape(String(itemId))}"]`)
          ?.getBoundingClientRect();
        if (start === null || fr === undefined || fr.width === 0 || fr.height === 0) return;
        startHandleGesture({
          kind: "frame-resize",
          handleId: `crop-resize.${dir}`,
          itemId: String(itemId),
          origin,
          sink: {
            update: (p) => {
              const dx = (p.clientX - origin.clientX) / fr.width;
              const dy = (p.clientY - origin.clientY) / fr.height;
              croppingState.setDraft(resizeCropWindow(start, dir, dx, dy));
            },
          },
        });
        return;
      }
      const orig = frameAccess.readFrame(itemId);
      if (orig === undefined) return;
      const parent = frameAccess.parentRectOf(itemId);
      const sessionId = `${String(itemId)}/resize/${seq++}`;
      startHandleGesture({
        kind: "frame-resize",
        handleId: `resize.${dir}`,
        itemId: String(itemId),
        origin,
        sink: {
          update: (p) =>
            frameAccess.commitFrame(
              itemId,
              frameAccess.computeResize(
                orig,
                dir,
                p.clientX - origin.clientX,
                p.clientY - origin.clientY,
                parent,
              ),
              sessionId,
            ),
        },
      });
    };

    document.body.addEventListener("pointerdown", onDown, { capture: true });
    return () => document.body.removeEventListener("pointerdown", onDown, { capture: true });
  }, [vm, frameAccess, frameDragAllowed]);

  // Single editor-level Esc → `router.cancelActive()` flow. agocraft
  // fans the call out to every attached host (in-flight binding's
  // onCancel runs, mode tokens release) AND clears `vm.rubberBand`
  // for any lingering reviewing/previewing popover. This replaces
  // the prior per-RubberBandLayer Esc listener which only touched
  // visual state and left the binding mid-drag — so a follow-up
  // pointerup re-opened the popover. Active-element guard so text
  // editing keeps its own Esc behaviour.
  useEffect(() => {
    if (router === null) return undefined;
    if (typeof document === "undefined") return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.matches('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      router.cancelActive();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  // WI-033 P2 — drive the design-plane transform spring from base*
  // alone (drill-in zoom retired DR-017). With `from === to === base
  // camera`, the spring's animate() is a no-op when base camera
  // WI-033 P2 — design-plane transform is just base camera now (drill
  // spring + useTransform chain retired). Each motion value owns one
  // axis of the base transform; the useEffect below keeps them in
  // sync when the outer size or design size changes.
  const planeTxMV = useMotionValue(baseTx);
  const planeTyMV = useMotionValue(baseTy);
  const planeScaleMV = useMotionValue(baseScale);
  useEffect(() => {
    planeTxMV.set(baseTx);
    planeTyMV.set(baseTy);
    planeScaleMV.set(baseScale);
  }, [baseTx, baseTy, baseScale, planeTxMV, planeTyMV, planeScaleMV]);

  // Total on-screen scale = base camera × user pan zoom. Provided via
  // context so every descendant (NestedFrame, CanvasBlock shapes, …) can
  // compute its display size and gate hit-testing once the visible footprint
  // drops below `HIT_THRESHOLD_PX`.
  const totalScaleMV = useMotionValue(baseScale * pan.scale);
  useEffect(() => {
    const update = () => {
      const next = planeScaleMV.get() * (infiniteCanvas ? pan.scale : 1);
      if (next !== totalScaleMV.get()) totalScaleMV.set(next);
    };
    update();
    const off = planeScaleMV.on("change", update);
    return off;
  }, [planeScaleMV, pan.scale, infiniteCanvas, totalScaleMV]);

  const handleBackgroundClick = useCallback(() => {
    if (!selectionAllowedOuter) return;
    onSelect?.(undefined);
  }, [onSelect, selectionAllowedOuter]);

  // Double-click on truly empty design-plane space → fit the camera to all
  // items. Frames stop dblclick propagation (their own click-counter does
  // fit-to-frame), so this fires only off-frame; the closest() guard is a
  // belt-and-suspenders check against any future bubbling child.
  const handleBackgroundDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionAllowedOuter) return;
      if (e.target instanceof Element && e.target.closest("[data-frame-id]") !== null) return;
      onFitAll?.();
    },
    [onFitAll, selectionAllowedOuter],
  );

  // viewport → design pixel converter for the rubber-band layer. The
  // design plane carries the full transform chain (pan × drill), so its
  // `getBoundingClientRect` is the cleanest source of truth: scale via
  // its on-screen size, offset by its on-screen origin. Result coords sit
  // in design-pixel space regardless of how the user has panned/zoomed
  // (clientToDesignLocal moved earlier — declared near the start of
  // FrameStage so the outer router useEffect can include it in deps.)

  // Cursor reflects pan affordance: grab when pan is armed (Space held or
  // Hand-tool active), grabbing while a pan drag is in flight (vm.pan
  // is non-null while PanBinding owns the gesture).
  const [panDragging, setPanDragging] = useState(false);
  useEffect(() => {
    if (vm === null) return undefined;
    return vm.pan.subscribe((p) => setPanDragging(p !== null));
  }, [vm]);
  const panCursor: CSSProperties["cursor"] | undefined = panActive
    ? panDragging
      ? "grabbing"
      : "grab"
    : undefined;
  // WI-037 — derive gesture-active from existing pan drag state plus
  // the wheel-recency signal hoisted above the wheel handler.
  const gestureActive = panDragging || recentWheel;

  // DR-027 / WI-071 Phase 3 — viewport culling registry extracted to a hook.
  const cullRegistry = useViewportCulling(infiniteCanvas, outerRef);

  return (
    <TotalScaleContext.Provider value={totalScaleMV}>
      <ViewportCullContext.Provider value={cullRegistry}>
        <div
          ref={outerRef}
          className="absolute inset-0 overflow-hidden"
          // Design canvas background comes from `design.background` (model-
          // driven). Fresh designs default to the theme page-bg token
          // (`var(--bg-page)`); CSS resolves it per the active theme. Legacy
          // designs without a stored background fall back to white. Documents
          // float on this plane and
          // provide their own content; the same plane renders in edit and
          // presentation. `touch-action: none` keeps trackpad / touchscreen
          // pinch gestures from triggering browser-level page zoom (which
          // would slide the header / thumbnail panel out of the viewport).
          // Wheel preventDefault for the same reason lives on a native non-
          // passive listener — see the `useEffect` above. `data-canvas` +
          // `data-bg-tone` scope the document-context CSS tokens so that
          // text/surface variables stay readable against this background no
          // matter which UI theme the editor chrome uses.
          style={{
            background,
            touchAction: "none",
            // Disable native text-range selection across the design surface.
            // Without this, dragging that starts on a text label (frame
            // titles, slide headings, bullet text) becomes a browser text
            // selection — the rubber-band gesture never fires because the
            // browser is busy highlighting characters. Only elements that
            // have actively entered edit mode (`contenteditable="true"`,
            // explicit inputs/textarea) opt back into text selection — see
            // the corresponding rule in `apps/web/src/styles.css`.
            userSelect: "none",
            WebkitUserSelect: "none",
            ...(panCursor ? { cursor: panCursor } : {}),
          }}
          data-canvas="document"
          data-bg-tone={bgTone}
          onClick={handleBackgroundClick}
          // Double-click empty canvas → fit camera to all items (restored).
          // DR-017 Phase 2 — pan gesture now lives on the GestureRouter
          // (capture phase); legacy React onPointer handlers removed.
          onDoubleClick={handleBackgroundDoubleClick}
          onDragOver={onDragOver}
          onDrop={onDropAdd ? (e) => onDropAdd(e, rootId) : undefined}
          data-testid="frame-stage"
          data-design-root-id={rootId}
          data-pan-active={panActive ? "true" : undefined}
        >
          {(() => {
            // WI-033 P2 — Phase 13e drill dim flags retired. No frame is
            // dimmed under selection-only navigation.
            // WI-036 follow-up — `multiSelectionUnion` computation removed
            // along with its chrome (legacy 2px solid outline + 4 round
            // corner dots + count badge). The host-level
            // MultiSelectionOverlay (DesignPage, viewport-fixed) owns the
            // multi-selection visual now.
            const planeChildren = frames.map((c, _i) => (
              <NestedFrame
                key={String(c.id)}
                item={c}
                parentWidthPx={designWidth}
                parentHeightPx={designHeight}
                editing={editing}
                selectedId={props.selectedId}
                {...(props.selectedIds !== undefined ? { selectedIds: props.selectedIds } : {})}
                {...(props.dimmedFrameIds !== undefined
                  ? { dimmedFrameIds: props.dimmedFrameIds }
                  : {})}
                {...(props.isolatedFrameIds !== undefined
                  ? { isolatedFrameIds: props.isolatedFrameIds }
                  : {})}
                {...(onToggleSelect !== undefined ? { onToggleSelect } : {})}
                onSelect={onSelect}
                doc={props.document}
                onContextMenuRequest={handleFrameContextMenu}
                onUpdateItem={props.onUpdateItem}
                onUpdateShape={props.onUpdateShape}
                onRemoveShape={props.onRemoveShape}
                onDropAdd={onDropAdd}
                onDragOver={onDragOver}
                renderFrameMenu={wrappedRenderFrameMenu}
                onCommitFrame={props.onCommitFrame}
                selectedHotspotId={props.selectedHotspotId}
                onSelectHotspot={props.onSelectHotspot}
                onCommitHotspotRegion={props.onCommitHotspotRegion}
              />
            ));
            // The design-plane subtree — pan layer (user offset/zoom) wrapping
            // the design plane motion.div (drill spring transform). Frames
            // live inside the design plane so their positions interpret as
            // design-pixel coords; everything outside is just transform chrome.
            const planeSubtree = (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  ...(infiniteCanvas
                    ? {
                        transform: `translate(${pan.tx}px, ${pan.ty}px) scale(${pan.scale})`,
                        transformOrigin: "center center",
                      }
                    : {}),
                }}
              >
                <motion.div
                  ref={designPlaneRef}
                  data-design-plane="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: `${designWidth}px`,
                    height: `${designHeight}px`,
                    transformOrigin: "top left",
                    x: planeTxMV,
                    y: planeTyMV,
                    scale: planeScaleMV,
                    // WI-037 / DR-018 — only hint will-change while a
                    // zoom/pan gesture is active. See the comment on
                    // `gestureActive` (top of the FrameStage body) for the
                    // tile-drop failure mode this guards against.
                    willChange: gestureActive ? "transform" : undefined,
                  }}
                >
                  {planeChildren}
                  {/* WI-074 D8b — the crop dim is no longer a plane-level overlay.
                      It is a spotlight (box-shadow hole) rendered inside the
                      cropping ImageBlock so it dims the whole canvas EXCEPT the
                      crop window, with no seam against the source image. The
                      cropping frame still raises its z (NestedFrame) so its
                      spotlight covers sibling items. */}
                  {/* WI-040 Phase 3 — host-supplied hover overlay
                  (`HoverAffordanceLayer` in DesignPage). Lives inside
                  the camera-transformed subtree so the projector's
                  design-space px line up exactly with the rendered
                  frames. Sits between planeChildren and the legacy
                  multi-selection placeholder; the SelectionLayer +
                  multi-selection chrome (mounted via portal to body)
                  naturally paint on top. */}
                  {renderHoverOverlay?.()}
                  {/* WI-036 follow-up — legacy multi-selection-chrome
                  (solid 2px outline + 4 round dot corners + count
                  badge) removed. The host-level MultiSelectionOverlay
                  (in DesignPage, viewport-fixed) now owns the multi
                  affordance as a dashed marquee + square handles. */}
                </motion.div>
              </div>
            );
            // RubberBandLayer hosts pointer events on its outermost wrapper —
            // by sitting *outside* the pan + drill transforms, that wrapper
            // is always viewport-sized and the user can start a drag-to-add
            // anywhere on screen regardless of how far the canvas has been
            // panned or zoomed. The visual rect is portalled back into the
            // design plane so its design-pixel coords get the same transform
            // chain as the frames they create.
            // Empty-region acceptance — same filter for both layers. The
            // marquee starts on truly empty design-plane background only;
            // pressing on a frame/shape/handle defers to inner bindings.
            const emptyRegionAccept = (target: Element) => {
              // Idle-only gate. Hand / panning / rubber-band / frame-manipulating
              // / text-editing / context-menu all need to keep ownership of the
              // pointer flow; the marquee (and the alt-rubber-band downstream)
              // must not start under any of those modes.
              if (!selectionAllowedOuter) return false;
              if (!(target instanceof HTMLElement)) return true;
              // WI-034 — frame body 의 빈 영역도 OK. RubberBand 의
              // commit adapter (`adaptWeaveCapabilityToAgocraft`) 가
              // drag rect 의 center 좌표로 hit-test → deepest frame 을
              // containerId 로 사용. 즉 frame 안 Alt+drag → 그 frame
              // 의 child 로 추가. 단 frame 의 child element (shape /
              // handle / contenteditable / hotspot) 는 여전히 reject
              // — 그쪽 element 의 own pointer flow 가 우선.
              return (
                target.closest("[data-shape-id]") === null &&
                target.closest("[data-selection-layer]") === null &&
                target.closest("[data-selection-handle-item-id]") === null &&
                target.closest("[data-handle-kind]") === null &&
                target.closest("[data-hotspot-id]") === null &&
                target.closest('[contenteditable="true"]') === null &&
                target.closest("input, textarea, button, a") === null
              );
            };
            return editor !== undefined ? (
              // Marquee is the OUTER layer: plain drag (alt forbidden) hits it
              // first. When Alt is held, the modifier predicate fails and the
              // event falls through to RubberBandLayer (alt required).
              <MarqueeSelectionLayer
                containerSize={{ width: designWidth, height: designHeight }}
                clientToLocal={clientToDesignLocal}
                getFrames={() =>
                  root.children
                    .filter(isDomainItem)
                    // WI-039 — focus-gate parity with single-click. A dimmed
                    // (stage 1) or isolated (stage 2) frame carries
                    // pointer-events:none, so a click never lands on it; the
                    // marquee hit-tests document geometry directly and would
                    // otherwise still scoop it into a drag selection. Exclude
                    // the same id sets the per-frame hit gate consults so both
                    // selection paths agree on what is interactive.
                    .filter((c) => {
                      const id = String(c.id);
                      return (
                        !(props.dimmedFrameIds?.has(id) ?? false) &&
                        !(props.isolatedFrameIds?.has(id) ?? false)
                      );
                    })
                    .map((c) => {
                      const f = (c.attrs as { frame?: ItemFrame }).frame ?? {
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                        rotation: 0,
                      };
                      // Hit-test against the item's axis-aligned OUTER bounds so
                      // a rotated frame is marquee-selected by its visible
                      // extent, not its unrotated slot. rotation 0 → the raw box.
                      // (Top-level children live in the unrotated root space, so
                      // the box maps straight to design px.)
                      const wpx = f.width * designWidth;
                      const hpx = f.height * designHeight;
                      const cx = (f.x + f.width / 2) * designWidth;
                      const cy = (f.y + f.height / 2) * designHeight;
                      const rot = f.rotation ?? 0;
                      const co = Math.abs(Math.cos(rot));
                      const si = Math.abs(Math.sin(rot));
                      const bw = wpx * co + hpx * si;
                      const bh = wpx * si + hpx * co;
                      return {
                        id: String(c.id),
                        x: cx - bw / 2,
                        y: cy - bh / 2,
                        width: bw,
                        height: bh,
                      };
                    })
                }
                acceptTarget={emptyRegionAccept}
                onSelectIntent={(intent, ids) => {
                  onMarqueeSelect?.(intent, ids);
                }}
                visualHost={designPlaneRef}
                style={{ position: "absolute", inset: 0 }}
              >
                <RubberBandLayer
                  containerKind="design"
                  containerId={String(root.id)}
                  containerSize={{ width: designWidth, height: designHeight }}
                  editor={editor}
                  // WI-034 — adapter 의 deepest-frame hit-test 가 live
                  // doc snapshot read. docRef 의 mutation 은 docInAgocraft
                  // 의 매 render assignment.
                  getDocument={() => docRef.current}
                  snapSize={20}
                  clientToLocal={clientToDesignLocal}
                  visualHost={designPlaneRef}
                  // Single source of truth: alt-gating reads from the
                  // InsertableCapability registry.  Same field the cursor
                  // tooltip describer consults, so any future container
                  // (a frame-as-container, a group, …) only has to set
                  // `requireAltKey` once in its capability and BOTH the
                  // gesture gate AND the hover hint update together.
                  requireAltKey={designCapability?.requireAltKey === true}
                  acceptTarget={emptyRegionAccept}
                  style={{ position: "absolute", inset: 0 }}
                >
                  {planeSubtree}
                </RubberBandLayer>
              </MarqueeSelectionLayer>
            ) : (
              planeSubtree
            );
          })()}
        </div>
      </ViewportCullContext.Provider>
    </TotalScaleContext.Provider>
  );
}
