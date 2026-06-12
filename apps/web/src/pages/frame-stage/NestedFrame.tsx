// DR-027 / WI-071 Phase 3 — recursive frame renderer extracted from
// FrameStage. Renders one Item (frame/domain block) + its children, the
// per-frame SelectionLayer chrome, and routes selection/drag/menu intents
// up via props. Self-recursive; FrameStage mounts the root. The props type
// is sliced from FrameStageProps (type-only import — no runtime cycle).

import type { Item as AgocraftItem } from "@agocraft/core";
import { resolveAnchor } from "@agocraft/editor";
import { IconLock, SelectionLayer } from "@weave/design-system";
import { type MotionStyle, motion, useMotionValue, useMotionValueEvent } from "motion/react";
import type React from "react";
import {
  type CSSProperties,
  memo,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AgoItem, DomainKind, ItemFrame } from "../../document";
import {
  isItemLocked,
  useFrameSelectionAllowed,
  useInteractionMode,
  useSelectionChromeVisible,
} from "../../document";
import { isDomainItem } from "../../document/agocraft-mirror.js";
import { deriveTextAutoResize as deriveTextAutoResizeForFrameStage } from "../../document/domains/derive-text-auto-resize.js";
import { ParentFrameHeightContext } from "../../document/domains/parent-frame-context.js";
import {
  type ClickIntent,
  capabilityOf,
  type HitPolicy,
  type RolePolicy,
} from "../../document/editor-mode/types.js";
import { useCroppingItemId, useIsCropping } from "../../document/interactions/cropping-state.js";
import { DocRefContext } from "../../document/interactions/doc-ref-context.js";
import { useIsFrameHovered } from "../../document/interactions/frame-hover-store.js";
import { useSelectionChromeOrNull } from "../../document/interactions/selection-chrome-context.js";
import { SelectionVmContext } from "../../document/interactions/selection-context.js";
import {
  HIT_THRESHOLD_AREA_PX2,
  TotalScaleContext,
} from "../../document/interactions/total-scale-context.js";
import {
  FrameCulledContext,
  ViewportCullContext,
} from "../../document/interactions/viewport-cull-context.js";
import { getLayoutEngine, LAYOUT_FEATURE_ENABLED } from "../../document/layout/registry.js";
import { FrameContent } from "../../document/render/FrameContent.js";
import { applyLayoutConstraintFilter } from "../../document/selection-chrome/layout-constraint-filter.js";
import { FLIP_ALLOWED_KINDS, flipTransform, readFlip } from "../../document/transform-flip.js";
import type { FrameStageProps } from "../FrameStage.js";

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
  // WI-033 A1+A2 `doc` prop REMOVED (WI-198): the document changes identity
  // on every tick, so as a prop it would defeat `React.memo(NestedFrame)`.
  // All document consumption here is event/rAF-time (onClick hit resolution,
  // RolePolicy capability checks, resolveHandles) — it now reads
  // `DocRefContext` (latest committed doc, published by FrameStage). When no
  // provider/doc exists, handlers fall back to the legacy "select the
  // clicked frame" behaviour, same as the old `doc === undefined` branch.
  /** WI-033 A4 — fired on right-click. Caller (FrameStage) converts the
   *  viewport coords to design-plane local, runs `findFramesAtPoint`,
   *  and stashes the overlapping-layers list so the FrameContextMenu
   *  can render a "Select layer" section. NestedFrame's responsibility
   *  stops at capturing the event coords. */
  readonly onContextMenuRequest?:
    | ((itemId: string, clientX: number, clientY: number) => void)
    | undefined;
  /** WI-163 — the active page's id on page-bounded formats: fed to the
   *  HitPolicy as `activePageId` (parent-first walks one level INSIDE it),
   *  and used to disambiguate a null select result — a null on an artboard
   *  hit is a background click that clears the selection. Undefined on
   *  infinite canvas. */
  readonly artboardId?: string | undefined;
  /** WI-166 / DR-114 — injected RolePolicy (interface only — the policy is
   *  composed at the composition root). Decides per-item capabilities:
   *  Shift-toggle skips items that are not "normal"-selectable, and
   *  selection chrome drops ALL canvas handles for `canvasHandles: false`
   *  items (a stage/page is editing chrome, not an object — WI-163). */
  readonly roles: RolePolicy;
  /** WI-166 P3 / DR-114 — injected HitPolicy. onClick resolves the next
   *  selection through `hit.selectTarget` (parent-first from the document
   *  root on free placement, from the active page on page-bounded — the
   *  former `selectFromHit` + contextRootId pair). */
  readonly hit: HitPolicy;
}

function NestedFrameImpl({
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
  onContextMenuRequest,
  artboardId,
  roles,
  hit,
}: NestedFrameProps) {
  const itemId = String(item.id);
  // WI-033 — vm reference for synchronous selection read inside onClick.
  // React state (`selectedId` prop) can be stale within the same event
  // batch when FrameMoveBinding's capture-phase `vm.itemSelection.set(...)`
  // already mutated the selection before our onClick fires; the vm
  // signal's `state.get()` always returns the latest.
  const _selectionVm = useContext(SelectionVmContext);
  // WI-198 — latest committed document, read ONLY at event/rAF time (onClick
  // hit resolution, capability checks, resolveHandles). Never read during
  // render for render output: a memo-bailed frame would keep stale output.
  const docRef = useContext(DocRefContext);
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
  // WI-074 — suppress selection chrome (resize/rotate handle buttons) while an
  // image crop is open, so its body-portal handles don't cover the inline crop
  // handles / intercept their pointer events.
  const cropping = useIsCropping();
  // WI-074 D8 P2 — during a crop, keep the chrome (resize + rotate handles) for the
  // item being cropped — the FrameStage dispatcher routes those handle drags to the
  // crop draft instead of the frame. Other items' chrome stays hidden mid-crop.
  const croppingItemId = useCroppingItemId();
  const isCroppingThis = croppingItemId === itemId;
  const chromeVisible = useSelectionChromeVisible() && (!cropping || isCroppingThis);
  // Multi-selection chrome reveals per item on hover (mirrors the chart's
  // per-bar width handles). Subscribed so only the frame whose hover boolean
  // flips re-renders on a pointer transition. Used by the chrome gate below.
  const isFrameHovered = useIsFrameHovered(itemId);
  // DR-018 — selection chrome registry. Cross-cutting providers (plugins,
  // AI selection-actions, future domain extensions) register here; the
  // NestedFrame's `<SelectionLayer>` resolver merges their specs with
  // the kind's default view-model below.
  const selectionChrome = useSelectionChromeOrNull();
  const selectionChromeRef = useRef(selectionChrome);
  selectionChromeRef.current = selectionChrome;

  // WI-033 P2 — manual 2-click fit-to-frame counter removed. It used to
  // dispatch `onEnter?.(itemId)` (drill-in) on the second qualifying
  // click and `return` early, which prevented the hit resolution from
  // running. With drill-in retired (DR-017) and the counter's reason
  // for existing gone, the frame's onClick path now runs
  // `hit.selectTarget` on every press — A1's parent-first heuristic does
  // its own "current selection in trail → drill to leaf" derivation.
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
  // screen AREA (width × height) clears `HIT_THRESHOLD_AREA_PX2`.
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
      // Gate on displayed AREA (width × height), not the shorter side, so a
      // thin-but-long frame keeps a usable click target.
      el.style.pointerEvents = dw * dh >= HIT_THRESHOLD_AREA_PX2 ? "auto" : "none";
    },
    [widthPx, heightPx],
  );
  useLayoutEffect(() => {
    applyHitGate(totalScaleMV.get());
  }, [applyHitGate, totalScaleMV]);
  // Re-poke the gate whenever either focus set flips so the latest set
  // takes effect immediately instead of waiting for the next scale change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
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
  // WI-074 / DR-029 D7 — generic content flip (transform.flip unit), applied as a
  // frame-centre mirror of this item's content. Allow-listed kinds only
  // (qr/text/frame excluded). Same region, mirrored — preserves cropped visible area.
  const flip = FLIP_ALLOWED_KINDS.has(kind)
    ? readFlip(item as unknown as Parameters<typeof readFlip>[0])
    : { flipH: false, flipV: false };
  const flipped = flip.flipH || flip.flipV;

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
  // Multi-selection chrome reveal. When two or more frames are selected, the
  // host-level dashed marquee owns the group "selected" indicator and each
  // item's own outline + handles surface ONLY while that item is hovered —
  // the chart-bar interaction the user asked for. Single-select keeps its
  // always-on chrome.
  const isMultiSelection = selectedIds !== undefined && selectedIds.size > 1;
  const chromeForThisItem = !isMultiSelection || isFrameHovered;
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
    // The two sets are mutually exclusive (host enforces).
    opacity: isolatedFrameIds?.has(itemId)
      ? "var(--focus-isolate-opacity, 0)"
      : dimmedFrameIds?.has(itemId)
        ? "var(--focus-dim-opacity, 0.28)"
        : 1,
    transition: "opacity 180ms ease",
    // WI-102 — FOCUS pointer-events block declared HERE (in the React/motion
    // style), not only imperatively in `applyHitGate`. A `motion.div` re-applies
    // its style object on its own animation tick, which could land AFTER the
    // useLayoutEffect gate and leave a gated frame's imperative `none` stale →
    // the focused-out frame stayed editable (the reported regression). Declaring
    // it on the style makes React the source of truth for the DETERMINISTIC focus
    // case (gated → none), so nothing can overwrite it. The SIZE gate (auto/none
    // by footprint) stays imperative-only in `applyHitGate`: this key is OMITTED
    // for un-gated frames, so the two never fight over the same frame.
    ...(isolatedFrameIds?.has(itemId) || dimmedFrameIds?.has(itemId)
      ? { pointerEvents: "none" as const }
      : {}),
    ...(frame.rotation ? { transform: `rotate(${frame.rotation}rad)` } : {}),
    // WI-074 D8c — lift the cropping frame above sibling items so its spotlight
    // dim (box-shadow hole in ImageBlock) covers them.
    ...(isCroppingThis ? { zIndex: 51 } : {}),
  };

  // Auto-width/height text: the selection chrome must hug the LIVE text while
  // typing, but the box is model-sized and lags a debounce behind. Compose the
  // tracked bounds from the live content element (`data-text-content`, which
  // grows every layout pass) on the AUTO axis and the box on the MANUAL axis,
  // so the rubber band + handles track typing live without a model round-trip.
  const textAutoMode =
    kind === "text"
      ? deriveTextAutoResizeForFrameStage(
          (attrs as { layoutChild?: import("@agocraft/core").LayoutChildPolicy }).layoutChild,
        )
      : undefined;
  const composeTextBounds =
    textAutoMode === "WIDTH_AND_HEIGHT" || textAutoMode === "HEIGHT"
      ? (boxEl: HTMLElement) => {
          const b = boxEl.getBoundingClientRect();
          const content = boxEl.querySelector("[data-text-content]");
          if (content === null) {
            return { left: b.left, top: b.top, width: b.width, height: b.height };
          }
          const c = content.getBoundingClientRect();
          // Auto axis from the live content; manual axis from the (user-set) box.
          return textAutoMode === "WIDTH_AND_HEIGHT"
            ? { left: c.left, top: b.top, width: c.width, height: b.height }
            : { left: b.left, top: c.top, width: b.width, height: c.height };
        }
      : undefined;

  // WI-074 D7 — content + (for frames) children are mirrored together under a
  // flip, so extract both so the flip wrapper can enclose them.
  const frameContentNode = (
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
  );
  const childNodes = childFrames.map((c) => (
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
      artboardId={artboardId}
      roles={roles}
      hit={hit}
    />
  ));

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
        // A1's parent-first heuristic in `hit.selectTarget`. The Figma-
        // aligned override happens in `onClick` below. Removing the
        // raw set at its source requires an agocraft option (see
        // HANDOFF-011 — `CreateFrameMoveBindingDeps.disableSelectionSet`);
        // until that lands, A1/A2/A4 e2e specs report 7 fails.
        e.stopPropagation();
        onSelect?.(itemId);
      }}
      // Native dblclick is purely a defensive bubble interceptor here
      // (the fit-to-frame click counter is gone — WI-033 P2). Without this
      // stopPropagation, dblclick on a frame would bubble to FrameStage's
      // outer `onFitAll` and zoom the camera out mid-edit. Outer's
      // onDoubleClick should fire ONLY on truly empty canvas presses.
      // Double-click "descend into group" needs no handler of its own:
      // it is two plain clicks, and A1's parent-first heuristic in
      // `hit.selectTarget` drills to the leaf on the second (WI-183/D-2).
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
        // second click and `return` early, which suppressed the hit
        // resolution and prevented A1's drill heuristic from
        // running. Text-edit double-click is still handled by the
        // EditableText component on `[data-double-click-edit="true"]`
        // (native dblclick → enter edit mode); the frame's onClick
        // path now just runs `hit.selectTarget` on every press.
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
        // WI-198 — event-time doc read (always the latest committed doc,
        // fresher than any render-snapshot prop would be mid-gesture).
        const doc = docRef?.current;
        if (intent === "toggle" && onToggleSelect !== undefined) {
          // WI-163 — a stage (page/artboard) never joins a multi-selection:
          // only "normal"-selectable items toggle in (RolePolicy).
          if (doc === undefined || capabilityOf(roles, doc, itemId).selectable === "normal")
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
          const next = hit.selectTarget(targetFrameId, doc, {
            intent,
            currentId: selectedId,
            activePageId: artboardId,
          });
          // WI-163 — null on an artboard hit = background click → clear the
          // selection (Canva: clicking the page deselects). The legacy null
          // fallback (hit not in doc) keeps selecting the raw target.
          if (next === null && targetFrameId === artboardId) {
            onSelect?.(undefined);
            return;
          }
          onSelect?.(next ?? targetFrameId);
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
      {/* WI-074 D7 — a flipped item mirrors its content around the frame centre.
          Frames mirror their children too; that flip is DISPLAY-ONLY — the mirrored
          content is pointer-events:none so children aren't mis-edited under the
          mirror (drag directions would invert), while the frame box itself stays
          selectable / movable via its own chrome. Leaves keep their content
          interactive (no children, so the trailing childNodes is empty). */}
      {flipped ? (
        <div
          className="absolute inset-0"
          style={{
            ...flipTransform(flip),
            ...(kind === "frame" ? { pointerEvents: "none" } : {}),
          }}
        >
          {frameContentNode}
          {kind === "frame" ? childNodes : null}
        </div>
      ) : (
        frameContentNode
      )}
      {flipped && kind === "frame" ? null : childNodes}
      {isPrimarySelection && onCommitFrame !== undefined && chromeVisible && chromeForThisItem ? (
        <SelectionLayer
          targetRef={selfRef}
          // Auto-width/height text: track the live content on the auto axis so
          // the chrome hugs typing without the model-frame debounce lag.
          {...(composeTextBounds !== undefined ? { boundsOf: composeTextBounds } : {})}
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
            // DR-023 — handles come from each kind's registered
            // SelectionViewModel (`resolve` merges the kind VM + cross-cutting
            // providers like the poly vertex handles, already sorted by
            // priority/order). FrameStage no longer knows text auto-resize
            // modes or shape sub-kinds — that policy lives in the per-kind VMs
            // (text-/shape-/frame-default-selection-view-model). The ONLY
            // removal here is the parent-layout constraint (grid / flex), which
            // is cross-cutting (any kind), so it is a single post-resolve filter
            // rather than a per-kind branch.
            // WI-198 — rAF-time doc read via the ref context (resolveHandles
            // runs per tick against live bounds; the latest doc is correct).
            const doc = docRef?.current;
            const constraints =
              LAYOUT_FEATURE_ENABLED && doc !== undefined
                ? getLayoutEngine().getChildConstraints({ root: doc.root, itemId: item.id })
                : undefined;
            const locked = isItemLocked(item);
            // WI-163 — a stage (page/artboard, deep-click escape hatch
            // selection) exposes NO canvas handles at all — transform AND
            // kind handles (corner radius etc.): the page is editing chrome,
            // not an object. Fill editing rides the contextual toolbar, which
            // is not a handle spec. Unlike locked, no badge below — a stage
            // is not a locked item. Capability from the injected RolePolicy.
            const noCanvasHandles =
              doc !== undefined && !capabilityOf(roles, doc, itemId).canvasHandles;
            const handles = (
              noCanvasHandles
                ? []
                : applyLayoutConstraintFilter(
                    selectionChromeRef.current?.resolve(info) ?? [],
                    constraints,
                    locked, // DR-061 — locked → no transform handles
                  )
            ).map((spec) => {
              const pos = resolveAnchor(spec.anchor, bounds);
              return {
                id: spec.id,
                itemId,
                x: pos.x,
                y: pos.y,
                // DR-043 (agocraft) — `render` returns an opaque ChromeNode;
                // the host knows its renderer is React, so it casts at the
                // consumption boundary. weave's registered providers all
                // return JSX.
                node: spec.render({ bounds, selection: info }) as React.ReactNode,
              };
            });
            // DR-061 — locked: a small lock badge at the top-left corner marks
            // the protected state (handles are already hidden above).
            if (locked) {
              const lp = resolveAnchor({ type: "corner", corner: "nw" }, bounds);
              handles.push({
                id: "lock-badge",
                itemId,
                x: lp.x,
                y: lp.y,
                node: (
                  <span
                    aria-hidden
                    data-lock-badge
                    className="flex items-center justify-center rounded-full bg-[color:var(--surface-overlay)] text-[color:var(--text-overlay)] shadow-[var(--shadow-overlay)]"
                    style={{ width: 18, height: 18 }}
                  >
                    <IconLock size={11} />
                  </span>
                ),
              });
            }
            return handles;
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
                // biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus handled by dedicated controls elsewhere
                // biome-ignore lint/a11y/useKeyWithClickEvents: pointer affordance; keyboard handled centrally, not a per-element tab stop
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

// WI-198 — memoized export. With every prop identity-stable across document
// ticks (FrameStage's `useStableHandler` contract + structurally-shared
// `item` from @agocraft/core's path-copy `applyPatch`), a drag tick only
// reconciles the dragged item's root→leaf ancestor path instead of the whole
// frame tree. The recursive `<NestedFrame>` in `childNodes` above resolves to
// THIS memoized const (module binding, evaluated at render time) — naming the
// impl differently is deliberate: `memo(function NestedFrame() {…})` would
// make the inner name shadow the const and recurse unmemoized.
export const NestedFrame = memo(NestedFrameImpl);

// WI-033 P2 — `AbsoluteFrame` / `ROOT_ABS_FRAME` / `absoluteFrameFor`
// (Phase 12c entered-frame-to-design-plane camera math) removed
// alongside the drill-in mode.
