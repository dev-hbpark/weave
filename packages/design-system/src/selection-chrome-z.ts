// Selection-chrome stacking contract — the SINGLE source of truth for the
// z-index of every selection/hover handle.
//
// Why this exists: handle z-indexes used to be inline magic numbers scattered
// across SelectionLayer, HoverAffordanceLayer, LayoutEditHandles and
// corner-radius-handle. They drifted apart and a POINT handle (a draggable dot
// — resize/rotate, gap grip, corner-radius) kept ending up BEHIND a LINE handle
// (a draggable stroke — padding edge, grid track/gap line) that crossed it, so
// the dot could not be clicked. (DR-design-033, repeated user reports.)
//
// The contract, by handle FAMILY:
//
//   hoverAffordance  <  lineHandle  <  marquee  <  pointHandle  <  (overlays)
//
//   • LINE handles  (strokes)  paint BELOW point handles, always.
//   • POINT handles (dots)     paint on top of every line + the ring, so a grip
//                              is never occluded by a line crossing it.
//   • Floating overlays (toolbar/menu/Aku/tooltip, 46+) always paint above ALL
//     selection chrome — see their own components; listed here only as the ceiling.
//
// Adding a new selection handle? Pick the family below — never invent a new
// inline z-index. A stroke you drag → `lineHandle`. A dot you drag → `pointHandle`.
export const SelectionChromeZ = {
  /** Hover-affordance outlines (hovered / descendant / parent). Below ALL
   *  selection chrome so a selection always paints over hover hints. */
  hoverAffordance: 35,
  /** LINE-type handles — draggable strokes: padding edges, grid track / gap
   *  boundary lines. Below every point handle. */
  lineHandle: 40,
  /** Multi-select marquee box. Sits between the two handle families. */
  marquee: 42,
  /** POINT-type handles — draggable dots: resize + rotate handles, the
   *  selection ring they belong to, grid gap grips, corner-radius grips. The
   *  top-most selection chrome; still below the floating overlays (46+). */
  pointHandle: 43,
} as const;

export type SelectionChromeLayer = keyof typeof SelectionChromeZ;
