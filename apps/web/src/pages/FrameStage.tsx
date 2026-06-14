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
  type FrameMoveSnap,
  GESTURE_PRIORITY_ELEMENT_BODY,
  GESTURE_PRIORITY_FALLBACK,
  type ResizeDir,
} from "@agocraft/editor";
import { computeScene } from "@agocraft/layout";
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
import {
  type ItemFrame,
  isItemLocked,
  useFrameDragBindingsAllowed,
  useFrameSelectionAllowed,
  useInteractionMode,
} from "../document";
import { findItemDeep, findParentAndIndex, isDomainItem } from "../document/agocraft-mirror.js";
import { resizeCropWindow, setStraighten } from "../document/crop-geometry.js";
import {
  type CameraPolicy,
  capabilityOf,
  type HitPolicy,
  type ItemCapabilities,
  type RolePolicy,
  type ViewPolicy,
} from "../document/editor-mode/types.js";
import { defaultInsertableRegistry } from "../document/insertable/default-registry.js";
import { croppingState } from "../document/interactions/cropping-state.js";
import { DocRefContext } from "../document/interactions/doc-ref-context.js";
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
import {
  clampFrameToPage,
  clampSharedDelta,
  type PageClampSpec,
  type RatioBox,
  rotatedAabb,
} from "../document/page-clamp.js";
import { scopeDocumentToPages } from "../document/page-scope.js";
import { computeResizeFrame, type ResizeSourceFrame } from "../document/resize-geometry.js";
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
import {
  ensureModifierTracker,
  liveModifiers,
} from "../document/selection-chrome/modifier-tracker.js";
import { withMoveModifiers } from "../document/selection-chrome/move-modifiers.js";
import { rotationSnapFeedback } from "../document/selection-chrome/rotation-snap-feedback.js";
import { nn } from "../lib/nn.js";
import { type DesignBox, setCameraFitBox } from "./frame-camera-bridge.js";
/** WI-033 A4 — context passed to `renderFrameMenu` so the callback
 *  (typically a per-frame ContextMenu) can render a Layer Picker
 *  section listing every frame overlapping the right-clicked point.
 *  Empty `layers` → the section is elided. */
import { nextPanForZoom } from "./frame-stage/camera-math.js";
import { FrameScene } from "./frame-stage/FrameScene.js";
import { perceivedLuminance } from "./frame-stage/luminance.js";
import { useStableHandler } from "./frame-stage/use-stable-handler.js";
import { useViewportCulling } from "./frame-stage/use-viewport-culling.js";

export interface FrameMenuContext {
  readonly layers: ReadonlyArray<LayerHit>;
  readonly onPickLayer: (id: string) => void;
}

/** WI-153 P3 (DR-111 D6) — minimum on-page overlap for the soft clamp, in
 *  DESIGN px (≈ a grabbable handle's worth). Converted to a parent ratio at
 *  drag time via the live plane scale so the felt size is zoom-independent. */
const PAGE_MIN_OVERLAP_DESIGN_PX = 48;

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
  /** WI-166 / DR-114 — injected ViewPolicy (interface only; composed at the
   *  composition root). Owns the page-chrome keying (matte / clip) and the
   *  viewport-culling arm. Replaces the `infiniteCanvas` placement flag. */
  readonly view: ViewPolicy;
  /** WI-166 / DR-114 — injected CameraPolicy. Owns the user zoom channel
   *  (wheel / ⌘± / pan transform — replaces `cameraEnabled`), the drag-pan
   *  gesture gate (Space / hand — replaces `infiniteCanvas` camera keying),
   *  the base-fit padding and the WI-157 fit-to-active-page box. */
  readonly camera: CameraPolicy;
  /** WI-153 P2.5 — shrink + offset the base fit so the design fits INSIDE the chrome
   *  (header on top, thumbnail rail on the bottom) instead of under it. Pixels. */
  readonly fitInset?:
    | {
        readonly top?: number;
        readonly bottom?: number;
        readonly left?: number;
        readonly right?: number;
      }
    | undefined;
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
  /** WI-153 P2 — when set, only these top-level frames render on the canvas (the
   *  rest are omitted, not just dimmed). The host populates it with `{ activePageId }`
   *  for page-bounded formats (one page at a time); undefined = render all frames
   *  (infinite canvas, unchanged). Thumbnails render each page independently, so a
   *  hidden page is still visible + selectable in the rail. */
  readonly visibleFrameIds?: ReadonlySet<string> | undefined;
  /** WI-166 / DR-114 — injected RolePolicy (interface only; composed at the
   *  composition root). The single truth source for "may this item move /
   *  resize / rotate via canvas gestures": stage items (pages on
   *  page-bounded formats — WI-163) decline all three. Replaces the local
   *  `isArtboardId` predicate. Lock (DR-061) stays orthogonal. */
  readonly roles: RolePolicy;
  /** WI-166 P3 / DR-114 — injected HitPolicy. `frameAccess.resolveTarget`
   *  resolves a drag-start on an UNSELECTED item through `hit.moveTarget`:
   *  deepest-movable on free placement (unchanged), parent-first from the
   *  active page on page-bounded flavors — which, combined with
   *  commitFrame's once-per-gesture selection, yields the one-gesture
   *  select+move. Drags starting inside the current selection keep the
   *  stage-owned redirect (move the selection itself). */
  readonly hit: HitPolicy;
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
  readonly onCommitFrame?:
    | ((itemId: string, next: ItemFrame, sessionId?: string) => void)
    | undefined;
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
    view,
    camera,
    handMode = false,
    background = "#ffffff",
    renderHoverOverlay,
  } = props;

  const bgTone: "light" | "dark" = useMemo(
    () => (perceivedLuminance(background) >= 0.5 ? "light" : "dark"),
    [background],
  );
  const rootId = String(root.id);
  // WI-153 P2 — page-bounded formats render ONE page at a time: the host passes
  // `visibleFrameIds = { activePageId }` and the rest are omitted. Undefined → all
  // top-level frames render (infinite canvas, unchanged).
  const visibleFrameIds = props.visibleFrameIds;
  const allTopFrames = root.children.filter(isDomainItem);
  const frames =
    visibleFrameIds !== undefined
      ? allTopFrames.filter((f) => visibleFrameIds.has(String(f.id)))
      : allTopFrames;
  // WI-153 P3 — latest-value mirror for the frame-access closure (useMemo([])):
  // the soft page clamp (`parentRectOf` → `computeMove`) needs to know whether
  // we are page-scoped and which page is active without rebuilding the access.
  const visibleFrameIdsRef = useRef(visibleFrameIds);
  visibleFrameIdsRef.current = visibleFrameIds;
  // WI-153 P4 — page-bounded: a rubber-band / marquee may not START on the
  // MATTE (outside the design plane = outside the page; the matte is not an
  // editing surface — a matte rubber band would fall back to a stray ROOT
  // frame, i.e. an accidental new page). Infinite canvas → always true
  // (drag-to-add anywhere, unchanged). Ref-based so the stable gesture
  // bindings observe the live policy without re-registering.
  const acceptWithinPage = useCallback((target: Element): boolean => {
    if (visibleFrameIdsRef.current === undefined) return true;
    const plane = designPlaneRef.current;
    return plane === null || plane.contains(target);
  }, []);
  // WI-183 — Alt+drag starting ON an item body is the DUPLICATE-drag gesture
  // (5-tool consensus), so the draw-a-frame modifier override narrows to
  // empty space + the page background (the page is a frame, but it IS the
  // editing surface). Supersedes the WI-034 frame-interior alt-draw arm —
  // the affordance survives because the rubber-band commit adapter resolves
  // the container from the final rect's CENTER, so a draw started on empty /
  // page space and swept over a frame still adds INTO that frame.
  const acceptAltDrawTarget = useCallback(
    (target: Element): boolean => {
      if (!acceptWithinPage(target)) return false;
      const frameEl = target.closest("[data-frame-id]");
      if (frameEl === null) return true;
      const id = frameEl.getAttribute("data-frame-id");
      const pages = visibleFrameIdsRef.current;
      return id !== null && (pages?.has(id) ?? false);
    },
    [acceptWithinPage],
  );
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
  // WI-198 — latest-document ref. Published through DocRefContext (provider
  // below) so NestedFrame's event/rAF-time handlers read the live document
  // without taking it as a prop — the document is the one value that changes
  // identity on every tick, and a `doc` prop would defeat
  // `React.memo(NestedFrame)` for the entire tree on every drag commit.
  const docRef = useRef(doc);
  docRef.current = doc;
  const handleFrameContextMenu = useCallback(
    (itemId: string, clientX: number, clientY: number) => {
      // Read through the ref (not props.document) so this callback keeps a
      // stable identity across document ticks — it is forwarded to every
      // memoized NestedFrame (WI-198).
      const d = docRef.current;
      if (d === undefined) return;
      const local = clientToDesignLocal(clientX, clientY);
      const layers = findFramesAtPoint(d, local.x, local.y, designWidth, designHeight);
      setPickerCtx({ targetId: itemId, layers });
    },
    [clientToDesignLocal, designWidth, designHeight],
  );
  const handlePickLayer = useCallback(
    (id: string) => {
      onSelect?.(id);
      setPickerCtx(null);
    },
    [onSelect],
  );
  // WI-198 — `renderFrameMenu` reaches every memoized NestedFrame, so its
  // identity must move ONLY with `pickerCtx` (the one render-affecting
  // input — a right-click re-rendering the tree once is intended) and the
  // underlying prop's defined-ness; the latest caller-provided rfm is read
  // through a ref, caller hygiene notwithstanding.
  const renderFrameMenuRef = useRef(props.renderFrameMenu);
  renderFrameMenuRef.current = props.renderFrameMenu;
  const renderFrameMenuDefined = props.renderFrameMenu !== undefined;
  const wrappedRenderFrameMenu = useMemo<FrameStageProps["renderFrameMenu"]>(() => {
    if (!renderFrameMenuDefined) return undefined;
    return (itemId, children) => {
      const rfm = renderFrameMenuRef.current;
      if (rfm === undefined) return children;
      const layers = pickerCtx !== null && pickerCtx.targetId === itemId ? pickerCtx.layers : [];
      return rfm(itemId, children, { layers, onPickLayer: handlePickLayer });
    };
  }, [renderFrameMenuDefined, pickerCtx, handlePickLayer]);
  // WI-198 — hot-path contract: every function prop forwarded into the
  // memoized NestedFrame tree is identity-stabilized here (latest-ref
  // wrappers — see use-stable-handler.ts), so caller-side inline lambdas
  // (DesignPage passes several) cannot defeat the memo. Identity moves only
  // with defined-ness; calls always reach the latest underlying callback.
  const onSelectStable = useStableHandler(onSelect);
  const onToggleSelectStable = useStableHandler(onToggleSelect);
  const onUpdateItemStable = useStableHandler(props.onUpdateItem);
  const onUpdateShapeStable = useStableHandler(props.onUpdateShape);
  const onRemoveShapeStable = useStableHandler(props.onRemoveShape);
  const onDropAddStable = useStableHandler(onDropAdd);
  const onDragOverStable = useStableHandler(onDragOver);
  const onCommitFrameStable = useStableHandler(props.onCommitFrame);
  const onSelectHotspotStable = useStableHandler(props.onSelectHotspot);
  const onCommitHotspotRegionStable = useStableHandler(props.onCommitHotspotRegion);
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
  // WI-153 P2.5 — fit INSIDE the chrome: shrink the available box by the header /
  // rail insets and center the design within that region (not the full viewport),
  // so a page-bounded page isn't hidden under the top bar + thumbnail rail.
  const insetT = props.fitInset?.top ?? 0;
  const insetB = props.fitInset?.bottom ?? 0;
  const insetL = props.fitInset?.left ?? 0;
  const insetR = props.fitInset?.right ?? 0;
  const availW = Math.max(1, outerSize.width - insetL - insetR);
  const availH = Math.max(1, outerSize.height - insetT - insetB);
  const paddingFactor = camera.paddingFactor;
  const baseScale = Math.min(availW / designWidth, availH / designHeight) * paddingFactor;
  const baseTx = insetL + (availW - designWidth * baseScale) / 2;
  const baseTy = insetT + (availH - designHeight * baseScale) / 2;

  // DR-017 Phase 2 — pan state lives on vm.camera (MotionValue slots).
  // WI-197 — the local React-state mirror of vm.camera is GONE: it
  // re-rendered the entire (item-count-sized) NestedFrame tree on every
  // wheel tick / pan pointermove (measured at 168 items / CPU 4×: ~273ms
  // mean frame, 67% dropped — canvas-zoom-fps-perf.spec.ts). The outer
  // pan layer's transform is now applied via direct ref-mutation from
  // vm.camera subscriptions (the `applyHitGate` / cull-registry hot-path
  // pattern), so a camera change re-renders nothing. Writers (wheel
  // handler, hotkeys, PanBinding, zoomToBox) target vm.camera directly,
  // unchanged.
  const vm = useContext(EditorVMContext);
  // Stable ref so closures (frameAccess.resolveTarget, etc.) can read
  // the current vm without rebuilding when vm becomes non-null.
  const vmRef = useRef(vm);
  useEffect(() => {
    vmRef.current = vm;
  }, [vm]);
  const panLayerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (vm === null || !camera.userZoom) return undefined;
    const apply = () => {
      const el = panLayerRef.current;
      if (el === null) return;
      el.style.transform = `translate(${vm.camera.tx.get()}px, ${vm.camera.ty.get()}px) scale(${vm.camera.scale.get()})`;
    };
    apply();
    const offs = [
      vm.camera.tx.on("change", apply),
      vm.camera.ty.on("change", apply),
      vm.camera.scale.on("change", apply),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [vm, camera.userZoom]);
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
      // WI-157 — fit + centre within the CHROME-INSET region (header / rail),
      // matching the base fit's avail box. Insets are 0 on infinite canvas, so
      // the math reduces to the previous full-viewport form there.
      const rawScale = Math.min(
        (availW * MARGIN) / (box.w * baseScale),
        (availH * MARGIN) / (box.h * baseScale),
      );
      const scale = Math.max(0.1, Math.min(8, rawScale));
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const olx = baseTx + cx * baseScale;
      const oly = baseTy + cy * baseScale;
      // Solve `screen = (ol - W/2)*scale + W/2 + t` for the box centre landing
      // at the avail-region centre (insetL + availW/2). With scale 1 and a
      // plane-centre box this yields t = 0 — the base fit, exactly.
      const targetX = insetL + availW / 2;
      const targetY = insetT + availH / 2;
      setPan({
        tx: targetX - W / 2 - (olx - W / 2) * scale,
        ty: targetY - H / 2 - (oly - H / 2) * scale,
        scale,
      });
    },
    [outerSize, availW, availH, insetL, insetT, baseScale, baseTx, baseTy, setPan],
  );
  useEffect(() => {
    if (!camera.userZoom) return undefined;
    return setCameraFitBox(zoomToBox);
  }, [camera.userZoom, zoomToBox]);

  // WI-157 (WI-153 P2.4) — fit-to-active-page, via the injected
  // CameraPolicy. The base fit frames the whole design plane; that equals
  // the page only for FULL_FRAME pages. When `camera.fitBox` returns a box
  // (non-FULL_FRAME active page), fit the user camera to it; when switching
  // back to a no-box page FROM a page-fit camera, restore the base fit.
  // FULL→FULL switches never touch the camera (user zoom survives slide
  // flipping — pre-existing behavior). The page BOX is read at fire time
  // through the doc ref and is NOT a dependency, so resizing the page
  // itself doesn't re-fire a fit mid-gesture; deps are the page id + the
  // first real stage measure (mount race: outerSize starts 0×0 and
  // zoomToBox no-ops on it).
  const activePage = visibleFrameIds !== undefined && frames.length === 1 ? frames[0] : undefined;
  const activePageId = activePage === undefined ? undefined : String(activePage.id);
  // WI-166 P3 — ref-mirrored for the stable (deps-`[]`) frameAccess
  // closure: `resolveTarget` feeds the live active page into
  // `hit.moveTarget` (parent-first root on page-bounded flavors).
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;
  const zoomToBoxRef = useRef(zoomToBox);
  zoomToBoxRef.current = zoomToBox;
  // (`docRef` is declared once above, next to the DocRefContext publish —
  // WI-198; this effect and the frameAccess closures read the same ref.)
  const lastPageFitRef = useRef<string | undefined>(undefined);
  const stageReady = outerSize.width > 0 && outerSize.height > 0;
  useEffect(() => {
    if (!camera.userZoom || !stageReady || activePageId === undefined) return;
    const liveDoc = docRef.current;
    if (liveDoc === undefined) return;
    const box = camera.fitBox(liveDoc, activePageId, designWidth, designHeight);
    if (box !== undefined) {
      zoomToBoxRef.current(box, 1);
      lastPageFitRef.current = activePageId;
    } else if (lastPageFitRef.current !== undefined) {
      setPan({ tx: 0, ty: 0, scale: 1 });
      lastPageFitRef.current = undefined;
    }
  }, [camera, stageReady, activePageId, designWidth, designHeight, setPan]);

  // WI-033 P2 — pan-reset-on-entered-frame-change effect removed
  // alongside drill-in mode (DR-017). The user's pan/zoom now persists
  // across all selection changes; explicit Zoom controls (Ctrl+Wheel /
  // ZoomBar) are the only ways to reset it.
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  // Track Space-held for hold-to-pan. Only bound when the CameraPolicy
  // grants the drag-pan gesture — page-bounded flavors have nothing to pan to.
  useEffect(() => {
    if (!camera.dragPan) return undefined;
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
  }, [camera.dragPan]);

  const panActive = camera.dragPan && (isSpaceDown || handMode);

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
    if (!camera.dragPan) return;
    if (panActive) {
      transitionFrom("idle", "hand");
    } else {
      restoreIdleFrom("hand");
    }
  }, [camera.dragPan, panActive, transitionFrom, restoreIdleFrom]);

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    if (!camera.userZoom) return undefined;
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
        setPan((p) => camera.clampPan(p, nextPanForZoom(p, factor, anchor)));
      } else {
        // plain wheel → canvas pan (also non-passive so the page itself
        // doesn't scroll behind our pan offset)
        e.preventDefault();
        setPan((p) => camera.clampPan(p, { ...p, tx: p.tx - e.deltaX, ty: p.ty - e.deltaY }));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
    };
  }, [camera, bumpWheel]);

  // Zoom hotkeys (Figma parity): Cmd/Ctrl + "=" zoom in, "-" zoom out
  // (anchored at the viewport centre via `nextPanForZoom`), "0" resets to
  // the base fit (scale 1, no pan). preventDefault stops the browser's
  // own page-zoom. Lives here — not the agocraft hotkey registry — so it
  // shares the camera channel + outer rect the wheel zoom already uses.
  useEffect(() => {
    if (!camera.userZoom) return undefined;
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
        setPan((p) => camera.clampPan(p, nextPanForZoom(p, 1.2, center)));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setPan((p) => camera.clampPan(p, nextPanForZoom(p, 1 / 1.2, center)));
      } else if (e.key === "0") {
        // Reset to the base fit — the canonical policy-safe camera, so it
        // is not routed through clampPan.
        e.preventDefault();
        setPan({ tx: 0, ty: 0, scale: 1 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, setPan]);

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
  // DR-061 — is the item with `id` locked (protected from resize / rotate)?
  const isLockedItemId = (id: string): boolean => {
    const d = docRef.current;
    if (d === undefined) return false;
    const it = findItemDeep(d, id);
    return it !== undefined && isItemLocked(it);
  };
  // WI-163 / WI-166 — role capability of item `id`, from the injected
  // RolePolicy (stage items — pages on page-bounded formats — decline
  // move / resize / rotate: fixed editing contexts, not objects, Canva
  // model). Ref-mirrored so the stable (deps-`[]`) gesture closures read
  // the live policy + doc. No doc → element (everything allowed), same as
  // the absorbed `isArtboardId` returning false.
  const rolesRef = useRef(props.roles);
  rolesRef.current = props.roles;
  // WI-166 P3 — injected HitPolicy, ref-mirrored for the same stable-closure
  // reason as `rolesRef` above.
  const hitRef = useRef(props.hit);
  hitRef.current = props.hit;
  const itemCapability = (id: string): ItemCapabilities => {
    const d = docRef.current;
    if (d === undefined) return rolesRef.current.capabilities.element;
    return capabilityOf(rolesRef.current, d, id);
  };
  // Selection-follows-move: the FrameMoveBinding runs with
  // `disableSelectionSet: true` so plain clicks keep the HitPolicy's
  // parent-first model, and after a drag its onPointerUp swallows the
  // click — so neither path switches selection when a drag starts on an
  // UNSELECTED frame. commitFrame reconciles it once per gesture. These
  // refs let the stable (deps-`[]`) frameAccess closure reach the live
  // onSelect and remember which session it already reconciled.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const moveSelectionSessionRef = useRef<string | null>(null);
  // WI-159 — multi-select GROUP min-overlap. Gesture-start boxes
  // (parent-ratio units) of the moving PAGE-DIRECT members (rotated members
  // as their visual AABB — WI-160),
  // captured by the frameMoveSnap wrapper below (snap.begin is the one host
  // seam that learns the gesture's TRUE target set before the first
  // computeMove; selection state alone would mis-fire on the modified
  // single-drag branch). When set, computeMove clamps the SHARED delta once
  // against every member's own min-overlap interval — rigid group translation
  // at page edges, no member ever fully off-page (DR-111 D5 per item).
  const pageMoveGroupRef = useRef<ReadonlyArray<RatioBox> | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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
        const node = nn(stack.pop());
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
    /** Capability (RolePolicy.movable — WI-163: a stage/page declines) ∩
     *  lock (DR-061) admission of a climbed move target. The HitPolicy's
     *  `admit` seam — the policy decides WHICH item to aim at, the stage
     *  keeps owning whether that item may move at all. */
    function admitMoveTarget(id: ItemId): boolean {
      if (!itemCapability(String(id)).movable) return false;
      const it = findItem(id);
      return !(it !== undefined && isItemLocked(it));
    }
    /** The movable target for `id`, or null when admission declines it (a
     *  declined drag falls through to the P4 rubber band — acceptWithinPage
     *  already admits in-page starts). Used by the selected-frame redirect
     *  below; the unselected-hit leg goes through `hit.moveTarget`. */
    function movableTargetOrNull(id: ItemId): ItemId | null {
      const moved = climbToMovable(id);
      return admitMoveTarget(moved) ? moved : null;
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
              return movableTargetOrNull(sid as ItemId);
            }
          }
        }
        // No selection redirect → the press must land on a frame body, not
        // a shape's geometry: pressing a shape with nothing selected keeps
        // the legacy "select, don't move" behavior. Resolve the deepest
        // frame, then hand the WHICH-item decision to the injected
        // HitPolicy (WI-166 P3): free placement climbs the deepest hit to
        // its nearest movable ancestor (a layout child moves its container
        // — Figma auto-layout parity, unchanged); page-bounded flavors
        // resolve parent-first from the active page, so a drag on an
        // unselected deep child aims at its page-direct ancestor —
        // commitFrame's once-per-gesture selection makes that a
        // one-gesture select+move.
        if (target.closest("[data-shape-id]") !== null) return null;
        const frameEl = target.closest("[data-frame-id]");
        if (frameEl === null) return null;
        const raw = frameEl.getAttribute("data-frame-id");
        if (raw === null) return null;
        const d = docRef.current;
        if (d === undefined) return movableTargetOrNull(raw as ItemId);
        // Representative current-selection id (multi → first id), mirroring
        // useSelection's single-select view — feeds the policy's in-context
        // drill heuristic.
        const selNow = vmNow === null ? undefined : vmNow.itemSelection.state.get();
        const firstMulti =
          selNow !== undefined && selNow.kind === "multi"
            ? Array.from(selNow.items as Iterable<unknown>)[0]
            : undefined;
        const currentId =
          selNow !== undefined && selNow.kind === "single"
            ? String(selNow.itemId)
            : firstMulti !== undefined
              ? String(firstMulti)
              : undefined;
        return hitRef.current.moveTarget(raw, d, {
          currentId,
          activePageId: activePageIdRef.current,
          climbToMovable: (id) => String(climbToMovable(id as ItemId)),
          admit: (id) => admitMoveTarget(id as ItemId),
        }) as ItemId | null;
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
          // DR-053 (d) — pass the per-gesture sessionId so the engine restores
          // descendants to their mouse-down size on a shrink→grow.
          commit(String(itemId), cleanFrame, sessionId);
        }
      },
      computeMove(orig, dx, dy, parent) {
        const o = orig as unknown as ItemFrame;
        const w = parent.width > 0 ? parent.width : 1;
        const h = parent.height > 0 ? parent.height : 1;
        // WI-218 follow-up — the frame is a ratio of the parent's LOCAL
        // (unrotated) box, but the drag delta is in screen axes. De-rotate it by
        // the parent's absolute rotation so a child of a rotated parent follows
        // the cursor instead of drifting along the parent's local axes. rotation
        // 0 ⇒ identity (the common case is unchanged).
        const pr = (parent as { __rotation?: number }).__rotation ?? 0;
        let ldx = dx;
        let ldy = dy;
        if (pr !== 0) {
          const c = Math.cos(-pr);
          const s = Math.sin(-pr);
          ldx = dx * c - dy * s;
          ldy = dx * s + dy * c;
        }
        let nx = o.x + ldx / w;
        let ny = o.y + ldy / h;
        // WI-153 P3 (DR-111 D6) — soft min-overlap clamp. `parentRectOf` rides
        // a `__pageClamp` spec through the opaque parent rect when the moved
        // item is a direct child of the active page (page-bounded formats
        // only). Bleed stays allowed; at least the spec's min overlap must
        // remain on-page so an item can never be dragged fully off and lost.
        // Snap runs BEFORE computeMove in the move binding, so the clamp has
        // the last word.
        const clampSpec = (parent as { __pageClamp?: PageClampSpec }).__pageClamp;
        if (clampSpec !== undefined) {
          // WI-159 — multi-select drag: clamp the SHARED delta once against
          // every moving page-direct member's min-overlap interval, so the
          // group translates rigidly (per-member clamping deforms relative
          // layout at the edge: members stop one by one) and no member can
          // end fully off-page. Every member gets identical inputs — same
          // member set (captured at gesture start), same parent dims (same
          // page element), same viewport delta — so each independently
          // computes the identical clamped delta.
          const groupMembers = pageMoveGroupRef.current;
          if (groupMembers !== undefined) {
            const cd = clampSharedDelta(groupMembers, nx - o.x, ny - o.y, clampSpec);
            nx = o.x + cd.dx;
            ny = o.y + cd.dy;
          } else if ((o.rotation ?? 0) === 0) {
            const c = clampFrameToPage(
              { x: nx, y: ny, width: o.width, height: o.height },
              clampSpec,
            );
            nx = c.x;
            ny = c.y;
          } else {
            // WI-160 — rotated single drag: clamp the delta so the item's
            // rotated visual AABB keeps min overlap (rotation mixes the axes
            // in pixel space → the parent's px aspect converts back to ratio
            // units; w/h are the page element's dims captured by
            // parentRectOf). The rotation-skip stance is retired.
            const aabb = rotatedAabb(o, w / h);
            const cd = clampSharedDelta([aabb], nx - o.x, ny - o.y, clampSpec);
            nx = o.x + cd.dx;
            ny = o.y + cd.dy;
          }
        }
        return {
          ...o,
          x: nx,
          y: ny,
        } as unknown as FrameGeom;
      },
      computeResize(orig, dir: ResizeDir, dx, dy, parent) {
        // DR-022 (2026-05-31, supersedes DR-016 corner clause): text item
        // DIAGONAL (corner) resize scales the glyph proportionally to the
        // box HEIGHT ratio. WI-183 extracted the geometry into the pure
        // helper `computeResizeFrame` so the Shift/Alt resize modifiers
        // (applied by the resize handle sink, which calls the helper with
        // the modifier flags) share one implementation. This 5-arg
        // interface method stays modifier-free.
        return computeResizeFrame(
          orig as unknown as ResizeSourceFrame,
          dir,
          dx,
          dy,
          parent,
        ) as unknown as FrameGeom;
      },
      computeRotate(orig, center, startVec, cursor) {
        const o = orig as unknown as ItemFrame;
        const startAngle = Math.atan2(startVec.y, startVec.x);
        const curAngle = Math.atan2(cursor.y - center.y, cursor.x - center.x);
        const next = (o.rotation ?? 0) + (curAngle - startAngle);
        return { ...o, rotation: next } as unknown as FrameGeom;
      },
      parentRectOf(itemId) {
        // WI-217/DR-138 — the scene renderer is FLAT: every frame is a sibling
        // under the design plane, so `el.parentElement` is the PLANE for every
        // item, not its logical parent. Resolve the logical parent from the doc
        // and read its EXACT local box (computeScene design px × plane scale) —
        // a nested item's frame is a ratio of its parent frame, not of the whole
        // plane (using the plane made `dx/parentWidth` divide by a too-large
        // width). `getBoundingClientRect` would also give a rotated parent's
        // inflated AABB; the scene box is rotation-invariant. `__rotation` (the
        // parent's absolute rotation) rides through so computeMove can de-rotate
        // the drag delta into the parent's local axes. Called once per target at
        // gesture start (not per tick), so one computeScene is fine.
        const doc = docRef.current;
        const planeRect = designPlaneRef.current?.getBoundingClientRect();
        if (doc === undefined || planeRect === undefined || planeRect.width <= 0) {
          const r = findFrameElement(itemId)?.parentElement?.getBoundingClientRect();
          return r !== undefined ? { width: r.width, height: r.height } : { width: 1, height: 1 };
        }
        const scale = planeRect.width / designWidth;
        const parentId = findParentAndIndex(doc, String(itemId))?.parent.id;
        const parentIsRoot = parentId === undefined || String(parentId) === String(doc.root.id);
        let boxW = designWidth;
        let boxH = designHeight;
        let rotation = 0;
        if (!parentIsRoot && parentId !== undefined) {
          const e = computeScene(doc.root, designWidth, designHeight).byId.get(parentId);
          if (e !== undefined) {
            boxW = e.box.w;
            boxH = e.box.h;
            rotation = e.rotation;
          }
        }
        const width = boxW * scale;
        const height = boxH * scale;
        // WI-153 P3 (DR-111 D6) — page-bounded soft-clamp context. When the
        // item's logical parent IS an active page, smuggle the min-overlap spec
        // through the opaque parent rect (the same dunder idiom readFrame uses
        // for __origFontSize) so computeMove can clamp without new plumbing.
        const pages = visibleFrameIdsRef.current;
        if (
          pages !== undefined &&
          width > 0 &&
          height > 0 &&
          parentId !== undefined &&
          pages.has(String(parentId))
        ) {
          const minScreen = PAGE_MIN_OVERLAP_DESIGN_PX * scale;
          return {
            width,
            height,
            __rotation: rotation,
            __pageClamp: {
              minX: minScreen / width,
              minY: minScreen / height,
            } satisfies PageClampSpec,
          } as { width: number; height: number };
        }
        return { width, height, __rotation: rotation } as { width: number; height: number };
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
  const frameMoveSnapInner = useMemo(
    () => createFrameMoveSnap({ hostEl: () => outerRef.current }),
    [],
  );
  // WI-159 — wrap the snap so `begin` (fired by the move binding at the drag
  // threshold, BEFORE the first computeMove, with the gesture's true moving
  // set) captures the moving PAGE-DIRECT members' boxes into
  // `pageMoveGroupRef`; `end` (guaranteed on pointer-up and cancel) clears it.
  // Page-direct = the same DOM predicate `parentRectOf` uses for `__pageClamp`
  // (nearest frame ancestor is the active page), so exactly the members that
  // computeMove will clamp contribute constraints. Frames are read from the
  // live doc — still at their gesture-start values here (no commit has run).
  // WI-160: rotated members contribute their rotated visual AABB (aspect from
  // the page element's px rect — all members share the one active page).
  const frameMoveSnap = useMemo<FrameMoveSnap>(
    () => ({
      begin(primaryItemId, movingItemIds) {
        pageMoveGroupRef.current = undefined;
        const pages = visibleFrameIdsRef.current;
        const d = docRef.current;
        if (
          pages !== undefined &&
          d !== undefined &&
          movingItemIds.length > 1 &&
          typeof document !== "undefined"
        ) {
          const boxes: RatioBox[] = [];
          let pageAspect: number | undefined;
          for (const id of movingItemIds) {
            // WI-217/DR-138 — flat DOM: resolve the LOGICAL parent (page) from the
            // doc, not `el.parentElement.closest` (which is the plane for every
            // item). Page-direct = the item's logical parent IS an active page.
            const pageId = findParentAndIndex(d, String(id))?.parent.id;
            if (pageId === undefined || !pages.has(String(pageId))) continue;
            const frame = (findItemDeep(d, String(id))?.attrs as { frame?: ItemFrame } | undefined)
              ?.frame;
            if (frame === undefined) continue;
            if (pageAspect === undefined) {
              const pageEl = document.querySelector(
                `[data-frame-id="${CSS.escape(String(pageId))}"]`,
              );
              const r = pageEl?.getBoundingClientRect();
              if (r !== undefined && r.height > 0) pageAspect = r.width / r.height;
            }
            boxes.push(rotatedAabb(frame, pageAspect ?? 1));
          }
          if (boxes.length > 0) pageMoveGroupRef.current = boxes;
        }
        frameMoveSnapInner.begin(primaryItemId, movingItemIds);
      },
      snapDelta(dxViewport, dyViewport) {
        return frameMoveSnapInner.snapDelta(dxViewport, dyViewport);
      },
      end() {
        pageMoveGroupRef.current = undefined;
        frameMoveSnapInner.end();
      },
    }),
    [frameMoveSnapInner],
  );
  // WI-183 — outermost move-modifier decorator: Shift = axis lock (minor axis
  // zeroed before the snap engine), Alt at the drag threshold = duplicate the
  // moving set IN PLACE (offset 0) and keep moving the original. Composed
  // around the WI-159 page-group wrapper so the duplicate fires before any
  // delta is computed. Modifier state comes from the window-level tracker
  // (snapDelta carries no event).
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const frameMoveSnapWithModifiers = useMemo<FrameMoveSnap>(() => {
    ensureModifierTracker();
    return withMoveModifiers(frameMoveSnap, {
      modifiers: liveModifiers,
      duplicateInPlace: (itemIds) => {
        editorRef.current?.exec("weave.items.duplicateInPlace", { itemIds });
      },
    });
  }, [frameMoveSnap]);

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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
            // WI-153 P4 — page-bounded: no Alt-rubber-band start on the matte
            // (would create a stray root frame = accidental page).
            // WI-183 — further narrowed: item-body starts yield to FrameMove's
            // Alt-duplicate; only empty space / page background draws.
            acceptTarget: acceptAltDrawTarget,
          });
    // WI-040 — frame-move excluded outside idle / frame-manipulating so
    // hand/panning, context-menu (LayerPicker open), text-editing, and
    // rubber-band reviewing don't allow a competing item drag.
    const frameMove = frameDragAllowed
      ? createFrameMoveBinding({
          access: frameAccess,
          // WI-073 — alignment / bounds / equal-spacing snap guides during
          // move. WI-183 — wrapped with the move-modifier decorator (Shift
          // axis lock / Alt drag-duplicate).
          snap: frameMoveSnapWithModifiers,
          priority: GESTURE_PRIORITY_ELEMENT_BODY,
          moveThreshold: 3,
          // HANDOFF-011 / WI-033 — opt out of the binding's raw
          // `vm.itemSelection.set(itemId)` on plain pointerdown so
          // NestedFrame's onClick can apply Figma's parent-first /
          // Cmd-deep / Shift-toggle semantics via `hit.selectTarget`.
          disableSelectionSet: true,
          // WI-019/WI-021 — body-drag move is resolved through
          // `frameAccess.resolveTarget`, which climbs a layout-managed
          // child up to the nearest MOVABLE ancestor (the layout
          // container) so the frame itself stays draggable even when its
          // children fill it. No acceptTarget gate is needed: the climb
          // already guarantees the moved item is movable (the agocraft
          // LayoutEngine owns `canMove`; weave only reads it).
          // WI-183 — Alt+drag on an item body now means DUPLICATE-drag
          // (the decorator above duplicates in place at the threshold),
          // so frame-move must accept Alt. This supersedes WI-034's
          // `alt: "forbidden"` (which yielded the frame interior to the
          // alt-rubber-band "add child" gesture) — drawing INTO a frame
          // survives by starting on empty space / page background: the
          // commit adapter resolves the container from the final rect's
          // CENTER (rubber-band/agocraft-adapter.ts), not the start point.
          modifiers: { button: 0 },
        })
      : null;
    return router.register({
      host: outerRef,
      bindings: [
        // Priority order (high → low):
        //   • Alt rubber-band  (90, MODIFIER_OVERRIDE) — Alt+drag on
        //     empty space / page background draws a new frame. Item-body
        //     starts are rejected (WI-183 acceptAltDrawTarget) and fall
        //     through to frame-move's Alt-duplicate.
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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
        // DR-061 locked / WI-163 stage (page) role: no rotate
        if (isLockedItemId(String(itemId)) || !itemCapability(String(itemId)).rotatable) return;
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
              // WI-074/WI-183 — Shift = 15° steps; otherwise snap to 0/90/180/270 (guide).
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
            // WI-074/WI-183 — Shift = 15° steps; otherwise snap to 0/90/180/270 (guide).
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
      // DR-061 locked / WI-163 stage (page) role: no resize
      if (isLockedItemId(String(itemId)) || !itemCapability(String(itemId)).resizable) return;
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
      // WI-218 follow-up — rotation-aware parent box + delta. The resize math is
      // ratio-of-parent in the parent's LOCAL (axis-aligned) space, but the
      // pointer delta is in screen axes. Capture, at gesture start:
      //   • the parent's EXACT local box (computeScene design px × plane scale) —
      //     `getBoundingClientRect` would give a rotated parent's inflated AABB;
      //   • the item's ABSOLUTE rotation (own + ancestors) — to de-rotate the
      //     screen delta into the item's local frame axes before dividing.
      // Both default to the plain (unrotated) behavior at rotation 0, so the
      // common case is unchanged. Falls back to parentRectOf if the scene/plane
      // is unavailable.
      const resizeCtx = ((): {
        readonly parent: { width: number; height: number };
        readonly cos: number;
        readonly sin: number;
      } => {
        const doc = docRef.current;
        const planeRect = designPlaneRef.current?.getBoundingClientRect();
        if (doc === undefined || planeRect === undefined || planeRect.width <= 0) {
          return { parent: frameAccess.parentRectOf(itemId), cos: 1, sin: 0 };
        }
        const scene = computeScene(doc.root, designWidth, designHeight);
        const scale = planeRect.width / designWidth;
        const parentId = findParentAndIndex(doc, String(itemId))?.parent.id;
        const parentBox =
          parentId === undefined || String(parentId) === String(doc.root.id)
            ? { w: designWidth, h: designHeight }
            : (scene.byId.get(parentId)?.box ?? { w: designWidth, h: designHeight });
        const absRot = scene.byId.get(itemId)?.rotation ?? 0;
        return {
          parent: { width: parentBox.w * scale, height: parentBox.h * scale },
          cos: Math.cos(-absRot),
          sin: Math.sin(-absRot),
        };
      })();
      const sessionId = `${String(itemId)}/resize/${seq++}`;
      startHandleGesture({
        kind: "frame-resize",
        handleId: `resize.${dir}`,
        itemId: String(itemId),
        origin,
        sink: {
          // WI-183 — resize modifiers read live off the pointer: Shift =
          // corner aspect lock, Alt = resize from center. Calls the shared
          // pure helper directly (the FrameAccess interface is 5-arg).
          update: (p) => {
            // De-rotate the screen delta into the item's local frame axes.
            const sdx = p.clientX - origin.clientX;
            const sdy = p.clientY - origin.clientY;
            const ldx = sdx * resizeCtx.cos - sdy * resizeCtx.sin;
            const ldy = sdx * resizeCtx.sin + sdy * resizeCtx.cos;
            frameAccess.commitFrame(
              itemId,
              computeResizeFrame(
                orig as unknown as ResizeSourceFrame,
                dir,
                ldx,
                ldy,
                resizeCtx.parent,
                {
                  aspectLock: p.shiftKey,
                  fromCenter: p.altKey,
                },
              ) as unknown as FrameGeom,
              sessionId,
            );
          },
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
  // compute its display size and gate hit-testing once the visible area
  // drops below `HIT_THRESHOLD_AREA_PX2`.
  const totalScaleMV = useMotionValue(
    baseScale * (camera.userZoom && vm !== null ? vm.camera.scale.get() : 1),
  );
  useEffect(() => {
    // WI-197 — the user-zoom factor is read straight off vm.camera.scale
    // (MotionValue subscription) instead of the deleted `pan` React-state
    // mirror, keeping this sync on the no-re-render hot path.
    const camScale = camera.userZoom && vm !== null ? vm.camera.scale : null;
    const update = () => {
      const next = planeScaleMV.get() * (camScale !== null ? camScale.get() : 1);
      if (next !== totalScaleMV.get()) totalScaleMV.set(next);
    };
    update();
    const offs = [planeScaleMV.on("change", update)];
    if (camScale !== null) offs.push(camScale.on("change", update));
    return () => {
      for (const off of offs) off();
    };
  }, [planeScaleMV, vm, camera.userZoom, totalScaleMV]);

  const handleBackgroundClick = useCallback(() => {
    if (!selectionAllowedOuter) return;
    onSelect?.(undefined);
  }, [onSelect, selectionAllowedOuter]);

  // Double-click on truly empty design-plane space → fit the camera to all
  // items. Frames stop dblclick propagation (NestedFrame's defensive
  // interceptor — the fit-to-frame click counter was removed in WI-033 P2;
  // double-click on a frame now means "descend", via two plain-click
  // `hit.selectTarget` passes), so this fires only off-frame; the
  // closest() guard is a belt-and-suspenders check against any future
  // bubbling child.
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
  const cullRegistry = useViewportCulling(view.viewportCulling, outerRef);

  return (
    <DocRefContext.Provider value={docRef}>
      <TotalScaleContext.Provider value={totalScaleMV}>
        <ViewportCullContext.Provider value={cullRegistry}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus are handled by dedicated controls elsewhere */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer affordance; keyboard is handled centrally, not as a per-element tab stop */}
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
              // WI-198 — every function prop below is the identity-stable
              // wrapper; the document flows through DocRefContext (provider
              // at the return root), NOT a prop. Together with @agocraft/core's
              // structural sharing (mapItemDeep path-copy) this lets
              // React.memo(NestedFrame) bail every frame whose `item` ref is
              // unchanged — a drag commit re-renders only the dragged item's
              // ancestor path instead of the whole tree.
              const planeChildren = (
                <FrameScene
                  root={root}
                  frames={frames}
                  designWidth={designWidth}
                  designHeight={designHeight}
                  editing={editing}
                  selectedId={props.selectedId}
                  {...(props.selectedIds !== undefined ? { selectedIds: props.selectedIds } : {})}
                  {...(props.dimmedFrameIds !== undefined
                    ? { dimmedFrameIds: props.dimmedFrameIds }
                    : {})}
                  {...(props.isolatedFrameIds !== undefined
                    ? { isolatedFrameIds: props.isolatedFrameIds }
                    : {})}
                  {...(onToggleSelectStable !== undefined
                    ? { onToggleSelect: onToggleSelectStable }
                    : {})}
                  onSelect={onSelectStable}
                  artboardId={activePageId}
                  roles={props.roles}
                  hit={props.hit}
                  onContextMenuRequest={handleFrameContextMenu}
                  onUpdateItem={onUpdateItemStable}
                  onUpdateShape={onUpdateShapeStable}
                  onRemoveShape={onRemoveShapeStable}
                  onDropAdd={onDropAddStable}
                  onDragOver={onDragOverStable}
                  renderFrameMenu={wrappedRenderFrameMenu}
                  onCommitFrame={onCommitFrameStable}
                  selectedHotspotId={props.selectedHotspotId}
                  onSelectHotspot={onSelectHotspotStable}
                  onCommitHotspotRegion={onCommitHotspotRegionStable}
                />
              );
              // The design-plane subtree — pan layer (user offset/zoom) wrapping
              // the design plane motion.div (drill spring transform). Frames
              // live inside the design plane so their positions interpret as
              // design-pixel coords; everything outside is just transform chrome.
              const planeSubtree = (
                <div
                  ref={panLayerRef}
                  style={{
                    position: "absolute",
                    inset: 0,
                    ...(camera.userZoom
                      ? {
                          // WI-197 — initial paint only. Live camera updates land
                          // via the panLayerRef vm.camera subscription (direct
                          // style ref-mutation; no React re-render per camera
                          // change). Re-renders re-read the same source, so this
                          // never fights the subscription.
                          transform:
                            vm !== null
                              ? `translate(${vm.camera.tx.get()}px, ${vm.camera.ty.get()}px) scale(${vm.camera.scale.get()})`
                              : undefined,
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
                      // WI-153 P3 — page-chrome mode (ViewPolicy): matte EVERYTHING
                      // outside the page (this design-plane box) as a non-editable gray
                      // region. A single huge box-shadow halo tracks the plane's pan/zoom
                      // transform and is paint-only (does not capture pointer events).
                      // Free-placement flavors are unaffected (pageChrome false); the
                      // `visibleFrameIds !== undefined` leg keeps the empty-deck edge
                      // (page-bounded with no page yet → no matte, as before).
                      //
                      // `overflow: clip` is the page-edge CLIP (DR-111 D5): bleed is
                      // allowed in the doc (items may extend past the page box; the soft
                      // clamp keeps part of them on-page) but the off-page part is cut at
                      // the edge, WYSIWYG with present/export. The plane box == the page
                      // box for the FULL_FRAME pages page-bounded formats use (P2.4 note).
                      // The element's OWN box-shadow (the matte) is not affected by its
                      // own overflow, and selection chrome portals to document.body, so
                      // neither is clipped.
                      ...(view.pageChrome && visibleFrameIds !== undefined
                        ? {
                            boxShadow: "0 0 0 100000px var(--canvas-matte, #6f737b)",
                            overflow: "clip" as const,
                          }
                        : {}),
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
                // WI-153 P4 — page-bounded: no marquee/rubber-band start on the
                // matte (outside the page). Infinite canvas → always passes.
                if (!acceptWithinPage(target)) return false;
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
                  getFrames={() => {
                    // WI-153 P4 — `frames` (not raw root.children): page-bounded
                    // stacks hidden FULL_FRAME pages at the same coords; a marquee
                    // hit-testing the raw doc would scoop invisible pages into the
                    // selection. Infinite canvas → frames === all top frames.
                    // WI-163 — page-bounded: the page itself is an ARTBOARD and is
                    // never marquee-selectable. The marquee hit-tests the active
                    // page's DIRECT children instead, composed through the page
                    // box into design space (page rotation is always 0 — the
                    // artboard transform gates guarantee it).
                    const pageF =
                      activePage === undefined
                        ? undefined
                        : ((activePage.attrs as { frame?: ItemFrame }).frame ?? {
                            x: 0,
                            y: 0,
                            width: 1,
                            height: 1,
                            rotation: 0,
                          });
                    const candidates =
                      activePage !== undefined && pageF !== undefined
                        ? activePage.children.filter(isDomainItem).map((c) => {
                            const f = (c.attrs as { frame?: ItemFrame }).frame ?? {
                              x: 0,
                              y: 0,
                              width: 1,
                              height: 1,
                              rotation: 0,
                            };
                            return {
                              id: String(c.id),
                              frame: {
                                x: pageF.x + f.x * pageF.width,
                                y: pageF.y + f.y * pageF.height,
                                width: f.width * pageF.width,
                                height: f.height * pageF.height,
                                rotation: f.rotation ?? 0,
                              },
                            };
                          })
                        : frames.map((c) => ({
                            id: String(c.id),
                            frame: (c.attrs as { frame?: ItemFrame }).frame ?? {
                              x: 0,
                              y: 0,
                              width: 1,
                              height: 1,
                              rotation: 0,
                            },
                          }));
                    return (
                      candidates
                        // WI-039 — focus-gate parity with single-click. A dimmed
                        // (stage 1) or isolated (stage 2) frame carries
                        // pointer-events:none, so a click never lands on it; the
                        // marquee hit-tests document geometry directly and would
                        // otherwise still scoop it into a drag selection. Exclude
                        // the same id sets the per-frame hit gate consults so both
                        // selection paths agree on what is interactive.
                        .filter(
                          ({ id }) =>
                            !(props.dimmedFrameIds?.has(id) ?? false) &&
                            !(props.isolatedFrameIds?.has(id) ?? false),
                        )
                        .map(({ id, frame: f }) => {
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
                            id,
                            x: cx - bw / 2,
                            y: cy - bh / 2,
                            width: bw,
                            height: bh,
                          };
                        })
                    );
                  }}
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
                    // 의 매 render assignment. WI-153 P4 — page-bounded 에서는
                    // hidden 페이지(같은 좌표에 쌓인 FULL_FRAME)와 그 subtree 가
                    // hit-test 를 가로채지 않도록 보이는 페이지로 스코프.
                    getDocument={() =>
                      scopeDocumentToPages(docRef.current, visibleFrameIdsRef.current)
                    }
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
    </DocRefContext.Provider>
  );
}
