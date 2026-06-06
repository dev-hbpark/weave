// 아쿠 roaming — pure geometry (WI-107 / WI-106).
//
// The single launcher Aku wanders the screen: random viewport points when idle,
// and to the edited frame's on-screen rect while the agent works. Pure (rng +
// dims injected) → unit-testable; the hook supplies Math.random + the live
// viewport + getBoundingClientRect.

export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface RoamPoint {
  readonly x: number;
  readonly y: number;
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo; // viewport smaller than the box → pin to margin
  return Math.max(lo, Math.min(hi, v));
}

/** A random point inside `rect` (rng → 0..1), centered to a `boxW`×`boxH` mascot
 *  box and clamped to the viewport. Used while the agent edits a frame. */
export function roamPointInRect(
  rect: ScreenRect,
  boxW: number,
  boxH: number,
  viewportW: number,
  viewportH: number,
  rng: () => number,
  margin = 4,
): RoamPoint {
  const cx = rect.left + rng() * rect.width;
  const cy = rect.top + rng() * rect.height;
  return {
    x: clamp(cx - boxW / 2, margin, viewportW - boxW - margin),
    y: clamp(cy - boxH / 2, margin, viewportH - boxH - margin),
  };
}

/** A random point anywhere in the viewport (idle wandering). Two rng draws. */
export function randomViewportPoint(
  boxW: number,
  boxH: number,
  viewportW: number,
  viewportH: number,
  rng: () => number,
  margin = 16,
): RoamPoint {
  const maxX = viewportW - boxW - margin;
  const maxY = viewportH - boxH - margin;
  return {
    x: clamp(margin + rng() * (maxX - margin), margin, maxX),
    y: clamp(margin + rng() * (maxY - margin), margin, maxY),
  };
}

/** Travel sprite direction from the horizontal delta (ties → right). */
export function travelDir(prevX: number | null, nextX: number): "left" | "right" {
  if (prevX === null) return "right";
  return nextX < prevX ? "left" : "right";
}
