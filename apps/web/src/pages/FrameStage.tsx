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

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { SelectionLayer } from "@weave/design-system";
import type { SelectionHandleDir as HandleDir } from "@weave/design-system";
import {
  animate,
  motion,
  type MotionStyle,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type React from "react";
import { findTrailDeep, isDomainItem } from "../document/agocraft-mirror.js";
import type {
  AgoItem,
  DomainKind,
  ItemFrame,
} from "../document";
import { useInteractionMode } from "../document";
import {
  HIT_THRESHOLD_PX,
  TotalScaleContext,
} from "../document/interactions/total-scale-context.js";
import { FrameContent } from "../document/render/FrameContent.js";
import { MarqueeSelectionLayer } from "../document/marquee/MarqueeSelectionLayer.js";
import { RubberBandLayer } from "../document/rubber-band/RubberBandLayer.js";
import { EditorVMContext } from "../document/interactions/editor-vm-context.js";
import { useRouterOrNull } from "../document/interactions/router-context.js";
import {
  createFrameMoveBinding,
  createFrameResizeBinding,
  createFrameRotateBinding,
  createModifierOverride,
  createPanBinding,
  createRubberBandBinding,
  GESTURE_PRIORITY,
  type FrameAccess,
  type FrameGeom,
  resolveAnchor,
  type ResizeDir,
} from "@agocraft/editor";
import { defaultInsertableRegistry } from "../document/insertable/default-registry.js";
import { adaptWeaveCapabilityToAgocraft } from "../document/rubber-band/agocraft-adapter.js";
import type { ItemId } from "@agocraft/core";
import { createFrameDefaultViewModel } from "../document/selection-chrome/frame-default-view-model.js";
import { useSelectionChromeOrNull } from "../document/interactions/selection-chrome-context.js";

const ALL_HANDLES: ReadonlyArray<HandleDir> = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const MIN_FRAME = 0.02;

function resizeFrame(orig: ItemFrame, dx: number, dy: number, dir: HandleDir): ItemFrame {
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
    | ((
        intent: "replace" | "add" | "toggle",
        ids: ReadonlyArray<string>,
      ) => void)
    | undefined;
  readonly onUpdateItem?:
    | ((
        itemId: string,
        patch: (attrs: Record<string, unknown>) => Record<string, unknown>,
      ) => void)
    | undefined;
  readonly onUpdateShape?:
    | ((itemId: string, shapeId: string, patch: object) => void)
    | undefined;
  readonly onRemoveShape?: ((itemId: string, shapeId: string) => void) | undefined;
  readonly onDropAdd?:
    | ((e: React.DragEvent<HTMLDivElement>, containerId: string) => void)
    | undefined;
  readonly onDragOver?:
    | ((e: React.DragEvent<HTMLDivElement>) => void)
    | undefined;
  readonly renderFrameMenu?:
    | ((itemId: string, children: React.ReactNode) => React.ReactNode)
    | undefined;
  /** Phase 12b — commit a frame's full ItemFrame after a manipulation drag. */
  readonly onCommitFrame?: ((itemId: string, next: ItemFrame) => void) | undefined;
  /** id of the frame currently *fitted* to the viewport. When set, the
   *  design plane zooms in so that frame fills the viewport (matches the
   *  Present-mode camera). Double-clicking another frame fits to it; the
   *  outer-area double-click clears this id (see `onFitAll`). Esc /
   *  breadcrumb also clears it. */
  readonly enteredId?: string | undefined;
  readonly onEnter?: ((itemId: string) => void) | undefined;
  /** Called when the user double-clicks the canvas background (not a frame
   *  or inner item). The host should clear `enteredId` so the overview
   *  view becomes the target; FrameStage simultaneously resets its own
   *  user pan/zoom so every frame fits inside the viewport. */
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
}

/** Phase 13e — staggered opacity interpolation. Mirrors Stage's
 *  `computeStaggered`: leaving alpha (fade-OUT) reaches its target by
 *  p≈0.65; arriving alpha (fade-IN) starts moving only at p≈0.35. The two
 *  windows overlap mid-spring so a drill-in (siblings fading out + entered
 *  frame zooming in) reads as one continuous motion. */
function computeDrillStaggered(from: number, to: number, p: number): number {
  if (to === from) return from;
  if (to > from) {
    const start = 0.35;
    const adjusted = Math.max(0, (p - start) / (1 - start));
    return from + (to - from) * adjusted;
  }
  const end = 0.65;
  const adjusted = Math.min(1, p / end);
  return from + (to - from) * adjusted;
}

/** Phase 13e — per-level z-order dim. Returns one boolean per child:
 *  true if this child paints above the entered branch's level node and
 *  must fade. When no descendant of this level lies on the trail, no one
 *  fades. */
function computeDrillDimFlags(
  children: ReadonlyArray<AgocraftItem>,
  trailIds: ReadonlySet<string>,
): ReadonlyArray<boolean> {
  let trailIdx = -1;
  for (let i = 0; i < children.length; i += 1) {
    if (trailIds.has(String(children[i]!.id))) {
      trailIdx = i;
      break;
    }
  }
  if (trailIdx === -1) return children.map(() => false);
  return children.map((_, i) => i > trailIdx);
}

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
  /** Toggle this frame in/out of the multi-selection. Fired on
   *  Shift / Cmd / Ctrl + click. Absent → modifier clicks fall back to
   *  the single-replace behaviour. */
  readonly onToggleSelect?: (itemId: string) => void;
  /** Phase D — currently entered (drill-in) frame id, threaded down so each
   *  NestedFrame's KindTooltip can compare against its own item id. */
  readonly enteredId: string | undefined;
  /** Phase 13e — full ancestor-and-target id set for the entered frame.
   *  Empty when nothing is entered. Each NestedFrame consults this when
   *  rendering its own children to decide which siblings paint above the
   *  trail branch at *this* level. */
  readonly enteredTrailIds: ReadonlySet<string>;
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
  /** Phase 12c — double-click enters the frame (drill-in). */
  readonly onEnter: ((itemId: string) => void) | undefined;
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
  /** Phase 13e — z-order drill-in dim. Set to true when this frame paints
   *  above the entered branch at its current tree level (= later in the
   *  parent's children array). Renders with opacity 0 so it doesn't obscure
   *  the entered frame after the drill-in zoom. */
  readonly drillDimmed?: boolean;
  /** Phase 13e — the FrameStage-level spring progress motion value (0..1)
   *  shared with the design-plane transform. Used to derive this frame's
   *  opacity so transform and alpha settle on the same frame. */
  readonly drillProgressMV?: MotionValue<number> | undefined;
}

function NestedFrame({
  item,
  parentWidthPx,
  parentHeightPx,
  editing,
  selectedId,
  selectedIds,
  onToggleSelect,
  enteredId,
  onSelect,
  onUpdateItem,
  onUpdateShape,
  onRemoveShape,
  onDropAdd,
  onDragOver,
  renderFrameMenu,
  onCommitFrame,
  onEnter,
  selectedHotspotId,
  onSelectHotspot,
  onCommitHotspotRegion,
  drillDimmed = false,
  drillProgressMV,
  enteredTrailIds,
}: NestedFrameProps) {
  const itemId = String(item.id);
  // Manipulation handle drags publish "frame-manipulating" so tooltips don't
  // race with the gesture. The transition is guarded — if a context menu or
  // pan happens to win the press, we don't stomp their mode.
  const im = useInteractionMode();
  // DR-018 — selection chrome registry. Cross-cutting providers (plugins,
  // AI selection-actions, future domain extensions) register here; the
  // NestedFrame's `<SelectionLayer>` resolver merges their specs with
  // the kind's default view-model below.
  const selectionChrome = useSelectionChromeOrNull();
  const selectionChromeRef = useRef(selectionChrome);
  selectionChromeRef.current = selectionChrome;

  // Manual click-count for the fit-to-frame gesture. The browser's native
  // `dblclick` only fires when the two clicks hit the same element, but
  // selecting a frame on the first click mounts a SelectionLayer button
  // covering the frame interior — so the second click lands on a different
  // DOM target and `dblclick` is suppressed. The motion.div's onClick is
  // the consistent ancestor both clicks bubble through, so we count them
  // here and treat 2 clicks within ~350 ms as a fit gesture.
  const clickCountRef = useRef(0);
  const clickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearClickTimer = useCallback(() => {
    if (clickResetTimerRef.current !== null) {
      clearTimeout(clickResetTimerRef.current);
      clickResetTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearClickTimer, [clearClickTimer]);
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
  const totalScaleFromCtx = useContext(TotalScaleContext);
  const totalScaleFallback = useMotionValue(1);
  const totalScaleMV = totalScaleFromCtx ?? totalScaleFallback;
  const applyHitGate = useCallback(
    (scale: number) => {
      const el = selfRef.current;
      if (el === null) return;
      const dw = widthPx * scale;
      const dh = heightPx * scale;
      el.style.pointerEvents =
        Math.min(dw, dh) >= HIT_THRESHOLD_PX ? "auto" : "none";
    },
    [widthPx, heightPx],
  );
  useLayoutEffect(() => {
    applyHitGate(totalScaleMV.get());
  }, [applyHitGate, totalScaleMV]);
  useMotionValueEvent(totalScaleMV, "change", (s) => {
    applyHitGate(s);
  });

  if (frame === undefined) return null;

  const leftPx = parentWidthPx * frame.x;
  const topPx = parentHeightPx * frame.y;

  const kind = item.kind as DomainKind;

  // Selection outline — every id in `selectedIds` (Figma marquee) gets
  // the accent outline; the legacy `selectedId` is still the primary
  // pick (drives drill / handle attachment). For single-select the two
  // agree.
  const isSelected =
    selectedIds !== undefined ? selectedIds.has(itemId) : selectedId === itemId;
  const isPrimarySelection = selectedId === itemId;
  const childFrames = item.children.filter(isDomainItem);


  // Phase 13e — opacity derived from the FrameStage-level drill spring
  // (`drillProgressMV`) so this frame's alpha rides exactly the same
  // timeline as the design-plane transform. Staggered: a leaving frame
  // (becoming dimmed) fades early; an arriving frame (becoming undimmed)
  // fades late. The result reads as one motion — "leaving first → arriving
  // last" — within one spring window.
  //
  // When no drillProgressMV is wired (read-only contexts, tests), we fall
  // back to a static opacity so nothing animates.
  const drillFromRef = useRef<number>(drillDimmed ? 0 : 1);
  const drillToRef = useRef<number>(drillDimmed ? 0 : 1);
  // Local fallback motion value when no shared spring is wired (read-only
  // tests, storybook). Constant at 1 = `useTransform` returns `to` value
  // directly, i.e. no animation, just the static target opacity.
  const fallbackMV = useMotionValue(1);
  const sourceMV = drillProgressMV ?? fallbackMV;
  // Re-sync refs on every drill-in target change (enteredId in deps), not
  // just when this frame's own dimmed flips. Parent resets drillProgressMV
  // to 0 each enteredId change; stale refs would cause a one-frame opacity
  // flash that reads as a sudden appear/disappear.
  useEffect(() => {
    const p = sourceMV.get();
    const live = computeDrillStaggered(drillFromRef.current, drillToRef.current, p);
    drillFromRef.current = live;
    drillToRef.current = drillDimmed ? 0 : 1;
  }, [drillDimmed, sourceMV, enteredId]);
  const drillOpacityMV = useTransform(sourceMV, (p: number) =>
    computeDrillStaggered(drillFromRef.current, drillToRef.current, p),
  );

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
    // Frame chrome (outline / border) only renders in edit mode. Selected
    // frame is highlighted; unselected frames get a hairline so users can
    // see the frame boundary while authoring. Presentation pass renders
    // documents as bare content on the white stage.
    outline: editing
      ? isSelected
        ? "2px solid var(--accent)"
        : "1px solid var(--surface-1-border)"
      : undefined,
    outlineOffset: editing ? (isSelected ? -2 : -1) : undefined,
    borderRadius: editing ? "var(--radius-md)" : undefined,
    boxSizing: "border-box",
    // Document background is transparent by default — the design's white
    // canvas shows through. Each domain renderer paints its own content.
    background: "transparent",
    ...(frame.rotation ? { transform: `rotate(${frame.rotation}rad)` } : {}),
    ...(drillDimmed ? { pointerEvents: "none" as const } : {}),
  };

  const inner = (
    <motion.div
      ref={selfRef}
      data-testid={`block-${kind}`}
      data-frame-id={itemId}
      // Left-button pointerdown on a frame must NOT start the rubber band on
      // the parent design plane (right-click still bubbles to ContextMenuTrigger;
      // useRubberBand only acts on button=0 anyway). EXCEPT in hand / panning
      // modes: there the user explicitly armed the canvas-pan gesture, so the
      // frame is pass-through and the press must reach the outer FrameStage's
      // pan handler instead of being swallowed here.
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if (im.mode === "hand" || im.mode === "panning") return;
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
        if (im.mode === "hand" || im.mode === "panning") return;
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
        if (
          t instanceof HTMLElement &&
          t.closest("[data-selection-layer]") !== null
        ) {
          e.stopPropagation();
          return;
        }
        // Clicks on a double-click-to-edit text zone should NOT count
        // toward the fit-to-frame counter — the user's 2nd click on text
        // is meant to enter edit mode, not drill into the frame.
        const isInDoubleEditZone =
          t instanceof HTMLElement &&
          t.closest('[data-double-click-edit="true"]') !== null;
        if (!isInDoubleEditZone) {
          // Two qualifying clicks within the window = fit-to-frame.
          clickCountRef.current += 1;
          clearClickTimer();
          if (clickCountRef.current >= 2) {
            clickCountRef.current = 0;
            e.stopPropagation();
            onEnter?.(itemId);
            return;
          }
          clickResetTimerRef.current = setTimeout(() => {
            clickCountRef.current = 0;
            clickResetTimerRef.current = null;
          }, 350);
        }
        e.stopPropagation();
        // Multi-selection-aware click (Figma parity):
        //   • Shift / Cmd / Ctrl + click → toggle this frame in/out of
        //     the multi-selection.
        //   • Plain click on a frame already in the multi-selection →
        //     preserve the selection (no-op). Without this, clicking on
        //     any selected member would collapse the multi to single and
        //     the user could never start a multi-drag.
        //   • Plain click on an unselected frame → replace (existing
        //     single-select behaviour).
        const isModified = e.shiftKey || e.metaKey || e.ctrlKey;
        if (isModified && onToggleSelect !== undefined) {
          onToggleSelect(itemId);
          return;
        }
        if (
          selectedIds !== undefined &&
          selectedIds.size > 1 &&
          selectedIds.has(itemId)
        ) {
          return;
        }
        onSelect?.(itemId);
      }}
      onDragOver={onDragOver}
      onDrop={onDropAdd ? (e: React.DragEvent<HTMLDivElement>) => onDropAdd(e, itemId) : undefined}
      style={{ ...style, opacity: drillOpacityMV } as MotionStyle}
    >
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
      {(() => {
        const dimFlags = computeDrillDimFlags(childFrames, enteredTrailIds);
        return childFrames.map((c, i) => (
          <NestedFrame
            key={String(c.id)}
            item={c}
            parentWidthPx={widthPx}
            parentHeightPx={heightPx}
            editing={editing}
            selectedId={selectedId}
            {...(selectedIds !== undefined ? { selectedIds } : {})}
            {...(onToggleSelect !== undefined ? { onToggleSelect } : {})}
            enteredId={enteredId}
            enteredTrailIds={enteredTrailIds}
            onSelect={onSelect}
            onUpdateItem={onUpdateItem}
            onUpdateShape={onUpdateShape}
            onRemoveShape={onRemoveShape}
            onDropAdd={onDropAdd}
            onDragOver={onDragOver}
            renderFrameMenu={renderFrameMenu}
            onCommitFrame={onCommitFrame}
            onEnter={onEnter}
            selectedHotspotId={selectedHotspotId}
            onSelectHotspot={onSelectHotspot}
            onCommitHotspotRegion={onCommitHotspotRegion}
            drillDimmed={dimFlags[i] === true}
            drillProgressMV={drillProgressMV}
          />
        ));
      })()}
      {isPrimarySelection && onCommitFrame !== undefined ? (
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
            // Phase 18 — text items only expose horizontal edges + corners
            // for resize. Vertical (n/s) handles are removed because the
            // height auto-fits the content (newlines / line wraps grow the
            // box downward; the user never sets height directly).
            const defaultVm = createFrameDefaultViewModel({
              itemKind: kind,
              ...(kind === "text"
                ? { resizeDirs: ["e", "w", "ne", "nw", "se", "sw"] as const }
                : {}),
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
                | { kind: "hotspot"; region: { x: number; y: number; width: number; height: number }; label?: string }
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
                    const target = (e.currentTarget as HTMLElement);
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
                    border: isHotSelected
                      ? "2px solid var(--accent)"
                      : "2px dashed var(--accent)",
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
  return renderFrameMenu ? <>{renderFrameMenu(itemId, inner)}</> : inner;
}

interface AbsoluteFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const ROOT_ABS_FRAME: AbsoluteFrame = { x: 0, y: 0, width: 1, height: 1 };

/** Compose ItemFrames along the trail (root → … → entered) to land at the
 *  entered frame's design-relative 0..1 absolute frame. */
function absoluteFrameFor(
  doc: AgocraftDocument,
  entryId: string | undefined,
): AbsoluteFrame {
  if (entryId === undefined || entryId === String(doc.root.id)) return ROOT_ABS_FRAME;
  const trail = findTrailDeep(doc, entryId);
  if (trail === undefined) return ROOT_ABS_FRAME;
  let x = 0;
  let y = 0;
  let w = 1;
  let h = 1;
  for (const node of trail) {
    const f = (node.attrs as { frame?: ItemFrame }).frame;
    if (f === undefined) continue;
    x = x + f.x * w;
    y = y + f.y * h;
    w = w * f.width;
    h = h * f.height;
  }
  return { x, y, width: w, height: h };
}

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
    onDropAdd,
    onDragOver,
    enteredId,
    document: doc,
    editing = true,
    infiniteCanvas = false,
    handMode = false,
    background = "#ffffff",
    onFitAll,
  } = props;

  const bgTone: "light" | "dark" = useMemo(
    () => (perceivedLuminance(background) >= 0.5 ? "light" : "dark"),
    [background],
  );
  const rootId = String(root.id);
  const frames = root.children.filter(isDomainItem);
  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  // Phase 12c — compute the design-plane transform that brings the entered
  // frame to viewport-fitting size. When nothing's entered, identity.
  const absFrame: AbsoluteFrame = useMemo(() => {
    if (enteredId === undefined || doc === undefined) return ROOT_ABS_FRAME;
    return absoluteFrameFor(doc, enteredId);
  }, [enteredId, doc]);

  // Phase 13e — the set of every id along the trail from root to the
  // entered frame (inclusive). NestedFrame uses this at each tree level to
  // decide which sibling paints above the trail's branch at that level.
  const enteredTrailIds = useMemo<ReadonlySet<string>>(() => {
    if (enteredId === undefined || doc === undefined) return new Set();
    const trail = findTrailDeep(doc, enteredId);
    if (trail === undefined) return new Set();
    return new Set(trail.map((n) => String(n.id)));
  }, [enteredId, doc]);

  // Phase 13e — shared drill-in spring progress. One spring drives the
  // design-plane transform AND each NestedFrame's drill-dim opacity, so
  // zoom, pan, and alpha share one timeline. A spring (not a fixed-
  // duration tween) means farther drill-ins take proportionally longer —
  // entering a tiny frame zooms harder and the animation rides longer
  // accordingly, with the same curve shape at every scale.
  const drillProgressMV = useMotionValue(1);
  // From/To camera state (translate + scale in design-pixel space) tracked
  // across enteredId changes so an interrupted drill-in continues smoothly
  // from its current visual position.
  const drillFromRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const drillToRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const zoom = useMemo(() => {
    const z = 1 / Math.max(absFrame.width, absFrame.height, 0.0001);
    // viewport offset: entered frame's center in design px, translated to
    // origin (so the transform-origin "0 0" math behaves).
    const tx = -(absFrame.x + absFrame.width / 2) * designWidth * z + designWidth / 2;
    const ty = -(absFrame.y + absFrame.height / 2) * designHeight * z + designHeight / 2;
    return { z, tx, ty };
  }, [absFrame, designWidth, designHeight]);

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
  const baseScale = Math.min(
    outerSize.width / designWidth,
    outerSize.height / designHeight,
  ) * paddingFactor;
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
    (next:
      | { tx: number; ty: number; scale: number }
      | ((prev: { tx: number; ty: number; scale: number }) => { tx: number; ty: number; scale: number })) => {
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

  // Whenever the fit target changes (a frame is double-clicked, or the
  // outer-area double-click clears it), reset the user's pan/zoom offset.
  useEffect(() => {
    if (!infiniteCanvas) return;
    setPan({ tx: 0, ty: 0, scale: 1 });
  }, [enteredId, infiniteCanvas, setPan]);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  // Track Space-held for hold-to-pan. Only enabled when infinite canvas is
  // on — for stacked flavors there's nothing to pan to.
  useEffect(() => {
    if (!infiniteCanvas) return undefined;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        t.matches('input, textarea, [contenteditable="true"]')
      ) {
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
      if (e.ctrlKey || e.metaKey) {
        // pinch / Cmd+wheel → custom canvas zoom
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1 / 1.08 : 1.08;
        setPan((p) => ({
          ...p,
          scale: Math.max(0.1, Math.min(8, p.scale * factor)),
        }));
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
  }, [infiniteCanvas]);

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

  const frameAccess = useMemo<FrameAccess>(() => {
    function findFrameElement(itemId: ItemId): HTMLElement | null {
      if (typeof document === "undefined") return null;
      return document.querySelector(`[data-frame-id="${String(itemId)}"]`);
    }
    function findItem(itemId: ItemId): { kind: string; attrs: Readonly<Record<string, unknown>> } | undefined {
      const d = docRef.current;
      if (d === undefined) return undefined;
      const walk = (node: { id: string | number; kind: string; attrs: Readonly<Record<string, unknown>>; children: ReadonlyArray<unknown> }): { kind: string; attrs: Readonly<Record<string, unknown>> } | undefined => {
        if (String(node.id) === String(itemId)) return { kind: node.kind, attrs: node.attrs };
        for (const c of node.children as ReadonlyArray<typeof node>) {
          const found = walk(c);
          if (found !== undefined) return found;
        }
        return undefined;
      };
      return walk(d.root as unknown as Parameters<typeof walk>[0]);
    }
    return {
      resolveTarget(target) {
        // Accept any Element (HTML or SVG). SVG elements appear when the
        // pointer-down lands on a shape kind (ShapeBlock renders an `<svg>`
        // with `<rect>` / `<polygon>` / `<path>` inside) — without this we
        // would reject the press and the frame wouldn't move. `closest()`
        // is defined on Element so the rest of the walk works for both.
        if (!(target instanceof Element)) return null;
        // Bail for inner gesture owners (matches the legacy NestedFrame
        // guard exactly so the binding never claims a press meant for a
        // contenteditable / canvas shape / selection-handle / hotspot).
        if (
          target.closest("[data-shape-id]") !== null ||
          target.closest('[contenteditable="true"]') !== null ||
          target.closest("input, textarea") !== null ||
          target.closest("[data-selection-layer]") !== null ||
          target.closest("[data-hotspot-id]") !== null
        )
          return null;
        const frameEl = target.closest("[data-frame-id]");
        if (frameEl === null) return null;
        const raw = frameEl.getAttribute("data-frame-id");
        return raw === null ? null : (raw as ItemId);
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
      commitFrame(itemId, next) {
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
        // Phase 15 + Phase 18 — proportional corner resize for text.
        // Corner dirs (`ne`/`nw`/`se`/`sw`) on a text item scale BY WIDTH
        // ratio only — fontSize follows the same factor, and height is
        // auto-derived by the renderer's ResizeObserver. We deliberately
        // don't lock aspect via max(sx, sy) like other kinds: vertical
        // pointer movement at a corner has no domain meaning for a text
        // item (height isn't user-set). Edge dirs (`e`/`w`) keep
        // free-width-resize behaviour without changing the font size.
        // (`n`/`s` are removed from the handle set entirely for text.)
        const isCorner = dir.length === 2;
        const isText = o.__origFontSize !== undefined;
        if (isCorner && isText) {
          const scale = Math.max(0.05, nw / o.width);
          nw = o.width * scale;
          // Re-anchor opposite side so the resize feels stable.
          if (dir.includes("w")) nx = o.x + o.width - nw;
          const newFontSize = Math.max(1, (o.__origFontSize as number) * scale);
          // Minimum width ≈ one character.
          const designW = o.__designWidth ?? 1920;
          const minWidthRatio = (newFontSize * 0.6) / designW;
          if (nw < minWidthRatio) {
            nw = minWidthRatio;
            if (dir.includes("w")) nx = o.x + o.width - nw;
          }
          return {
            x: nx,
            y: ny,
            width: Math.max(0.01, nw),
            height: nh,
            rotation: o.rotation,
            __newFontSize: newFontSize,
          } as unknown as FrameGeom;
        }
        // Edge / non-text path. For text + edge w/e, clamp to one-char
        // min width (fontSize doesn't scale here).
        if (isText && (dir === "e" || dir === "w")) {
          const designW = o.__designWidth ?? 1920;
          const minWidthRatio =
            ((o.__origFontSize as number) * 0.6) / designW;
          if (nw < minWidthRatio) {
            nw = minWidthRatio;
            if (dir === "w") nx = o.x + o.width - nw;
          }
        }
        return { ...o, x: nx, y: ny, width: Math.max(0.01, nw), height: Math.max(0.01, nh) } as unknown as FrameGeom;
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
  const designCapability = useMemo(
    () => defaultInsertableRegistry.get("design"),
    [],
  );
  const designAdaptedCapability = useMemo(
    () =>
      designCapability === undefined || editor === undefined
        ? undefined
        : adaptWeaveCapabilityToAgocraft(designCapability, editor),
    [designCapability, editor],
  );

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
      designAdaptedCapability === undefined
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
        createFrameMoveBinding({
          access: frameAccess,
          priority: GESTURE_PRIORITY.ELEMENT_BODY,
          moveThreshold: 3,
        }),
        createPanBinding({
          enabled: () => panActiveRef.current,
          priority: GESTURE_PRIORITY.FALLBACK,
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
  ]);

  // FrameResize + FrameRotate live on a SEPARATE router host attached
  // to `document.body`. SelectionLayer renders its handles via
  // `createPortal(..., document.body)` — they're siblings of the
  // editor's outer div in the DOM, NOT children of `outerRef`. The
  // outer router's capture listener therefore never sees handle
  // clicks. A body-scoped host catches them at the document level.
  // `acceptTarget` keeps the binding inert for non-handle presses, so
  // every other gesture (including outer-router clicks) is unaffected.
  useEffect(() => {
    if (router === null) return undefined;
    if (vm === null) return undefined;
    if (typeof document === "undefined") return undefined;
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
              dir !== "n" && dir !== "ne" && dir !== "e" && dir !== "se" &&
              dir !== "s" && dir !== "sw" && dir !== "w" && dir !== "nw"
            ) return null;
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
          priority: GESTURE_PRIORITY.ELEMENT_HANDLE,
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
          centerViewportOf(_itemId) {
            const b = vm.selectedFrameBoundsViewport.get();
            if (b === null) return { x: 0, y: 0 };
            return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
          },
          acceptTarget: (target) =>
            target instanceof HTMLElement &&
            target.closest("[data-handle-kind='rotation']") !== null,
          priority: GESTURE_PRIORITY.ELEMENT_HANDLE,
        }),
      ],
    });
  }, [router, vm, frameAccess]);

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

  // Drive the drill-in spring whenever the target zoom changes. The spring
  // config is shared with NestedFrame's opacity (via `drillProgressMV` ref-
  // drilled below) so all three channels — translate, scale, alpha — settle
  // on the same frame.
  useEffect(() => {
    const nextTx = baseTx + zoom.tx * baseScale;
    const nextTy = baseTy + zoom.ty * baseScale;
    const nextScale = baseScale * zoom.z;
    if (reduceMotion) {
      drillFromRef.current = { tx: nextTx, ty: nextTy, scale: nextScale };
      drillToRef.current = { tx: nextTx, ty: nextTy, scale: nextScale };
      drillProgressMV.set(1);
      return;
    }
    // Snapshot the current live position so an interrupted drill-in
    // continues from where it is now instead of snapping back to "from".
    const p = drillProgressMV.get();
    const liveTx = drillFromRef.current.tx + (drillToRef.current.tx - drillFromRef.current.tx) * p;
    const liveTy = drillFromRef.current.ty + (drillToRef.current.ty - drillFromRef.current.ty) * p;
    const liveScale = drillFromRef.current.scale + (drillToRef.current.scale - drillFromRef.current.scale) * p;
    drillFromRef.current = { tx: liveTx, ty: liveTy, scale: liveScale };
    drillToRef.current = { tx: nextTx, ty: nextTy, scale: nextScale };
    drillProgressMV.set(0);
    // Distance-proportional duration. Same easing shape, more time for
    // bigger drill-ins. The two terms cover the two perceptual axes:
    //   - positionMag: viewport-pixel pan distance for the design plane.
    //   - scaleMag: log of the scale ratio (perceived zoom is log-prop).
    const positionMag = Math.hypot(nextTx - liveTx, nextTy - liveTy);
    const scaleMag = Math.abs(
      Math.log(Math.max(nextScale, 0.0001) / Math.max(liveScale, 0.0001)),
    );
    const duration = Math.max(
      0.45,
      Math.min(1.8, 0.4 + positionMag / 1500 + scaleMag * 0.55),
    );
    const controls = animate(drillProgressMV, 1, {
      type: "tween",
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => {
      controls.stop();
    };
  }, [zoom.tx, zoom.ty, zoom.z, baseScale, baseTx, baseTy, reduceMotion, drillProgressMV]);

  // Derive the design-plane transform values from `drillProgressMV` so the
  // CSS transform updates every animation frame in lockstep with anything
  // else (here: NestedFrame opacity) that subscribes to the same MV.
  const planeTxMV = useTransform(drillProgressMV, (p: number) =>
    drillFromRef.current.tx + (drillToRef.current.tx - drillFromRef.current.tx) * p,
  );
  const planeTyMV = useTransform(drillProgressMV, (p: number) =>
    drillFromRef.current.ty + (drillToRef.current.ty - drillFromRef.current.ty) * p,
  );
  const planeScaleMV = useTransform(drillProgressMV, (p: number) =>
    drillFromRef.current.scale + (drillToRef.current.scale - drillFromRef.current.scale) * p,
  );

  // Total on-screen scale = user pan zoom × drill-in spring. Provided via
  // context so every descendant (NestedFrame, CanvasBlock shapes, …) can
  // compute its display size and gate hit-testing once the visible footprint
  // drops below `HIT_THRESHOLD_PX`.
  const totalScaleMV = useMotionValue(planeScaleMV.get() * pan.scale);
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
    onSelect?.(undefined);
  }, [onSelect]);

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

  return (
    <TotalScaleContext.Provider value={totalScaleMV}>
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
      onDoubleClick={
        onFitAll
          ? (e) => {
              // NestedFrame stops propagation on its own dblclick, so this
              // handler only fires when the gesture lands on the canvas
              // background (between frames or outside the design plane).
              // Clearing `enteredId` upstream will trigger the pan-reset
              // effect above, so the design plane animates back to the
              // overview view.
              e.stopPropagation();
              onFitAll();
            }
          : undefined
      }
      // DR-017 Phase 2 — pan gesture now lives on the GestureRouter
      // (capture phase); legacy React onPointer handlers removed.
      onDragOver={onDragOver}
      onDrop={onDropAdd ? (e) => onDropAdd(e, rootId) : undefined}
      data-testid="frame-stage"
      data-design-root-id={rootId}
      data-pan-active={panActive ? "true" : undefined}
    >
      {(() => {
        const rootDimFlags = computeDrillDimFlags(frames, enteredTrailIds);
        // Multi-selection union bbox — render one outline around every
        // selected frame *at any depth*. Walks the tree recursively,
        // composing each ancestor's frame so a nested shape selected via
        // Shift+click contributes its absolute design-pixel bbox to the
        // union. Lives inside the design plane motion.div so it rides
        // the camera transform exactly like every NestedFrame.
        const multiSelectionUnion = (() => {
          const ids = props.selectedIds;
          if (ids === undefined || ids.size < 2 || !editing) return null;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          let count = 0;
          const visit = (
            item: typeof root,
            absX: number, absY: number, absW: number, absH: number,
          ): void => {
            if (ids.has(String(item.id))) {
              if (absX < minX) minX = absX;
              if (absY < minY) minY = absY;
              if (absX + absW > maxX) maxX = absX + absW;
              if (absY + absH > maxY) maxY = absY + absH;
              count += 1;
            }
            for (const c of item.children) {
              const f = (c.attrs as { frame?: ItemFrame }).frame;
              if (f === undefined) continue;
              const cx = absX + f.x * absW;
              const cy = absY + f.y * absH;
              const cw = absW * f.width;
              const ch = absH * f.height;
              visit(c as typeof root, cx, cy, cw, ch);
            }
          };
          // Start at design-pixel coordinate space (root spans the whole
          // design plane). Root itself is never in selectedIds because
          // marquee/click never select the synthetic root.
          visit(root, 0, 0, designWidth, designHeight);
          if (count < 2) return null;
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, count };
        })();
        const planeChildren = frames.map((c, i) => (
          <NestedFrame
            key={String(c.id)}
            item={c}
            parentWidthPx={designWidth}
            parentHeightPx={designHeight}
            editing={editing}
            selectedId={props.selectedId}
            {...(props.selectedIds !== undefined ? { selectedIds: props.selectedIds } : {})}
            {...(onToggleSelect !== undefined ? { onToggleSelect } : {})}
            enteredId={enteredId}
            enteredTrailIds={enteredTrailIds}
            onSelect={onSelect}
            onUpdateItem={props.onUpdateItem}
            onUpdateShape={props.onUpdateShape}
            onRemoveShape={props.onRemoveShape}
            onDropAdd={onDropAdd}
            onDragOver={onDragOver}
            renderFrameMenu={props.renderFrameMenu}
            onCommitFrame={props.onCommitFrame}
            onEnter={props.onEnter}
            selectedHotspotId={props.selectedHotspotId}
            onSelectHotspot={props.onSelectHotspot}
            onCommitHotspotRegion={props.onCommitHotspotRegion}
            drillDimmed={rootDimFlags[i] === true}
            drillProgressMV={drillProgressMV}
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
                willChange: "transform",
              }}
            >
              {planeChildren}
              {multiSelectionUnion !== null ? (
                <div
                  data-testid="multi-selection-chrome"
                  data-count={multiSelectionUnion.count}
                  style={{
                    position: "absolute",
                    left: `${multiSelectionUnion.x}px`,
                    top: `${multiSelectionUnion.y}px`,
                    width: `${multiSelectionUnion.width}px`,
                    height: `${multiSelectionUnion.height}px`,
                    pointerEvents: "none",
                    outline: "2px solid var(--accent)",
                    outlineOffset: "-2px",
                    borderRadius: "var(--radius-md)",
                    boxSizing: "border-box",
                  }}
                >
                  {/* Corner dots — pure visual cue that this is a unified
                      bounding box. No interaction (pointerEvents:none on
                      parent); resize on multi is a follow-up. */}
                  {[
                    { left: -4, top: -4 },
                    { right: -4, top: -4 },
                    { left: -4, bottom: -4 },
                    { right: -4, bottom: -4 },
                  ].map((pos, idx) => (
                    <span
                      key={idx}
                      aria-hidden
                      style={{
                        position: "absolute",
                        width: 8,
                        height: 8,
                        background: "var(--accent)",
                        borderRadius: 999,
                        ...pos,
                      }}
                    />
                  ))}
                  {/* Count badge — anchored to the union's top-right corner. */}
                  <span
                    data-testid="multi-selection-count"
                    style={{
                      position: "absolute",
                      top: -22,
                      right: 0,
                      padding: "2px 6px",
                      fontSize: 11,
                      lineHeight: 1.2,
                      fontWeight: 600,
                      background: "var(--accent)",
                      color: "white",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {multiSelectionUnion.count} selected
                  </span>
                </div>
              ) : null}
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
          if (!(target instanceof HTMLElement)) return true;
          return (
            target.closest("[data-frame-id]") === null &&
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
              root.children.filter(isDomainItem).map((c) => {
                const f = (c.attrs as { frame?: ItemFrame }).frame ?? {
                  x: 0, y: 0, width: 1, height: 1,
                };
                return {
                  id: String(c.id),
                  x: f.x * designWidth,
                  y: f.y * designHeight,
                  width: f.width * designWidth,
                  height: f.height * designHeight,
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
              snapSize={20}
              clientToLocal={clientToDesignLocal}
              visualHost={designPlaneRef}
              // Plain drag is reserved for marquee multi-selection (Figma
              // parity). Frame creation via drag now requires Alt held.
              requireAltKey
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
    </TotalScaleContext.Provider>
  );
}
