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
  createFrameResizeBinding,
  createFrameRotateBinding,
  createModifierOverride,
  createPanBinding,
  createRubberBandBinding,
  type FrameAccess,
  type FrameGeom,
  GESTURE_PRIORITY_ELEMENT_BODY,
  GESTURE_PRIORITY_ELEMENT_HANDLE,
  GESTURE_PRIORITY_FALLBACK,
  type ResizeDir,
  resolveAnchor,
} from "@agocraft/editor";
import type { SelectionHandleDir as HandleDir } from "@weave/design-system";
import { SelectionLayer } from "@weave/design-system";
import { type MotionStyle, motion, useMotionValue, useMotionValueEvent } from "motion/react";
import type React from "react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgoItem, DomainKind, ItemFrame } from "../document";
import {
  useFrameDragBindingsAllowed,
  useFrameSelectionAllowed,
  useInteractionMode,
  useSelectionChromeVisible,
} from "../document";
import { isDomainItem } from "../document/agocraft-mirror.js";
import { deriveTextAutoResize as deriveTextAutoResizeForFrameStage } from "../document/domains/derive-text-auto-resize.js";
import { ParentFrameHeightContext } from "../document/domains/parent-frame-context.js";
import { defaultInsertableRegistry } from "../document/insertable/default-registry.js";
import { EditorVMContext } from "../document/interactions/editor-vm-context.js";
import { useRouterOrNull } from "../document/interactions/router-context.js";
import { useSelectionChromeOrNull } from "../document/interactions/selection-chrome-context.js";
import {
  type ClickIntent,
  type Selection,
  SelectionVmContext,
  selectFromHit,
} from "../document/interactions/selection-context.js";
import {
  HIT_THRESHOLD_PX,
  TotalScaleContext,
} from "../document/interactions/total-scale-context.js";
import {
  CULL_ROOT_MARGIN,
  FrameCulledContext,
  ViewportCullContext,
  type ViewportCullRegistry,
} from "../document/interactions/viewport-cull-context.js";
import { findFramesAtPoint, type LayerHit } from "../document/layer-picker/index.js";
// WI-019/WI-021 — layout-driven manipulation constraints. The agocraft
// LayoutEngine is the single owner: weave only READS
// `getChildConstraints` and reflects it in the selection chrome (resize
// handles) + move gate. No layout branching lives here.
import { getLayoutEngine, LAYOUT_FEATURE_ENABLED } from "../document/layout/registry.js";
import { MarqueeSelectionLayer } from "../document/marquee/MarqueeSelectionLayer.js";
import { FrameContent } from "../document/render/FrameContent.js";
import { adaptWeaveCapabilityToAgocraft } from "../document/rubber-band/agocraft-adapter.js";
import { RubberBandLayer } from "../document/rubber-band/RubberBandLayer.js";
import { createFrameDefaultViewModel } from "../document/selection-chrome/frame-default-view-model.js";
import { type DesignBox, setCameraFitBox } from "./frame-camera-bridge.js";

/** WI-033 A4 — context passed to `renderFrameMenu` so the callback
 *  (typically a per-frame ContextMenu) can render a Layer Picker
 *  section listing every frame overlapping the right-clicked point.
 *  Empty `layers` → the section is elided. */
export interface FrameMenuContext {
  readonly layers: ReadonlyArray<LayerHit>;
  readonly onPickLayer: (id: string) => void;
}

const _ALL_HANDLES: ReadonlyArray<HandleDir> = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const MIN_FRAME = 0.02;

/** WI-037 follow-up — compute the next pan/zoom state for a scale change
 *  that anchors a specific viewport point. The point at `(anchor.x,
 *  anchor.y)` (in outer-container CSS px, top-left origin) stays under
 *  the cursor across the zoom: the design-pixel coord beneath it before
 *  the change equals the design-pixel coord beneath it after.
 *
 *  Caller convention:
 *  - **Pointer-driven** (wheel / pinch) → pass the event's
 *    `clientX/Y − rect.left/top`.
 *  - **Hotkey or zoom button** → pass the viewport centre,
 *    `{ x: outerW / 2, y: outerH / 2 }`.
 *
 *  Pure: takes prev pan + raw multiplicative factor, returns next pan.
 *  Honours the same `[0.1, 8]` scale clamp the wheel handler used to
 *  apply inline; the effective factor is re-derived after clamp so an
 *  anchored zoom that hits the limit does not drift. */
function nextPanForZoom(
  prev: { tx: number; ty: number; scale: number },
  factor: number,
  anchor: { x: number; y: number; outerW: number; outerH: number },
): { tx: number; ty: number; scale: number } {
  const nextScale = Math.max(0.1, Math.min(8, prev.scale * factor));
  const effective = nextScale / prev.scale;
  if (effective === 1) return prev;
  const { x: px, y: py, outerW: W, outerH: H } = anchor;
  // Outer pan div has `transform-origin: center center`, so a local
  // point lx maps to screen x = tx + W/2 + (lx − W/2) * scale.
  // Solve for tx_new such that the same lx still lands at px after the
  // scale change: tx_new = px − W/2 − (px − tx − W/2) * effective.
  return {
    scale: nextScale,
    tx: px - W / 2 - (px - prev.tx - W / 2) * effective,
    ty: py - H / 2 - (py - prev.ty - H / 2) * effective,
  };
}

function _resizeFrame(orig: ItemFrame, dx: number, dy: number, dir: HandleDir): ItemFrame {
  let { x, y, width, height } = orig;
  if (dir.includes("e")) {
    width = Math.max(MIN_FRAME, orig.width + dx);
  }
  if (dir.includes("w")) {
    const newW = Math.max(MIN_FRAME, orig.width - dx);
    x = orig.x + (orig.width - newW);
    width = newW;
  }
  if (dir.includes("s")) {
    height = Math.max(MIN_FRAME, orig.height + dy);
  }
  if (dir.includes("n")) {
    const newH = Math.max(MIN_FRAME, orig.height - dy);
    y = orig.y + (orig.height - newH);
    height = newH;
  }
  return { x, y, width, height, rotation: orig.rotation };
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

interface NestedFrameProps {
  readonly item: AgocraftItem;
  readonly parentWidthPx: number;
  readonly parentHeightPx: number;
  /** When true (edit mode) the frame paints its outline / hairline border
   *  and exposes manipulation handles. When false (present-style read-only)
   *  the frame is invisible chrome — only its domain renderer paints. */
  readonly editing: boolean;
  readonly selectedId: string | undefined;
  /** Multi-selection — every id in here renders the selected outline. The
   *  legacy `selectedId` stays for hover/scroll routing (the "primary" pick
   *  in a multi-selection). When undefined, single-id semantics apply. */
  readonly selectedIds?: ReadonlySet<string>;
  /** WI-039 — Stage 1 set. Every id in here paints at
   *  `--focus-dim-opacity` AND has its pointer-events forced off by the
   *  hit gate. The host computes the entire above-tree subtree, so the
   *  per-frame gate blocks the whole branch (the parent-only set would
   *  leave nested descendants interactive — `pointer-events` is re-applied
   *  per wrapper, not inherited through the cascade once a child sets
   *  its own value). */
  readonly dimmedFrameIds?: ReadonlySet<string>;
  /** WI-039 — Stage 2 set. Every id in here paints at
   *  `--focus-isolate-opacity` (0 — invisible) AND has its pointer-events
   *  forced off. The host computes the entire outside-tree subtree for
   *  the same per-wrapper-gate reason as above. Stage 1 and Stage 2 are
   *  mutually exclusive (at most one is non-empty at a time). */
  readonly isolatedFrameIds?: ReadonlySet<string>;
  /** Toggle this frame in/out of the multi-selection. Fired on
   *  Shift / Cmd / Ctrl + click. Absent → modifier clicks fall back to
   *  the single-replace behaviour. */
  readonly onToggleSelect?: (itemId: string) => void;
  // WI-033 P2 — `enteredId` / `enteredTrailIds` (Phase 12+13e drill-in
  // wiring) removed alongside the drill-in mode (DR-017).
  readonly onSelect: ((id: string | undefined) => void) | undefined;
  readonly onUpdateItem: FrameStageProps["onUpdateItem"];
  readonly onUpdateShape: FrameStageProps["onUpdateShape"];
  readonly onRemoveShape: FrameStageProps["onRemoveShape"];
  readonly onDropAdd: FrameStageProps["onDropAdd"];
  readonly onDragOver: FrameStageProps["onDragOver"];
  readonly renderFrameMenu: FrameStageProps["renderFrameMenu"];
  /** Update this frame's `attrs.frame` directly. Phase 12b — manipulation
   *  handles dispatch through this. */
  readonly onCommitFrame: ((itemId: string, next: ItemFrame) => void) | undefined;
  // WI-033 P2 — `onEnter` (Phase 12c double-click drill-in callback)
  // removed.
  /** Phase 13c-2 — hotspot overlay editing on the selected frame. */
  readonly selectedHotspotId: string | undefined;
  readonly onSelectHotspot: ((hotspotId: string | undefined) => void) | undefined;
  readonly onCommitHotspotRegion:
    | ((
        itemId: string,
        hotspotId: string,
        region: { x: number; y: number; width: number; height: number },
      ) => void)
    | undefined;
  // WI-033 P2 — Phase 13e `drillDimmed` + `drillProgressMV` props
  // removed alongside the drill-in opacity / dim chain in
  // NestedFrame's body. No frame is ever dimmed today.
  /** WI-033 A1+A2 — the AgocraftDocument that owns this frame's tree.
   *  When provided, NestedFrame's onClick routes through `selectFromHit`
   *  to apply Figma's parent-first auto-select + Cmd/Ctrl deep-select
   *  semantics. When undefined, falls back to the legacy "select the
   *  clicked frame" behaviour (backward compat for any caller that
   *  hasn't been wired yet). */
  readonly doc?: AgocraftDocument | undefined;
  /** WI-033 A4 — fired on right-click. Caller (FrameStage) converts the
   *  viewport coords to design-plane local, runs `findFramesAtPoint`,
   *  and stashes the overlapping-layers list so the FrameContextMenu
   *  can render a "Select layer" section. NestedFrame's responsibility
   *  stops at capturing the event coords. */
  readonly onContextMenuRequest?:
    | ((itemId: string, clientX: number, clientY: number) => void)
    | undefined;
}

function NestedFrame({
  item,
  parentWidthPx,
  parentHeightPx,
  editing,
  selectedId,
  selectedIds,
  dimmedFrameIds,
  isolatedFrameIds,
  onToggleSelect,
  onSelect,
  onUpdateItem,
  onUpdateShape,
  onRemoveShape,
  onDropAdd,
  onDragOver,
  renderFrameMenu,
  onCommitFrame,
  selectedHotspotId,
  onSelectHotspot,
  onCommitHotspotRegion,
  doc,
  onContextMenuRequest,
}: NestedFrameProps) {
  const itemId = String(item.id);
  // WI-033 — vm reference for synchronous selection read inside onClick.
  // React state (`selectedId` prop) can be stale within the same event
  // batch when FrameMoveBinding's capture-phase `vm.itemSelection.set(...)`
  // already mutated the selection before our onClick fires; the vm
  // signal's `state.get()` always returns the latest.
  const _selectionVm = useContext(SelectionVmContext);
  // Manipulation handle drags publish "frame-manipulating" so tooltips don't
  // race with the gesture. The transition is guarded — if a context menu or
  // pan happens to win the press, we don't stomp their mode.
  const _im = useInteractionMode();
  // Selection only runs in `idle`. Hand / panning / rubber-band /
  // frame-manipulating / text-editing / context-menu each own their own
  // event flow and must not have a parallel selection happen alongside.
  const selectionAllowed = useFrameSelectionAllowed();
  // WI-040 — selection chrome (outline + handles) hides when LayerPicker
  // open (context-menu), Space-pan (hand), or mid-rubber-band; stays on
  // through `idle`, `frame-manipulating` (handles glued through drag),
  // and `text-editing` (frame still resizable while typing).
  const chromeVisible = useSelectionChromeVisible();
  // DR-018 — selection chrome registry. Cross-cutting providers (plugins,
  // AI selection-actions, future domain extensions) register here; the
  // NestedFrame's `<SelectionLayer>` resolver merges their specs with
  // the kind's default view-model below.
  const selectionChrome = useSelectionChromeOrNull();
  const selectionChromeRef = useRef(selectionChrome);
  selectionChromeRef.current = selectionChrome;

  // WI-033 P2 — manual 2-click fit-to-frame counter removed. It used to
  // dispatch `onEnter?.(itemId)` (drill-in) on the second qualifying
  // click and `return` early, which prevented `selectFromHit` from
  // running. With drill-in retired (DR-017) and the counter's reason
  // for existing gone, the frame's onClick path now runs `selectFromHit`
  // on every press — A1's parent-first heuristic does its own
  // "current selection in trail → drill to leaf" derivation.
  const attrs = item.attrs as { frame?: ItemFrame };
  const frame = attrs.frame;
  const selfRef = useRef<HTMLDivElement>(null);
  // DR-017 Phase 4 complete — frame move / resize / rotate gestures all
  // live on agocraft's `createFrame{Move,Resize,Rotate}Binding`
  // registered against the FrameStage outer host. No `dragRef`, no
  // `startMove` / `startResize` / `startRotate` callbacks, no
  // `onPointerMove` / `endDrag` here. Resize / Rotate handles emit
  // their `data-handle-kind` + `data-handle-dir` so the bindings'
  // `resolveResizeDir` / `resolveRotateHandle` can dispatch.

  // Compute the frame's design-pixel footprint up front so the hit-gate
  // hook below can read it. We deliberately compute against `frame` /
  // parent sizes whether `frame` is defined or not — when it's undefined
  // the values are NaN and the hit gate early-returns. This keeps the
  // hooks below in stable order regardless of frame state.
  const widthPx = parentWidthPx * (frame?.width ?? 0);
  const heightPx = parentHeightPx * (frame?.height ?? 0);

  // Display-size hit gate. The frame is interactive only while its on-
  // screen footprint clears `HIT_THRESHOLD_PX` in both dimensions.
  // Updates happen via ref mutation on every scale change (drill spring,
  // pan zoom, mount layout) so the gate stays accurate without re-rendering
  // the frame tree on every animation frame.
  //
  // WI-039 — the gate also yields to z-order focus gating: both Stage-1
  // dim and Stage-2 isolate force `pointerEvents = none` regardless of
  // display size, so the focused tree underneath stays editable. The two
  // sets are read through ref-snapshots (not deps entries) so the hot
  // path doesn't rebind on every selection change; the post-mount effect
  // below pokes the gate when either set itself changes.
  const isolatedRef = useRef<boolean>(isolatedFrameIds?.has(itemId) ?? false);
  isolatedRef.current = isolatedFrameIds?.has(itemId) ?? false;
  const dimmedGatedRef = useRef<boolean>(dimmedFrameIds?.has(itemId) ?? false);
  dimmedGatedRef.current = dimmedFrameIds?.has(itemId) ?? false;
  const totalScaleFromCtx = useContext(TotalScaleContext);
  const totalScaleFallback = useMotionValue(1);
  const totalScaleMV = totalScaleFromCtx ?? totalScaleFallback;
  const applyHitGate = useCallback(
    (scale: number) => {
      const el = selfRef.current;
      if (el === null) return;
      if (isolatedRef.current || dimmedGatedRef.current) {
        el.style.pointerEvents = "none";
        return;
      }
      const dw = widthPx * scale;
      const dh = heightPx * scale;
      el.style.pointerEvents = Math.min(dw, dh) >= HIT_THRESHOLD_PX ? "auto" : "none";
    },
    [widthPx, heightPx],
  );
  useLayoutEffect(() => {
    applyHitGate(totalScaleMV.get());
  }, [applyHitGate, totalScaleMV]);
  // Re-poke the gate whenever either focus set flips so the latest set
  // takes effect immediately instead of waiting for the next scale change.
  useLayoutEffect(() => {
    applyHitGate(totalScaleMV.get());
  }, [applyHitGate, totalScaleMV, isolatedFrameIds, dimmedFrameIds]);
  useMotionValueEvent(totalScaleMV, "change", (s) => {
    applyHitGate(s);
  });

  // WI-058 / DR-021 — viewport culling. Register this frame's wrapper with
  // the IntersectionObserver published by FrameStage (infinite canvas only;
  // null in stacked/fit flavors and the read-only present path). When the
  // frame leaves the viewport + buffer the registry flips it to
  // `visibility: hidden`, dropping its paint/raster; re-entry restores it.
  // Direct `style.visibility` ref-mutation keeps this off the React render
  // path, exactly like `applyHitGate` above.
  // `culled` (React state) flips only on a viewport-cross transition and is
  // published to this frame's content via FrameCulledContext so ImageBlock can
  // drop its decoded bitmap (WI-058 Phase 2a). The `visibility` toggle stays a
  // direct ref-mutation (immediate, mid-gesture-safe, no re-render).
  const cull = useContext(ViewportCullContext);
  const [culled, setCulled] = useState(false);
  useEffect(() => {
    const el = selfRef.current;
    if (cull === null || el === null) return;
    return cull.observe(el, (visible) => {
      el.style.visibility = visible ? "" : "hidden";
      setCulled(!visible);
    });
  }, [cull]);

  if (frame === undefined) return null;

  const leftPx = parentWidthPx * frame.x;
  const topPx = parentHeightPx * frame.y;

  const kind = item.kind as DomainKind;

  // Selection outline — every id in `selectedIds` (Figma marquee) gets
  // the accent outline; the legacy `selectedId` is still the primary
  // pick (drives drill / handle attachment). For single-select the two
  // agree.
  const isSelected = selectedIds !== undefined ? selectedIds.has(itemId) : selectedId === itemId;
  // WI-036 follow-up v2 — every selected frame mounts its own
  // per-frame handle set (single OR multi). The multi-selection
  // bounding box (marquee + 4 corner handles) lives at the host
  // level, layered above. So a frame's handles surface whenever it
  // is part of the selection.
  const isPrimarySelection = isSelected;
  // WI-036 follow-up v3 — multi-selection visual cleanup. When two or
  // more frames are selected, the host-level dashed marquee owns the
  // "selected" indicator; per-frame solid outlines would draw a
  // redundant second line over the same boundary. Suppress them.
  const _isMultiSelection = selectedIds !== undefined && selectedIds.size > 1;
  const childFrames = item.children.filter(isDomainItem);

  // WI-033 P2 — Phase 13e drill-in opacity / dim chain removed
  // (drillFromRef / drillToRef / sourceMV / drillProgressMV useTransform).
  // With drill-in mode retired (DR-017) no frame is ever drillDimmed,
  // so the staggered opacity timeline collapses to a static 1.

  const style: CSSProperties = {
    position: "absolute",
    left: `${leftPx}px`,
    top: `${topPx}px`,
    width: `${widthPx}px`,
    height: `${heightPx}px`,
    transformOrigin: "center center",
    // Inner items (slide bullets that bleed below, canvas shapes drawn
    // past the frame, doc paragraphs that wrap longer than the frame…)
    // are rendered without clipping at the frame level — they show the
    // way the author placed them rather than the frame chopping them off.
    overflow: "visible",
    // Frame chrome (outline / border) only renders in edit mode. Unselected
    // frames get a hairline so users can see the frame boundary while
    // authoring; the SELECTED outline is owned exclusively by SelectionLayer
    // (portal'd to body, constant stroke under camera zoom) — painting a
    // second outline on the wrapper produced a redundant rounded rect over
    // SelectionLayer's sharp accent ring.
    // Presentation pass renders documents as bare content on the white stage.
    outline: editing && !isSelected ? "1px solid var(--surface-1-border)" : undefined,
    outlineOffset: editing && !isSelected ? -1 : undefined,
    borderRadius: editing && !isSelected ? "var(--radius-md)" : undefined,
    boxSizing: "border-box",
    // Document background is transparent by default — the design's white
    // canvas shows through. Each domain renderer paints its own content.
    background: "transparent",
    // WI-039 — host-driven z-order focus, visual side.
    //
    // Stage 1 (id ∈ dimmedFrameIds): wrapper opacity drops to
    //   `--focus-dim-opacity` (≈ 0.28). Pointer events are blocked by the
    //   hit gate above so this branch is non-interactive too. Nested
    //   members of the set get the same opacity applied to their own
    //   wrapper — visually the cascade multiplies (0.28 × 0.28 ≈ 0.08)
    //   which reads as "deeper layers recede further", an acceptable
    //   side-effect for the rare nested-frame case.
    // Stage 2 (id ∈ isolatedFrameIds): opacity drops to
    //   `--focus-isolate-opacity` (0 — fully invisible) and pointer
    //   events are blocked. The host populates the set with the entire
    //   outside-tree subtree.
    // The two sets are mutually exclusive (host enforces). The
    // pointer-events block lives in `applyHitGate` above (single
    // authority over `style.pointerEvents`, so React-managed style and
    // the imperative gate don't fight).
    opacity: isolatedFrameIds?.has(itemId)
      ? "var(--focus-isolate-opacity, 0)"
      : dimmedFrameIds?.has(itemId)
        ? "var(--focus-dim-opacity, 0.28)"
        : 1,
    transition: "opacity 180ms ease",
    ...(frame.rotation ? { transform: `rotate(${frame.rotation}rad)` } : {}),
  };

  const inner = (
    <motion.div
      ref={selfRef}
      data-testid={`block-${kind}`}
      data-frame-id={itemId}
      data-frame-kind={kind}
      // Left-button pointerdown on a frame must NOT start the rubber band on
      // the parent design plane (right-click still bubbles to ContextMenuTrigger;
      // useRubberBand only acts on button=0 anyway). EXCEPT in hand / panning
      // modes: there the user explicitly armed the canvas-pan gesture, so the
      // frame is pass-through and the press must reach the outer FrameStage's
      // pan handler instead of being swallowed here.
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if (!selectionAllowed) return;
        const t = e.target;
        if (t instanceof HTMLElement) {
          // Children that own their own pointer gesture get the press
          // first; the frame should NOT also select / start dragging.
          //
          // We also `stopPropagation` here so the editor-level
          // RubberBandLayer (an ancestor of every NestedFrame) does NOT
          // *additionally* start an "add new doc" gesture from the same
          // press. Without this, dragging across an inner contenteditable
          // / canvas shape / hotspot fires two things at once: the
          // inner element's intended interaction (cursor placement,
          // shape selection, …) AND the recommendation popover opens
          // on release — the duplicate the user flagged after the
          // overflow:visible change exposed it, because slide bullets
          // that visually bleed below the frame now sit on top of what
          // looks like empty space. The inner element's native default
          // (e.g. cursor placement in contenteditable) has already
          // happened by the time bubble reaches us, so silencing the
          // synthetic propagation here doesn't suppress it.
          if (
            t.closest("[data-shape-id]") !== null ||
            t.closest('[contenteditable="true"]') !== null ||
            t.closest("input, textarea") !== null ||
            t.closest("[data-selection-layer]") !== null ||
            t.closest("[data-hotspot-id]") !== null
          ) {
            e.stopPropagation();
            return;
          }
        }
        // DR-017 Phase 4 — frame-body presses are claimed by the
        // FrameMoveBinding at the GestureRouter's capture phase BEFORE
        // this React handler fires. If we reach here it means the
        // router declined (e.g., editor.viewModel.requestMode failed
        // because another mode owns the canvas, or the binding's
        // canStart returned false). In that case we still want to
        // surface a select so click-only presses keep selecting the
        // frame for non-drag flows (e.g., read-only embeds with no
        // commit handler).
        //
        // WI-033 NOTE: when the router DOES claim (the common path),
        // FrameMoveBinding does its own `vm.itemSelection.set(itemId)`
        // raw single-replace (frame-manip.ts:154), which fights with
        // A1's parent-first heuristic in `selectFromHit`. The Figma-
        // aligned override happens in `onClick` below. Removing the
        // raw set at its source requires an agocraft option (see
        // HANDOFF-011 — `CreateFrameMoveBindingDeps.disableSelectionSet`);
        // until that lands, A1/A2/A4 e2e specs report 7 fails.
        e.stopPropagation();
        onSelect?.(itemId);
      }}
      // The manual click counter on onClick handles the fit-to-frame
      // gesture; native dblclick is purely a defensive bubble interceptor
      // here. Without this stopPropagation, dblclick on a selected frame's
      // chrome would bubble to FrameStage's outer `onFitAll` and clear
      // the fit immediately after our counter set it. Outer's onDoubleClick
      // should fire ONLY on truly empty canvas presses.
      onDoubleClick={(e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
      }}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        // Only treat clicks on the frame *chrome* as a "select the frame"
        // gesture. Clicks that originate in interactive children — a canvas
        // shape, an EditableText, a form control, the inner SelectionLayer
        // handles — should leave the frame's selection state alone so the
        // inner element behaves normally. Hand/panning modes suppress
        // selection entirely so the pan tool stays the active gesture.
        //
        // The same handler runs a manual two-click detector. Both clicks of
        // a "double click on a frame" bubble through here even when the
        // first one mounts a SelectionLayer that catches the second one — a
        // case the browser's native `dblclick` refuses to fire on because
        // the targets differ. Two qualifying clicks within ~350ms trigger
        // the fit-to-frame gesture.
        if (!selectionAllowed) return;
        const t = e.target;
        if (t instanceof HTMLElement) {
          // Shape clicks live inside the canvas frame's inner SelectionLayer
          // surface — picking a shape *deselects* the frame so the two
          // SelectionLayers (frame + shape) don't compete. Not counted as
          // a frame click.
          if (t.closest("[data-shape-id]") !== null) {
            onSelect?.(undefined);
            return;
          }
          // Editable text / form inputs run their own click behavior; they
          // shouldn't add to the fit-gesture count. Also stop propagation
          // so the FrameStage outer's `handleBackgroundClick` doesn't fire
          // — without this, focusing a bullet textbox inside a (multi-)
          // selected frame would clear the selection because the click
          // bubbles past the (bailed) frame onClick to the outer's
          // background handler.
          if (
            t.closest('[contenteditable="true"]') !== null ||
            t.closest("input, textarea") !== null
          ) {
            e.stopPropagation();
            return;
          }
        }
        // Clicks that originate inside the (portal'd) SelectionLayer
        // chrome — resize / rotate handles, focus rings — are part of an
        // interaction on the *already-selected* frame. Do NOT let them
        // bubble: the FrameStage outer's `onClick` is wired to
        // `handleBackgroundClick` which would clear the selection, making
        // the chrome disappear the moment a handle gesture finished. Stop
        // here so the click is consumed at the frame level.
        if (t instanceof HTMLElement && t.closest("[data-selection-layer]") !== null) {
          e.stopPropagation();
          return;
        }
        // WI-033 P2 — manual 2-click counter removed alongside drill-in
        // mode. The counter used to fire `onEnter?.(itemId)` on the
        // second click and `return` early, which suppressed
        // `selectFromHit` and prevented A1's drill heuristic from
        // running. Text-edit double-click is still handled by the
        // EditableText component on `[data-double-click-edit="true"]`
        // (native dblclick → enter edit mode); the frame's onClick
        // path now just runs `selectFromHit` on every press.
        e.stopPropagation();
        // WI-033 — Figma selection model parity:
        //   • Shift (and Cmd+Shift / Ctrl+Shift) → multi-toggle. Adds
        //     or removes this frame from the multi-selection.
        //   • Cmd/Ctrl alone (no Shift) → deep select. Selects the
        //     clicked leaf regardless of nesting depth.
        //   • Plain click → parent-first auto-select. The first click
        //     into a context walks one level in from the root; once
        //     the current selection is on the trail to the hit, plain
        //     clicks drill all the way to the leaf.
        //
        // Plain click on a frame already in a multi-selection
        // preserves the multi (so the user can start a multi-drag
        // without the press collapsing the selection).
        //
        // Known limitation (HANDOFF-011 pending): when FrameMoveBinding
        // already raw-set the selection to `itemId` on pointerdown, our
        // `selectedId` prop is stale to the post-set value and A1's
        // "already-in-context" heuristic mis-drills. The fix requires
        // an agocraft `disableSelectionSet` binding option.
        const intent: ClickIntent = e.shiftKey
          ? "toggle"
          : e.metaKey || e.ctrlKey
            ? "deep"
            : "plain";
        if (intent === "toggle" && onToggleSelect !== undefined) {
          onToggleSelect(itemId);
          return;
        }
        if (selectedIds !== undefined && selectedIds.size > 1 && selectedIds.has(itemId)) {
          return;
        }
        if (doc !== undefined) {
          // WI-033 B — resolve the hit to the deepest `[data-frame-id]`
          // ancestor of the actual event target rather than this
          // NestedFrame closure's `itemId`. If a portal'd SelectionLayer
          // (pointer-events: none today, but defense-in-depth) or a
          // future overlay redirects React's event delegation to a
          // parent NestedFrame, the click should still resolve to the
          // frame the user visually clicked.
          const targetFrameId =
            (t instanceof HTMLElement
              ? t.closest("[data-frame-id]")?.getAttribute("data-frame-id")
              : null) ?? itemId;
          const current: Selection | null =
            selectedId === undefined ? null : { kind: "frame", id: selectedId };
          const next = selectFromHit(targetFrameId, intent, doc, current);
          onSelect?.(next === null ? targetFrameId : next.id);
          return;
        }
        onSelect?.(itemId);
      }}
      onContextMenuCapture={(e: React.MouseEvent<HTMLDivElement>) => {
        // WI-033 A4 — fire the Layer Picker request in the React
        // capture phase so the layers state is staged BEFORE Radix's
        // ContextMenuTrigger (bubble-phase listener) opens the menu.
        // React 18 batches both setStates so the menu's first render
        // sees the populated layers list.
        //
        // We don't preventDefault — Radix still needs the native event
        // to open. We don't stopPropagation either; the outer
        // FrameStage background's onContextMenu (if any) is irrelevant
        // because the bubble has been claimed by Radix's trigger, not
        // because we silenced it. Using `Capture` instead of the
        // bubble-phase `onContextMenu` avoids the Radix `asChild`
        // composeEventHandlers ordering that would otherwise cause
        // our inline handler to run too late to influence the menu's
        // first paint.
        if (onContextMenuRequest === undefined) return;
        if (!selectionAllowed) return;
        onContextMenuRequest(itemId, e.clientX, e.clientY);
      }}
      onDragOver={onDragOver}
      onDrop={
        onDropAdd
          ? (e: React.DragEvent<HTMLDivElement>) => {
              // The deepest hit-frame already handled the drop; stop the
              // event from bubbling to ancestor frames (each one would
              // otherwise dispatch `weave.item.add` again — WI-035 bug
              // "Toolbar drag → 중첩 frame 에 중복 add").
              e.stopPropagation();
              onDropAdd(e, itemId);
            }
          : undefined
      }
      style={style as MotionStyle}
    >
      {/* Phase 2 (fontSizeSpec) — expose this item's parent-frame height (px)
          so a text item's `kind:"ratio"` fontSize resolves against it (root =
          designHeight, which is what `parentHeightPx` carries at the top). */}
      <ParentFrameHeightContext.Provider value={parentHeightPx}>
        <FrameCulledContext.Provider value={culled}>
          <FrameContent
            item={item as unknown as AgoItem}
            {...(onUpdateItem
              ? {
                  onUpdate: (patch: Record<string, unknown>) =>
                    onUpdateItem(itemId, (prev) => ({ ...prev, ...(patch as object) })),
                }
              : {})}
            {...(onUpdateShape
              ? {
                  onUpdateShape: (shapeId: string, patch: object) =>
                    onUpdateShape(itemId, shapeId, patch),
                }
              : {})}
            {...(onRemoveShape
              ? { onRemoveShape: (shapeId: string) => onRemoveShape(itemId, shapeId) }
              : {})}
          />
        </FrameCulledContext.Provider>
      </ParentFrameHeightContext.Provider>
      {(() => {
        return childFrames.map((c) => (
          <NestedFrame
            key={String(c.id)}
            item={c}
            parentWidthPx={widthPx}
            parentHeightPx={heightPx}
            editing={editing}
            selectedId={selectedId}
            {...(selectedIds !== undefined ? { selectedIds } : {})}
            {...(dimmedFrameIds !== undefined ? { dimmedFrameIds } : {})}
            {...(isolatedFrameIds !== undefined ? { isolatedFrameIds } : {})}
            {...(onToggleSelect !== undefined ? { onToggleSelect } : {})}
            onSelect={onSelect}
            doc={doc}
            onContextMenuRequest={onContextMenuRequest}
            onUpdateItem={onUpdateItem}
            onUpdateShape={onUpdateShape}
            onRemoveShape={onRemoveShape}
            onDropAdd={onDropAdd}
            onDragOver={onDragOver}
            renderFrameMenu={renderFrameMenu}
            onCommitFrame={onCommitFrame}
            selectedHotspotId={selectedHotspotId}
            onSelectHotspot={onSelectHotspot}
            onCommitHotspotRegion={onCommitHotspotRegion}
          />
        ));
      })()}
      {isPrimarySelection && onCommitFrame !== undefined && chromeVisible ? (
        <SelectionLayer
          targetRef={selfRef}
          // DR-018 — handle list comes from the item kind's
          // SelectionViewModel (the `createFrameDefaultViewModel` built
          // here) plus any cross-cutting providers registered with the
          // editor's SelectionChromeRegistry. The resolver runs each
          // rAF tick against the live bounds so handles stay glued.
          resolveHandles={(bounds) => {
            const info = {
              selectionKind: "frame" as const,
              itemId,
              itemKind: kind,
              unitKinds: item.units.map((u) => u.kind),
            };
            // WI-029 / DR-016 — text item resize handles are mode-gated.
            // WI-019 B4 / T3 Modify — derives from `attrs.layoutChild`
            // (agocraft v10) via `deriveTextAutoResize`; the legacy
            // `textAutoResize` field is removed.
            //   WIDTH_AND_HEIGHT (Auto-W) → no handles (auto-shrinks to content)
            //   HEIGHT (Auto-H)           → e/w only (width manual, height auto)
            //   NONE (Fixed)              → all 8 (width+height locked, no auto-fit)
            // The corner-fontSize-scale behaviour (Phase 18) is gone — corners
            // change only the box dimensions, never fontSize. DR-016 박제.
            const textHandleDirs = (() => {
              if (kind !== "text") return undefined;
              const attrs = item.attrs as unknown as {
                layoutChild?: import("@agocraft/core").LayoutChildPolicy;
              };
              const mode = deriveTextAutoResizeForFrameStage(attrs.layoutChild);
              switch (mode) {
                case "WIDTH_AND_HEIGHT":
                  return [] as const;
                case "NONE":
                  return ["e", "w", "n", "s", "ne", "nw", "se", "sw"] as const;
                default: // "HEIGHT" or unset (legacy)
                  return ["e", "w"] as const;
              }
            })();
            // WI-019/WI-021 — the parent frame's layout OWNS this child's
            // position (delegation model), so it also dictates which
            // resize handles + the rotate affordance are valid. The
            // agocraft LayoutEngine.getChildConstraints is the single
            // source — weave only reads it and removes the disallowed
            // handle dirs (grid → none; flex → cross-axis removed). No
            // layout math happens here.
            //   • canResizeWidth=false  → drop e/w + all 4 corners
            //   • canResizeHeight=false → drop n/s + all 4 corners
            // (a corner touches both axes, so it survives only when BOTH
            //  axes are resizable.) canRotate=false drops the rotate handle
            //  (Figma auto-layout parity).
            const layoutConstraints =
              LAYOUT_FEATURE_ENABLED && doc !== undefined
                ? getLayoutEngine().getChildConstraints({ root: doc.root, itemId: item.id })
                : undefined;
            const layoutHandleDirs =
              layoutConstraints === undefined ||
              (layoutConstraints.canResizeWidth && layoutConstraints.canResizeHeight)
                ? undefined
                : (["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const).filter((d) => {
                    const touchesW = d === "e" || d === "w" || d.length === 2;
                    const touchesH = d === "n" || d === "s" || d.length === 2;
                    return (
                      (!touchesW || layoutConstraints.canResizeWidth) &&
                      (!touchesH || layoutConstraints.canResizeHeight)
                    );
                  });
            // Compose the text auto-resize restriction with the layout
            // restriction — a dir survives only if BOTH allow it.
            const resizeDirs = (() => {
              if (textHandleDirs === undefined) return layoutHandleDirs;
              if (layoutHandleDirs === undefined) return textHandleDirs;
              const allowed = new Set<string>(layoutHandleDirs);
              return textHandleDirs.filter((d) => allowed.has(d));
            })();
            const disableRotate = layoutConstraints !== undefined && !layoutConstraints.canRotate;
            const defaultVm = createFrameDefaultViewModel({
              itemKind: kind,
              ...(resizeDirs !== undefined ? { resizeDirs } : {}),
              ...(disableRotate ? { disableRotate: true } : {}),
            });
            // Default specs + extension specs (registry) — extension
            // wins on id collision (later writes override).
            const defaultSpecs = defaultVm.handles(info);
            const extSpecs = selectionChromeRef.current?.resolve(info) ?? [];
            const byId = new Map<string, (typeof defaultSpecs)[number]>();
            for (const s of defaultSpecs) byId.set(s.id, s);
            for (const s of extSpecs) byId.set(s.id, s);
            return Array.from(byId.values())
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((spec) => {
                const pos = resolveAnchor(spec.anchor, bounds);
                return {
                  id: spec.id,
                  itemId,
                  x: pos.x,
                  y: pos.y,
                  node: spec.render({ bounds, selection: info }),
                };
              });
          }}
        />
      ) : null}
      {/* Phase 13c-2 — hotspot region overlays for the *selected* frame.
          Dashed border by default; the selected hotspot gets a body-drag
          handler so it can be moved with the pointer. Resize is still the
          PropertiesPanel's number inputs (Phase 13c-1). */}
      {isPrimarySelection
        ? item.units
            .filter((u) => u.kind === "hotspot")
            .map((u) => {
              const b = u.attrs.behavior as
                | {
                    kind: "hotspot";
                    region: { x: number; y: number; width: number; height: number };
                    label?: string;
                  }
                | undefined;
              if (b === undefined || b.kind !== "hotspot") return null;
              const hotspotId = String(u.id);
              const isHotSelected = selectedHotspotId === hotspotId;
              return (
                <div
                  key={hotspotId}
                  data-testid="hotspot-region-overlay"
                  data-hotspot-id={hotspotId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectHotspot?.(hotspotId);
                  }}
                  onPointerDown={(e) => {
                    if (!isHotSelected || onCommitHotspotRegion === undefined) return;
                    const target = e.currentTarget as HTMLElement;
                    const parent = target.parentElement;
                    if (parent === null) return;
                    const rect = parent.getBoundingClientRect();
                    e.stopPropagation();
                    e.preventDefault();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const orig = { ...b.region };
                    target.setPointerCapture(e.pointerId);
                    const move = (ev: PointerEvent) => {
                      const dx = (ev.clientX - startX) / rect.width;
                      const dy = (ev.clientY - startY) / rect.height;
                      onCommitHotspotRegion(itemId, hotspotId, {
                        x: Math.max(0, Math.min(1 - orig.width, orig.x + dx)),
                        y: Math.max(0, Math.min(1 - orig.height, orig.y + dy)),
                        width: orig.width,
                        height: orig.height,
                      });
                    };
                    const up = () => {
                      target.removeEventListener("pointermove", move);
                      target.removeEventListener("pointerup", up);
                      target.removeEventListener("pointercancel", up);
                    };
                    target.addEventListener("pointermove", move);
                    target.addEventListener("pointerup", up);
                    target.addEventListener("pointercancel", up);
                  }}
                  style={{
                    position: "absolute",
                    left: `${b.region.x * 100}%`,
                    top: `${b.region.y * 100}%`,
                    width: `${b.region.width * 100}%`,
                    height: `${b.region.height * 100}%`,
                    border: isHotSelected ? "2px solid var(--accent)" : "2px dashed var(--accent)",
                    background: isHotSelected
                      ? "color-mix(in oklab, var(--accent) 18%, transparent)"
                      : "color-mix(in oklab, var(--accent) 8%, transparent)",
                    borderRadius: "var(--radius-sm)",
                    cursor: isHotSelected ? "move" : "pointer",
                    pointerEvents: "auto",
                  }}
                >
                  <span
                    className="absolute top-1 left-1 text-[10px] font-mono uppercase tracking-[0.08em] px-1 rounded bg-[color:var(--accent)] text-white"
                    aria-hidden
                  >
                    {b.label ?? "Hotspot"}
                  </span>
                </div>
              );
            })
        : null}
    </motion.div>
  );

  // Per the unified cursor-tooltip model, the frame itself no longer carries
  // any hover popup — the document-context tooltip was replaced by item-
  // level cursor tooltips on shapes, paragraphs, slide titles, etc. The
  // frame only renders ContextMenu chrome (when provided) around its body.
  return renderFrameMenu ? renderFrameMenu(itemId, inner) : inner;
}

// WI-033 P2 — `AbsoluteFrame` / `ROOT_ABS_FRAME` / `absoluteFrameFor`
// (Phase 12c entered-frame-to-design-plane camera math) removed
// alongside the drill-in mode.

/** Perceived luminance for a CSS color. Returns 0..1 where ≥ 0.5 reads as
 *  "light" (dark ink on top is the right choice). Falls back to "light"
 *  for inputs the canvas can't parse — that's the conservative bet when
 *  most designs will use white anyway. */
function perceivedLuminance(color: string): number {
  if (typeof document === "undefined") return 1;
  const probe = document.createElement("canvas").getContext("2d");
  if (probe === null) return 1;
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  // Browser normalizes the parsed color back to rgb(...) / rgba(...).
  const m = probe.fillStyle.match(/rgba?\(([^)]+)\)/);
  if (m === null) {
    // Hex / named — read pixel via a 1×1 paint to get rgba.
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (ctx === null) return 1;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = (data[0] ?? 0) / 255;
    const g = (data[1] ?? 0) / 255;
    const b = (data[2] ?? 0) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const parts = m[1]!.split(",").map((s) => parseFloat(s.trim()));
  const r = (parts[0] ?? 0) / 255;
  const g = (parts[1] ?? 0) / 255;
  const b = (parts[2] ?? 0) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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
        // reads this to compute the proportional scale on corner drags.
        // The agocraft binding treats FrameGeom as opaque, so the helper
        // field rides through untouched.
        if (item?.kind === "text") {
          const fs = (item.attrs as { fontSize?: number }).fontSize ?? 24;
          // __designWidth is the design's full design-pixel width — used
          // by computeResize below to clamp the minimum frame.width to
          // roughly one character (≈ fontSize × 0.6) for text items.
          return {
            ...frame,
            __origFontSize: fs,
            __designWidth: designWidth,
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
        // Phase 15 — for text proportional resize we MUST dispatch frame
        // + fontSize in a single `weave.item.update` patch. Splitting them
        // into two consecutive execs loses the first one: each patch
        // emits a FULL `attrs.after` snapshot, and the second exec's
        // patcher reads `prev.attrs` from the doc-before-applied state in
        // some commit orderings, so the second `after` clobbers the
        // first's frame change. Combining into one patch keeps both.
        if (nextFontSize !== undefined) {
          const upd = onUpdateItemRef.current;
          if (upd !== undefined) {
            upd(String(itemId), (prev) => ({
              ...prev,
              frame: cleanFrame,
              fontSize: nextFontSize,
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
        // DR-016 (2026-05-25): text item resize follows Figma paradigm —
        // every direction adjusts only box dimensions, NEVER fontSize. The
        // pre-DR-016 corner-fontSize-scale behaviour (Phase 18) is gone.
        // Edge drag clamps to one-character min-width using the existing
        // fontSize meta. Mode-specific handle exposure is gated upstream
        // (createFrameDefaultViewModel call site) so this function trusts
        // the dirs it receives.
        const o = orig as unknown as ItemFrame & {
          __origFontSize?: number;
          __designWidth?: number;
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
        return {
          ...o,
          x: nx,
          y: ny,
          width: Math.max(0.01, nw),
          height: Math.max(0.01, nh),
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
  useEffect(() => {
    if (router === null) return undefined;
    if (vm === null) return undefined;
    if (typeof document === "undefined") return undefined;
    if (!frameDragAllowed) return undefined;
    return router.register({
      host: document.body,
      bindings: [
        createFrameResizeBinding({
          access: frameAccess,
          resolveResizeDir(target) {
            if (!(target instanceof HTMLElement)) return null;
            const handle = target.closest("[data-handle-kind][data-handle-dir]");
            if (handle === null) return null;
            const kind = handle.getAttribute("data-handle-kind");
            if (kind !== "edge" && kind !== "corner") return null;
            const dir = handle.getAttribute("data-handle-dir");
            if (
              dir !== "n" &&
              dir !== "ne" &&
              dir !== "e" &&
              dir !== "se" &&
              dir !== "s" &&
              dir !== "sw" &&
              dir !== "w" &&
              dir !== "nw"
            )
              return null;
            return dir;
          },
          resolveFrameOfHandle(target) {
            if (!(target instanceof HTMLElement)) return null;
            const wrap = target.closest("[data-selection-handle-item-id]");
            const id = wrap?.getAttribute("data-selection-handle-item-id") ?? null;
            return id as ItemId | null;
          },
          // Body host sees everything — keep this binding inert unless
          // the press lands inside a portal'd selection handle.
          acceptTarget: (target) =>
            target instanceof HTMLElement &&
            target.closest("[data-handle-kind][data-handle-dir]") !== null,
          priority: GESTURE_PRIORITY_ELEMENT_HANDLE,
        }),
        createFrameRotateBinding({
          access: frameAccess,
          resolveRotateHandle(target) {
            if (!(target instanceof HTMLElement)) return null;
            const handle = target.closest("[data-handle-kind='rotation']");
            if (handle === null) return null;
            const wrap = handle.closest("[data-selection-handle-item-id]");
            const id = wrap?.getAttribute("data-selection-handle-item-id") ?? null;
            return id as ItemId | null;
          },
          centerViewportOf(itemId) {
            // The rotation pivot MUST be in the same coordinate space as the
            // pointer events the gesture router feeds in — clientX/clientY
            // (window-relative). `selectedFrameBoundsViewport` is stage-local
            // (camera space, relative to the FrameStage outer element via
            // `canonicalToViewport`), so using it directly put the pivot off
            // by the stage's on-screen offset (left panel / top bar). With the
            // pivot shifted away from the true center, dragging the handle
            // tracked vertical motion instead of the mouse's angle around the
            // item. Read the rendered element's client-rect center instead: it
            // is the real on-screen center (= the CSS `rotate()` transform-
            // origin, invariant under the current rotation) in client coords,
            // matching `e.position`.
            const el =
              typeof document === "undefined"
                ? null
                : document.querySelector(`[data-frame-id="${CSS.escape(String(itemId))}"]`);
            if (el !== null) {
              const r = el.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            const b = vm.selectedFrameBoundsViewport.get();
            if (b === null) return { x: 0, y: 0 };
            return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
          },
          acceptTarget: (target) =>
            target instanceof HTMLElement &&
            target.closest("[data-handle-kind='rotation']") !== null,
          priority: GESTURE_PRIORITY_ELEMENT_HANDLE,
        }),
      ],
    });
  }, [router, vm, frameAccess, frameDragAllowed]);

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

  // WI-058 / DR-021 — viewport culling registry. One IntersectionObserver,
  // root = the viewport-clipping `outerRef`, with a one-viewport `rootMargin`
  // buffer so frames are pre-rendered just before they pan into view (no
  // pop-in). Frames register their wrapper via the context; the observer
  // callback flips `visibility` directly (ref-mutation, no re-render). Only
  // armed for the infinite canvas — stacked/fit flavors fit the viewport so
  // nothing is ever off-screen to cull.
  const cullCallbacks = useRef(new Map<Element, (visible: boolean) => void>());
  const cullObserver = useRef<IntersectionObserver | null>(null);
  // DEV-only A/B escape hatch (WI-058 perf measurement). Setting
  // `window.__weaveDisableCull = true` before mount turns culling off so a
  // baseline can be captured at identical geometry. Gated behind DEV per the
  // `window.__weave*` dev-globals rule (apps/web/CLAUDE.md); production never
  // reads it.
  const cullEnabled =
    infiniteCanvas &&
    !(
      import.meta.env.DEV &&
      (globalThis as { __weaveDisableCull?: boolean }).__weaveDisableCull === true
    );
  useEffect(() => {
    if (!cullEnabled) return;
    const root = outerRef.current;
    if (root === null) return;
    // Pre-render buffer (WI-058 2b). Half a viewport each side keeps the cull
    // working set tight while still pre-rendering + re-decoding a frame before
    // it reaches the edge on a normal pan; `__weaveCullMargin` overrides it in
    // DEV for the margin sweep (production never reads the global).
    const rootMargin =
      (import.meta.env.DEV && (globalThis as { __weaveCullMargin?: string }).__weaveCullMargin) ||
      CULL_ROOT_MARGIN;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          cullCallbacks.current.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { root, rootMargin, threshold: 0 },
    );
    cullObserver.current = io;
    // Pick up any frames that registered before this effect ran (child
    // effects fire before the parent's on the same commit).
    for (const el of cullCallbacks.current.keys()) io.observe(el);
    return () => {
      io.disconnect();
      cullObserver.current = null;
    };
  }, [cullEnabled]);
  const cullRegistry = useMemo<ViewportCullRegistry | null>(() => {
    if (!cullEnabled) return null;
    return {
      observe(el, onChange) {
        cullCallbacks.current.set(el, onChange);
        cullObserver.current?.observe(el);
        return () => {
          cullCallbacks.current.delete(el);
          cullObserver.current?.unobserve(el);
        };
      },
    };
  }, [cullEnabled]);

  return (
    <TotalScaleContext.Provider value={totalScaleMV}>
      <ViewportCullContext.Provider value={cullRegistry}>
        <div
          ref={outerRef}
          className="absolute inset-0 overflow-hidden"
          // Design canvas background comes from `design.background` (model-
          // driven). Defaults to white. Documents float on this plane and
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
