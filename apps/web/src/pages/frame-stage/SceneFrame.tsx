// WI-217 / DR-138 — flat scene frame. Renders ONE item (frame/domain block) at
// its engine-computed absolute geometry (a `SceneEntry` from
// `@agocraft/layout.computeScene`), plus per-frame SelectionLayer chrome,
// hotspots, focus/cull/hit gating, and routes selection/drag/menu intents up via
// props. NOT recursive — `FrameScene` flat-maps every scene entry to a SceneFrame,
// so the design plane holds a flat list of absolutely-positioned surfaces (the
// tree is already flattened by `computeScene`; DFS pre-order = paint order, so a
// child still paints on top of its parent). This replaces the recursive
// `NestedFrame` (which computed ratio→px in React and read the DOM back).
//
// Position comes from the rigid scene transform: a box of size (w,h) centered at
// (cx,cy) rotated by `rotation` (ABSOLUTE — ancestor rotations already composed by
// computeScene). One CSS `rotate(rotation)` about the box centre reproduces the
// whole ancestor chain exactly.

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

interface SceneFrameProps {
  readonly item: AgocraftItem;
  // ── Scene geometry (design px, absolute — from computeScene's SceneEntry). ──
  /** Visual centre x (design px). */
  readonly cx: number;
  /** Visual centre y (design px). */
  readonly cy: number;
  /** Box width (design px, rotation-invariant). */
  readonly w: number;
  /** Box height (design px). */
  readonly h: number;
  /** Absolute rotation (radians) — own + every ancestor's. */
  readonly rotation: number;
  /** The parent's box height (design px) — fed to ParentFrameHeightContext for
   *  font-size-ratio resolution (was `parentHeightPx`). */
  readonly parentHeight: number;
  readonly editing: boolean;
  readonly selectedId: string | undefined;
  readonly selectedIds?: ReadonlySet<string>;
  readonly dimmedFrameIds?: ReadonlySet<string>;
  readonly isolatedFrameIds?: ReadonlySet<string>;
  readonly onToggleSelect?: (itemId: string) => void;
  readonly onSelect: ((id: string | undefined) => void) | undefined;
  readonly onUpdateItem: FrameStageProps["onUpdateItem"];
  readonly onUpdateShape: FrameStageProps["onUpdateShape"];
  readonly onRemoveShape: FrameStageProps["onRemoveShape"];
  readonly onDropAdd: FrameStageProps["onDropAdd"];
  readonly onDragOver: FrameStageProps["onDragOver"];
  readonly renderFrameMenu: FrameStageProps["renderFrameMenu"];
  readonly onCommitFrame:
    | ((itemId: string, next: ItemFrame, sessionId?: string) => void)
    | undefined;
  readonly selectedHotspotId: string | undefined;
  readonly onSelectHotspot: ((hotspotId: string | undefined) => void) | undefined;
  readonly onCommitHotspotRegion:
    | ((
        itemId: string,
        hotspotId: string,
        region: { x: number; y: number; width: number; height: number },
      ) => void)
    | undefined;
  readonly onContextMenuRequest?:
    | ((itemId: string, clientX: number, clientY: number) => void)
    | undefined;
  readonly artboardId?: string | undefined;
  readonly roles: RolePolicy;
  readonly hit: HitPolicy;
}

function SceneFrameImpl({
  item,
  cx,
  cy,
  w,
  h,
  rotation,
  parentHeight,
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
}: SceneFrameProps) {
  const itemId = String(item.id);
  const _selectionVm = useContext(SelectionVmContext);
  // WI-198 — latest committed document, read ONLY at event/rAF time.
  const docRef = useContext(DocRefContext);
  const _im = useInteractionMode();
  const selectionAllowed = useFrameSelectionAllowed();
  const cropping = useIsCropping();
  const croppingItemId = useCroppingItemId();
  const isCroppingThis = croppingItemId === itemId;
  const chromeVisible = useSelectionChromeVisible() && (!cropping || isCroppingThis);
  const isFrameHovered = useIsFrameHovered(itemId);
  const selectionChrome = useSelectionChromeOrNull();
  const selectionChromeRef = useRef(selectionChrome);
  selectionChromeRef.current = selectionChrome;

  const attrs = item.attrs as { frame?: ItemFrame };
  const selfRef = useRef<HTMLDivElement>(null);

  // Design-pixel footprint comes straight from the scene entry (no ratio math).
  const widthPx = w;
  const heightPx = h;

  // Display-size hit gate + focus gating (unchanged from the recursive renderer;
  // it reads the engine-computed px footprint instead of a parent-derived one).
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
      el.style.pointerEvents = dw * dh >= HIT_THRESHOLD_AREA_PX2 ? "auto" : "none";
    },
    [widthPx, heightPx],
  );
  useLayoutEffect(() => {
    applyHitGate(totalScaleMV.get());
  }, [applyHitGate, totalScaleMV]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useLayoutEffect(() => {
    applyHitGate(totalScaleMV.get());
  }, [applyHitGate, totalScaleMV, isolatedFrameIds, dimmedFrameIds]);
  useMotionValueEvent(totalScaleMV, "change", (s) => {
    applyHitGate(s);
  });

  // WI-058 / DR-021 — viewport culling (wrapper registered with FrameStage's
  // IntersectionObserver; visibility ref-mutation + culled state for ImageBlock).
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

  // Degenerate box → nothing to render (zero-area frame can't be hit-tested).
  if (!(widthPx > 0) || !(heightPx > 0)) return null;

  // Rigid placement: top-left = centre − half-box; one rotate() about the centre.
  const leftPx = cx - widthPx / 2;
  const topPx = cy - heightPx / 2;

  const kind = item.kind as DomainKind;
  const flip = FLIP_ALLOWED_KINDS.has(kind)
    ? readFlip(item as unknown as Parameters<typeof readFlip>[0])
    : { flipH: false, flipV: false };
  const flipped = flip.flipH || flip.flipV;

  const isSelected = selectedIds !== undefined ? selectedIds.has(itemId) : selectedId === itemId;
  const isPrimarySelection = isSelected;
  const isMultiSelection = selectedIds !== undefined && selectedIds.size > 1;
  const chromeForThisItem = !isMultiSelection || isFrameHovered;

  const style: CSSProperties = {
    position: "absolute",
    left: `${leftPx}px`,
    top: `${topPx}px`,
    width: `${widthPx}px`,
    height: `${heightPx}px`,
    transformOrigin: "center center",
    overflow: "visible",
    outline: editing && !isSelected ? "1px solid var(--surface-1-border)" : undefined,
    outlineOffset: editing && !isSelected ? -1 : undefined,
    borderRadius: editing && !isSelected ? "var(--radius-md)" : undefined,
    boxSizing: "border-box",
    background: "transparent",
    opacity: isolatedFrameIds?.has(itemId)
      ? "var(--focus-isolate-opacity, 0)"
      : dimmedFrameIds?.has(itemId)
        ? "var(--focus-dim-opacity, 0.28)"
        : 1,
    transition: "opacity 180ms ease",
    ...(isolatedFrameIds?.has(itemId) || dimmedFrameIds?.has(itemId)
      ? { pointerEvents: "none" as const }
      : {}),
    // Absolute rotation (own + ancestors, composed by computeScene). The box is
    // positioned at its visual centre, so one rotate() reproduces the chain.
    ...(rotation ? { transform: `rotate(${rotation}rad)` } : {}),
    ...(isCroppingThis ? { zIndex: 51 } : {}),
  };

  // Auto-width/height text: chrome hugs the LIVE text on the auto axis (the box
  // lags a debounce). S3 will source this from the scene; for now it still reads
  // the rendered content element via selfRef-relative DOM.
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
          return textAutoMode === "WIDTH_AND_HEIGHT"
            ? { left: c.left, top: b.top, width: c.width, height: b.height }
            : { left: b.left, top: c.top, width: b.width, height: c.height };
        }
      : undefined;

  // DR-053 Stage 3 — TextBlock is a pure renderer filling its engine-assigned box.
  // The parent height (scene) feeds font-size-ratio resolution.
  const frameContentNode = (
    <ParentFrameHeightContext.Provider value={parentHeight}>
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

  const inner = (
    <motion.div
      ref={selfRef}
      data-testid={`block-${kind}`}
      data-frame-id={itemId}
      data-frame-kind={kind}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if (!selectionAllowed) return;
        const t = e.target;
        if (t instanceof HTMLElement) {
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
        e.stopPropagation();
        onSelect?.(itemId);
      }}
      onDoubleClick={(e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
      }}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (!selectionAllowed) return;
        const t = e.target;
        if (t instanceof HTMLElement) {
          if (t.closest("[data-shape-id]") !== null) {
            onSelect?.(undefined);
            return;
          }
          if (
            t.closest('[contenteditable="true"]') !== null ||
            t.closest("input, textarea") !== null
          ) {
            e.stopPropagation();
            return;
          }
        }
        if (t instanceof HTMLElement && t.closest("[data-selection-layer]") !== null) {
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        const intent: ClickIntent = e.shiftKey
          ? "toggle"
          : e.metaKey || e.ctrlKey
            ? "deep"
            : "plain";
        const doc = docRef?.current;
        if (intent === "toggle" && onToggleSelect !== undefined) {
          if (doc === undefined || capabilityOf(roles, doc, itemId).selectable === "normal")
            onToggleSelect(itemId);
          return;
        }
        if (selectedIds !== undefined && selectedIds.size > 1 && selectedIds.has(itemId)) {
          return;
        }
        if (doc !== undefined) {
          const targetFrameId =
            (t instanceof HTMLElement
              ? t.closest("[data-frame-id]")?.getAttribute("data-frame-id")
              : null) ?? itemId;
          const next = hit.selectTarget(targetFrameId, doc, {
            intent,
            currentId: selectedId,
            activePageId: artboardId,
          });
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
        if (onContextMenuRequest === undefined) return;
        if (!selectionAllowed) return;
        onContextMenuRequest(itemId, e.clientX, e.clientY);
      }}
      onDragOver={onDragOver}
      onDrop={
        onDropAdd
          ? (e: React.DragEvent<HTMLDivElement>) => {
              e.stopPropagation();
              onDropAdd(e, itemId);
            }
          : undefined
      }
      style={style as MotionStyle}
    >
      {/* WI-074 D7 — a flipped leaf mirrors its content around the frame centre
          (DISPLAY-ONLY). Frames are excluded from FLIP_ALLOWED_KINDS, and in the
          flat renderer children are SEPARATE scene entries (not nested here), so
          there is no child subtree to mirror — the flip wraps the leaf content. */}
      {flipped ? (
        <div className="absolute inset-0" style={{ ...flipTransform(flip) }}>
          {frameContentNode}
        </div>
      ) : (
        frameContentNode
      )}
      {isPrimarySelection && onCommitFrame !== undefined && chromeVisible && chromeForThisItem ? (
        <SelectionLayer
          targetRef={selfRef}
          {...(composeTextBounds !== undefined ? { boundsOf: composeTextBounds } : {})}
          resolveHandles={(bounds) => {
            const info = {
              selectionKind: "frame" as const,
              itemId,
              itemKind: kind,
              unitKinds: item.units.map((u) => u.kind),
            };
            const doc = docRef?.current;
            const constraints =
              LAYOUT_FEATURE_ENABLED && doc !== undefined
                ? getLayoutEngine().getChildConstraints({ root: doc.root, itemId: item.id })
                : undefined;
            const locked = isItemLocked(item);
            const noCanvasHandles =
              doc !== undefined && !capabilityOf(roles, doc, itemId).canvasHandles;
            const handles = (
              noCanvasHandles
                ? []
                : applyLayoutConstraintFilter(
                    selectionChromeRef.current?.resolve(info) ?? [],
                    constraints,
                    locked,
                  )
            ).map((spec) => {
              const pos = resolveAnchor(spec.anchor, bounds);
              return {
                id: spec.id,
                itemId,
                x: pos.x,
                y: pos.y,
                node: spec.render({ bounds, selection: info }) as React.ReactNode,
              };
            });
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

  return renderFrameMenu ? renderFrameMenu(itemId, inner) : inner;
}

// WI-198 — memoized. Every prop is identity-stable across document ticks
// (FrameStage's `useStableHandler` + structurally-shared `item`); the geometry
// props are PRIMITIVES, so an unchanged frame's SceneFrame bails the re-render
// even though `computeScene` produces a fresh scene object each tick. This keeps
// the recursive renderer's WI-198 perf property (only changed frames reconcile)
// without a recursive tree.
export const SceneFrame = memo(SceneFrameImpl);
