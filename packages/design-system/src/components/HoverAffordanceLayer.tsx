// HoverAffordanceLayer — WI-040 Phase 2 / DR-design-016.
//
// 3-tier hover overlay primitive. Draws three differently-styled
// outlines simultaneously so the user can see — at a glance — the
// containment relationship of the item under the pointer:
//
//   • hovered  — the item the pointer is directly over
//                (2px solid accent + glow)
//   • siblings — every other child of the same parent
//                (1px dashed, lower-chroma accent)
//   • parent   — the container that holds the hovered + siblings
//                (1px solid, low-chroma accent + 4% inset tint)
//
// All three tiers share the same hue (`--accent`). The visual hierarchy
// comes from stroke style + chroma, not from different colors — so the
// brain reads them as "the same group" rather than three independent
// signals. Adding a fourth color (or a different hue per tier) breaks
// the intent (사용자 명시 / DR-design-016 §"3-tier 시각 토큰").
//
// Pure presentational primitive. The host (DesignPage, Phase 3) computes
// rects from the document tree and the InteractionMode / Peek state;
// this component does no math beyond placement and no event handling.

import type { CSSProperties } from "react";

export interface Rect {
  /** Design-plane absolute pixels. Host owns the conversion from
   *  document ratio → host coords. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Optional rotation in radians. Applied via CSS transform around
   *  the rect's center. */
  readonly rotation?: number;
  /** Optional stable identity (typically the source item id). When
   *  provided, used as the React key for sibling rects so reordering
   *  re-keys correctly. Falls back to index when omitted — fine for
   *  static rect lists; pass an `id` once the source data changes
   *  during the layer's lifetime. */
  readonly id?: string;
}

export interface HoverAffordanceLayerProps {
  /** Top-level on/off. When false the entire layer renders nothing.
   *  Host wires this from `useEditAffordancesAllowed()` + a non-null
   *  hovered id. */
  readonly visible: boolean;
  /** The directly-hovered rect. `null` when nothing is hovered (e.g.,
   *  the user just left the canvas but the layer is staying mounted
   *  during a grace window). */
  readonly hovered: Rect | null;
  /** Every other child of the hovered item's parent. Empty when the
   *  hovered item has no siblings. */
  readonly siblings: ReadonlyArray<Rect>;
  /** The hovered item's parent container. `null` when the hovered
   *  item is at the design root (no parent to highlight). */
  readonly parent: Rect | null;
}

const LAYER_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  pointerEvents: "none",
};

function tierStyle(rect: Rect): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
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
  siblings,
  parent,
}: HoverAffordanceLayerProps): React.ReactElement | null {
  if (!visible) return null;
  return (
    <div data-testid="hover-affordance-layer" aria-hidden="true" style={LAYER_STYLE}>
      {parent !== null ? (
        <div
          data-hover-tier="parent"
          style={{
            ...tierStyle(parent),
            outline: "1px solid var(--hover-affordance-stroke-parent)",
            outlineOffset: "0px",
            background: "var(--hover-affordance-tint-parent)",
          }}
        />
      ) : null}
      {siblings.map((rect, i) => (
        <div
          key={rect.id ?? `sibling-${i}-${rect.x}x${rect.y}`}
          data-hover-tier="sibling"
          style={{
            ...tierStyle(rect),
            outline: "1px dashed var(--hover-affordance-stroke-sibling)",
            outlineOffset: "-1px",
          }}
        />
      ))}
      {hovered !== null ? (
        <div
          data-hover-tier="hovered"
          style={{
            ...tierStyle(hovered),
            outline: "2px solid var(--hover-affordance-stroke-hovered)",
            outlineOffset: "0px",
            boxShadow: "0 0 0 4px var(--hover-affordance-glow-hovered)",
          }}
        />
      ) : null}
    </div>
  );
}
