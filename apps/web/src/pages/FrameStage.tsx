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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type React from "react";
import { findTrailDeep, isDomainItem } from "../document/agocraft-mirror.js";
import type {
  AgoItem,
  DomainKind,
  ItemFrame,
} from "../document";
import { DOMAIN_RENDERERS } from "../document/domains";
import { RubberBandLayer } from "../document/rubber-band/RubberBandLayer.js";
import { KindTooltip } from "../document/tooltip/KindTooltip.js";

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
  readonly root: AgocraftItem;
  /**
   * Phase F (WI-017) — when provided, the design plane is wrapped with
   * `<RubberBandLayer containerKind="design">` so dragging on empty space
   * opens the recommendation popover. When undefined, FrameStage renders
   * the plane as a plain div (legacy behavior, zero regression).
   */
  readonly editor?: Editor | undefined;
  readonly selectedId?: string | undefined;
  readonly onSelect?: ((itemId: string | undefined) => void) | undefined;
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
  /** Phase 12c — id of the frame currently *entered* (drill-in). When set,
   *  the design plane zooms in to that frame; double-clicking a child frame
   *  re-enters into it. Esc / breadcrumb clears it. */
  readonly enteredId?: string | undefined;
  readonly onEnter?: ((itemId: string) => void) | undefined;
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
  readonly selectedId: string | undefined;
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
}

function NestedFrame({
  item,
  parentWidthPx,
  parentHeightPx,
  selectedId,
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
  enteredTrailIds,
}: NestedFrameProps) {
  const itemId = String(item.id);
  const attrs = item.attrs as { frame?: ItemFrame };
  const frame = attrs.frame;
  const selfRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | { kind: "none" }
    | {
        kind: "move";
        startX: number;
        startY: number;
        orig: ItemFrame;
        parentW: number;
        parentH: number;
      }
    | {
        kind: "resize";
        dir: HandleDir;
        startX: number;
        startY: number;
        orig: ItemFrame;
        parentW: number;
        parentH: number;
      }
    | {
        kind: "rotate";
        centerX: number;
        centerY: number;
        startAngle: number;
        orig: ItemFrame;
      }
  >({ kind: "none" });

  if (frame === undefined) return null;

  const widthPx = parentWidthPx * frame.width;
  const heightPx = parentHeightPx * frame.height;
  const leftPx = parentWidthPx * frame.x;
  const topPx = parentHeightPx * frame.y;

  const kind = item.kind as DomainKind;
  const Renderer = DOMAIN_RENDERERS[kind] as React.ComponentType<{
    item: AgoItem;
    onUpdate?: (patch: Record<string, unknown>) => void;
    onUpdateShape?: (shapeId: string, patch: object) => void;
    onRemoveShape?: (shapeId: string) => void;
  }> | undefined;

  const isSelected = selectedId === itemId;
  const childFrames = item.children.filter(isDomainItem);
  const isCanvas = kind === "canvas-design";

  // Phase 12b — frame manipulation. Pointer-deltas are in viewport pixels;
  // we divide by the parent element's display rect to land in 0..1 ratio
  // space (the units `ItemFrame` lives in). The drag pipeline mirrors the
  // shape-resize math from CanvasBlock — see also `resizeFrame` above.
  const startMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (frame === undefined) return;
      const parentEl = selfRef.current?.parentElement;
      if (parentEl === null || parentEl === undefined) return;
      const rect = parentEl.getBoundingClientRect();
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        kind: "move",
        startX: e.clientX,
        startY: e.clientY,
        orig: frame,
        parentW: rect.width,
        parentH: rect.height,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [frame],
  );

  const startResize = useCallback(
    (dir: HandleDir, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (frame === undefined) return;
      const parentEl = selfRef.current?.parentElement;
      if (parentEl === null || parentEl === undefined) return;
      const rect = parentEl.getBoundingClientRect();
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        kind: "resize",
        dir,
        startX: e.clientX,
        startY: e.clientY,
        orig: frame,
        parentW: rect.width,
        parentH: rect.height,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [frame],
  );

  const startRotate = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (frame === undefined) return;
      if (selfRef.current === null) return;
      const rect = selfRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        kind: "rotate",
        centerX: cx,
        centerY: cy,
        startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) + Math.PI / 2,
        orig: frame,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [frame],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (d.kind === "none") return;
      if (onCommitFrame === undefined) return;
      if (d.kind === "move") {
        const dx = (e.clientX - d.startX) / d.parentW;
        const dy = (e.clientY - d.startY) / d.parentH;
        onCommitFrame(itemId, { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy });
      } else if (d.kind === "resize") {
        const dx = (e.clientX - d.startX) / d.parentW;
        const dy = (e.clientY - d.startY) / d.parentH;
        onCommitFrame(itemId, resizeFrame(d.orig, dx, dy, d.dir));
      } else if (d.kind === "rotate") {
        const angle =
          Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX) + Math.PI / 2;
        onCommitFrame(itemId, { ...d.orig, rotation: angle });
      }
    },
    [itemId, onCommitFrame],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    dragRef.current = { kind: "none" };
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore — pointer capture may already be released.
    }
  }, []);

  const style: CSSProperties = {
    position: "absolute",
    left: `${leftPx}px`,
    top: `${topPx}px`,
    width: `${widthPx}px`,
    height: `${heightPx}px`,
    transform: frame.rotation ? `rotate(${frame.rotation}rad)` : undefined,
    transformOrigin: "center center",
    overflow: "hidden",
    outline: isSelected ? "2px solid var(--accent)" : "1px solid var(--surface-1-border)",
    outlineOffset: isSelected ? -2 : -1,
    borderRadius: "var(--radius-md)",
    boxSizing: "border-box",
    background: "var(--surface-1)",
    // Phase 13e — drill-in dim. Siblings later in z-order than the entered
    // branch fade out so the entered frame isn't obscured once the camera
    // zooms in. Opacity uses an **ease-in** curve that lags behind the
    // design-plane scale/translate — for the first ~40% of the gesture
    // the fading siblings stay nearly opaque, then drop quickly toward
    // the end. The asymmetry makes opacity feel like a *consequence* of
    // the camera move rather than a parallel channel; symmetric easing
    // reads as rushed and synthetic. Duration runs ~150ms past the
    // camera transition so the opacity tail finishes after the camera
    // settles.
    opacity: drillDimmed ? 0 : 1,
    transition: "opacity 720ms cubic-bezier(0.7, 0, 0.84, 0)",
    pointerEvents: drillDimmed ? "none" : undefined,
  };

  const inner = (
    <div
      ref={selfRef}
      data-testid={`block-${kind}`}
      data-frame-id={itemId}
      // Phase F (WI-017) — left-button pointerdown on a frame must NOT
      // start the rubber band on the parent design plane. Other buttons
      // (especially right-click for ContextMenuTrigger) must continue to
      // bubble — useRubberBand only cares about `e.button === 0` anyway.
      // (The hook also has a `target === currentTarget` guard, but this
      // is the cheap-and-explicit local belt to the suspenders.)
      onPointerDown={(e) => {
        if (e.button === 0) e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        // Phase 12c — double-click drills into the frame. The same guards
        // that protect single-click selection apply: a dbl-click on a
        // shape / inline-editable text shouldn't trigger drill-in.
        const t = e.target;
        if (t instanceof HTMLElement) {
          if (
            t.closest("[data-shape-id]") !== null ||
            t.closest('[contenteditable="true"]') !== null ||
            t.closest("input, textarea") !== null
          ) {
            return;
          }
        }
        e.stopPropagation();
        onEnter?.(itemId);
      }}
      onClick={(e) => {
        // Phase 12 — only treat clicks on the frame *chrome* as a "select
        // the frame" gesture. Clicks that originate in interactive children
        // — a canvas shape, an EditableText, a form control, the inner
        // SelectionLayer handles — should leave the frame's selection state
        // alone so the inner element behaves normally.
        const t = e.target;
        if (t instanceof HTMLElement) {
          // Shape clicks live inside the canvas frame's inner SelectionLayer
          // surface — picking a shape *deselects* the frame so the two
          // SelectionLayers (frame + shape) don't compete.
          if (t.closest("[data-shape-id]") !== null) {
            onSelect?.(undefined);
            return;
          }
          if (
            t.closest("[data-selection-layer]") !== null ||
            t.closest('[contenteditable="true"]') !== null ||
            t.closest("input, textarea") !== null
          ) {
            return;
          }
        }
        e.stopPropagation();
        onSelect?.(itemId);
      }}
      onDragOver={onDragOver}
      onDrop={onDropAdd ? (e) => onDropAdd(e, itemId) : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={style}
    >
      {Renderer !== undefined ? (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <Renderer
            item={item as unknown as AgoItem}
            {...(onUpdateItem
              ? {
                  onUpdate: (patch: Record<string, unknown>) =>
                    onUpdateItem(itemId, (prev) => ({ ...prev, ...(patch as object) })),
                }
              : {})}
            {...(isCanvas && onUpdateShape
              ? {
                  onUpdateShape: (shapeId: string, patch: object) =>
                    onUpdateShape(itemId, shapeId, patch),
                }
              : {})}
            {...(isCanvas && onRemoveShape
              ? {
                  onRemoveShape: (shapeId: string) => onRemoveShape(itemId, shapeId),
                }
              : {})}
          />
        </div>
      ) : null}
      {(() => {
        const dimFlags = computeDrillDimFlags(childFrames, enteredTrailIds);
        return childFrames.map((c, i) => (
          <NestedFrame
            key={String(c.id)}
            item={c}
            parentWidthPx={widthPx}
            parentHeightPx={heightPx}
            selectedId={selectedId}
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
          />
        ));
      })()}
      {isSelected && onCommitFrame !== undefined ? (
        <SelectionLayer
          box={{ left: 0, top: 0, width: "100%", height: "100%", rotation: 0 }}
          capability={{
            moveable: true,
            resizable: true,
            rotatable: true,
            resizeHandles: ALL_HANDLES,
          }}
          onMoveStart={startMove}
          onResizeStart={startResize}
          onRotateStart={startRotate}
        />
      ) : null}
      {/* Phase 13c-2 — hotspot region overlays for the *selected* frame.
          Dashed border by default; the selected hotspot gets a body-drag
          handler so it can be moved with the pointer. Resize is still the
          PropertiesPanel's number inputs (Phase 13c-1). */}
      {isSelected
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
    </div>
  );

  // Phase D — wrap with KindTooltip (capability registry per item.kind). The
  // tooltip lives *inside* renderFrameMenu's ContextMenu wrap so the menu's
  // Slot composes onto KindTooltip, KindTooltip's Slot onto the frame div.
  // Ref + handler composition flows through both via the forwardRef path.
  const tooltipped = (
    <KindTooltip
      item={item as unknown as AgoItem}
      selected={isSelected}
      entered={enteredId === itemId}
    >
      {inner}
    </KindTooltip>
  );
  return renderFrameMenu ? <>{renderFrameMenu(itemId, tooltipped)}</> : tooltipped;
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

export function FrameStage(props: FrameStageProps) {
  const { designWidth, designHeight, root, editor, onSelect, onDropAdd, onDragOver, enteredId, document: doc } = props;
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
  const zoom = useMemo(() => {
    const z = 1 / Math.max(absFrame.width, absFrame.height, 0.0001);
    // viewport offset: entered frame's center in design px, translated to
    // origin (so the transform-origin "0 0" math behaves).
    const tx = -(absFrame.x + absFrame.width / 2) * designWidth * z + designWidth / 2;
    const ty = -(absFrame.y + absFrame.height / 2) * designHeight * z + designHeight / 2;
    return { z, tx, ty };
  }, [absFrame, designWidth, designHeight]);

  const outerRef = useRef<HTMLDivElement | null>(null);
  const [outerWidth, setOuterWidth] = useState<number>(designWidth);
  // Phase 12a — measure *before* the first paint so the design plane's
  // scale is correct on initial render. Without this, e2e or any code that
  // reads element rects right after mount would see the un-scaled (1920px)
  // layout for one frame and chase a moving target.
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (el === null) return;
    const w = el.getBoundingClientRect().width;
    if (w > 0) setOuterWidth(w);
  }, []);
  useEffect(() => {
    const el = outerRef.current;
    if (el === null) return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number" && w > 0) setOuterWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Uniform scale that fits design.width into the outer (CSS-driven) width.
  const scale = outerWidth / designWidth;

  const handleBackgroundClick = useCallback(() => {
    onSelect?.(undefined);
  }, [onSelect]);

  return (
    <div
      ref={outerRef}
      className="relative mx-auto"
      style={{
        width: "100%",
        maxWidth: designWidth,
        aspectRatio: `${designWidth} / ${designHeight}`,
      }}
      onClick={handleBackgroundClick}
      onDragOver={onDragOver}
      onDrop={onDropAdd ? (e) => onDropAdd(e, rootId) : undefined}
    >
      <div
        className="absolute inset-0 rounded-[var(--radius-lg)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] overflow-hidden"
        data-testid="frame-stage"
        data-design-root-id={rootId}
      >
        {/* Design plane — fixed pixel size, scaled into the outer box. Frames
            below it position themselves in design-pixel coordinates so their
            content (typography, padding) is never clipped just because the
            frame is a small fraction of the design. Phase 12c — when
            `enteredId` is set, a second transform layer composes a zoom-in
            (and translate) animation on top, bringing the entered frame
            viewport-filling. */}
        {(() => {
          const designPlaneStyle: CSSProperties = {
            position: "absolute",
            left: 0,
            top: 0,
            width: `${designWidth}px`,
            height: `${designHeight}px`,
            transformOrigin: "top left",
            transform: `translate(${zoom.tx * scale}px, ${zoom.ty * scale}px) scale(${scale * zoom.z})`,
            transition: reduceMotion ? "none" : "transform 520ms cubic-bezier(0.34, 1.20, 0.64, 1)",
            willChange: "transform",
          };
          const rootDimFlags = computeDrillDimFlags(frames, enteredTrailIds);
          const planeChildren = frames.map((c, i) => (
            <NestedFrame
              key={String(c.id)}
              item={c}
              parentWidthPx={designWidth}
              parentHeightPx={designHeight}
              selectedId={props.selectedId}
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
            />
          ));
          // [BISECT — RubberBandLayer mount restored to verify regression]
          if (editor !== undefined) {
            return (
              <RubberBandLayer
                containerKind="design"
                containerId={String(root.id)}
                containerSize={{ width: designWidth, height: designHeight }}
                editor={editor}
                snapSize={20}
                style={designPlaneStyle}
              >
                {planeChildren}
              </RubberBandLayer>
            );
          }
          return <div style={designPlaneStyle}>{planeChildren}</div>;
        })()}
      </div>
    </div>
  );
}
