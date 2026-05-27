// HoverAffordanceLayer — WI-040 Phase 2 / DR-design-016.
//
// 3-tier hover overlay primitive. Draws three differently-styled
// outlines simultaneously so the user can see — at a glance — the
// reach of the hover under the pointer:
//
//   • hovered     — the item the pointer is directly over
//                   (2px solid accent + glow — focal emphasis)
//   • descendants — every Item inside the hovered item's own subtree
//                   (2px DASHED accent, no glow — same hue+weight as
//                   the focal item but dashed so the focal hovered
//                   keeps the primary-target hierarchy; glow dropped
//                   so nested children don't pile halos)
//   • parent      — the direct parent of the hovered item, one level up
//                   (1px solid, low-chroma accent + 4% inset tint)
//
// Tree siblings of the hovered item are intentionally absent. The user
// rejected sibling chrome on 2026-05-27: hovering one item must NOT
// paint any visual on its peers. The hover effect now travels DOWN
// through the subtree and UP exactly one level to the parent — never
// sideways.
//
// All three tiers share the same hue (`--accent`). The visual hierarchy
// comes from stroke style + chroma + glow, not from different colors —
// so the brain reads them as "the same group" rather than three
// independent signals. Adding a fourth color (or a different hue per
// tier) breaks the intent (사용자 명시 / DR-design-016 §"3-tier 시각 토큰").
//
// **Constant stroke width across camera zoom.** Input rects are
// expressed in design-plane local CSS px (the same coords the document
// projector emits). The layer portals to `document.body` and on every
// rAF tick measures the host element's bounding rect to derive the
// camera's effective scale + translation. Each tier is positioned in
// viewport coords (`position: fixed`); the outline strokes therefore
// stay at their declared CSS pixel width regardless of how far the user
// has zoomed in or out — matching SelectionLayer / MarqueeSelectionLayer
// behaviour. This is the contract the user requested 2026-05-27:
// "셀렉션 핸들과 러버벤드처럼 항상 동일한 선두께를 유지해야해."

import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface Rect {
  /** Design-plane local CSS pixels. The host (production: FrameStage's
   *  design plane; demo: any element with `data-design-plane="true"`)
   *  is the coordinate origin. The layer converts to viewport coords
   *  internally using the host's live bounding rect. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Optional rotation in radians. Applied via CSS transform around
   *  the rect's center, after the design-plane → viewport conversion. */
  readonly rotation?: number;
  /** Optional stable identity (typically the source item id). When
   *  provided, used as the React key for sibling rects so reordering
   *  re-keys correctly. */
  readonly id?: string;
}

export interface HoverAffordanceLayerProps {
  /** Top-level on/off. When false the entire layer renders nothing.
   *  Host wires this from `useEditAffordancesAllowed()` + a non-null
   *  hovered id. */
  readonly visible: boolean;
  /** The directly-hovered rect. `null` when nothing is hovered. */
  readonly hovered: Rect | null;
  /** Every Item in the hovered item's own subtree. Painted with the
   *  same outline as the focal `hovered` tier (no glow). Pass an empty
   *  array when the hovered item is a leaf. */
  readonly descendants: ReadonlyArray<Rect>;
  /** The hovered item's direct parent container (one level up).
   *  `null` when the parent is the design root. */
  readonly parent: Rect | null;
  /** Optional explicit host. When omitted the layer queries
   *  `[data-design-plane="true"]` (FrameStage's design plane). The
   *  host's `offsetWidth/offsetHeight` define the natural design-plane
   *  size; its live `getBoundingClientRect` defines the viewport
   *  position + effective scale. */
  readonly hostRef?: RefObject<HTMLElement | null>;
}

interface HostBox {
  readonly left: number;
  readonly top: number;
  readonly scale: number;
}

/** Wrapper that establishes a fixed coordinate root at (0, 0) so
 *  child tiers can position themselves via viewport-fixed `left`/`top`
 *  without inheriting any ancestor transform. */
const LAYER_STYLE: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  pointerEvents: "none",
  // Sits below SelectionLayer (z 40) and MarqueeSelectionLayer (z 42)
  // so selection chrome paints on top of hover affordance.
  zIndex: 35,
};

function tierStyle(rect: Rect, host: HostBox): CSSProperties {
  const x = host.left + rect.x * host.scale;
  const y = host.top + rect.y * host.scale;
  const w = rect.width * host.scale;
  const h = rect.height * host.scale;
  const base: CSSProperties = {
    position: "fixed",
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
    boxSizing: "border-box",
    pointerEvents: "none",
  };
  if (rect.rotation !== undefined && rect.rotation !== 0) {
    base.transform = `rotate(${rect.rotation}rad)`;
    base.transformOrigin = "center center";
  }
  return base;
}

/** WI-040 — visual-only overlay. Marked `aria-hidden` so screen readers
 *  ignore the chrome; semantic information about hovered items lives
 *  with the items themselves. */
export function HoverAffordanceLayer({
  visible,
  hovered,
  descendants,
  parent,
  hostRef,
}: HoverAffordanceLayerProps): React.ReactElement | null {
  const [host, setHost] = useState<HostBox | null>(null);

  useEffect(() => {
    if (!visible) {
      setHost(null);
      return undefined;
    }
    if (typeof document === "undefined") return undefined;
    let raf = 0;
    let lastKey = "";
    const measure = () => {
      const el =
        hostRef?.current ?? document.querySelector<HTMLElement>('[data-design-plane="true"]');
      if (el === null) {
        if (lastKey !== "") {
          lastKey = "";
          setHost(null);
        }
      } else {
        const r = el.getBoundingClientRect();
        const naturalW = el.offsetWidth;
        // Effective scale = rendered width / natural (pre-transform)
        // width. Camera transform applies translate + uniform scale
        // (FrameStage's design plane uses scale, not skew), so scaleX
        // === scaleY and one factor suffices.
        const scale = naturalW === 0 ? 1 : r.width / naturalW;
        const key = `${r.left.toFixed(1)}|${r.top.toFixed(1)}|${scale.toFixed(4)}`;
        if (key !== lastKey) {
          lastKey = key;
          setHost({ left: r.left, top: r.top, scale });
        }
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [visible, hostRef]);

  if (!visible) return null;
  if (typeof document === "undefined" || host === null) return null;

  return createPortal(
    <div data-testid="hover-affordance-layer" aria-hidden="true" style={LAYER_STYLE}>
      {parent !== null ? (
        <div
          data-hover-tier="parent"
          style={{
            ...tierStyle(parent, host),
            outline: "1px solid var(--hover-affordance-stroke-parent)",
            outlineOffset: "0px",
            background: "var(--hover-affordance-tint-parent)",
          }}
        />
      ) : null}
      {descendants.map((rect, i) => (
        <div
          key={rect.id ?? `descendant-${i}-${rect.x}x${rect.y}`}
          data-hover-tier="descendant"
          style={{
            // Same accent + weight as the focal tier so descendants
            // read as "part of the same hover target", but DASHED so
            // the focal hovered (solid + glow) keeps its visual
            // hierarchy as the primary target. User-confirmed
            // 2026-05-27. Glow is dropped on purpose — stacking glows
            // on nested children would create a halo soup; the focal
            // tier owns the single glow.
            ...tierStyle(rect, host),
            outline: "2px dashed var(--hover-affordance-stroke-hovered)",
            outlineOffset: "0px",
          }}
        />
      ))}
      {hovered !== null ? (
        <div
          data-hover-tier="hovered"
          style={{
            ...tierStyle(hovered, host),
            outline: "2px solid var(--hover-affordance-stroke-hovered)",
            outlineOffset: "0px",
            boxShadow: "0 0 0 4px var(--hover-affordance-glow-hovered)",
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
