// DR-027 / WI-071 Phase 3 (AUDIT-006 F-1) — pure camera pan-anchor algebra
// extracted from FrameStage. No DOM, no closures — unit-testable.

/** Anchored zoom: given the previous pan/scale and a raw multiplicative factor,
 *  return the next pan/scale so the `anchor` screen point stays fixed.
 *
 *  - Wheel / pinch → pass the cursor's client point as `{ x, y }`.
 *  - Hotkey or zoom button → pass the viewport centre, `{ x: outerW/2, y: outerH/2 }`.
 *
 *  Honours the `[0.1, 8]` scale clamp; the effective factor is re-derived after
 *  the clamp so an anchored zoom that hits the limit does not drift. */
export function nextPanForZoom(
  prev: { tx: number; ty: number; scale: number },
  factor: number,
  anchor: { x: number; y: number; outerW: number; outerH: number },
): { tx: number; ty: number; scale: number } {
  const nextScale = Math.max(0.1, Math.min(8, prev.scale * factor));
  const effective = nextScale / prev.scale;
  if (effective === 1) return prev;
  const { x: px, y: py, outerW: W, outerH: H } = anchor;
  // Outer pan div has `transform-origin: center center`, so a local point lx
  // maps to screen x = tx + W/2 + (lx − W/2) * scale. Solve for tx_new so the
  // same lx still lands at px after the scale change.
  return {
    scale: nextScale,
    tx: px - W / 2 - (px - prev.tx - W / 2) * effective,
    ty: py - H / 2 - (py - prev.ty - H / 2) * effective,
  };
}
