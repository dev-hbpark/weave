// Shared hover-handle hysteresis geometry.
//
// Handles (frame resize corners, the rotate knob, chart datum handles…)
// are drawn OUTSIDE the thing they belong to, so travelling from the body
// /mark to a handle crosses a few pixels of bare canvas. Without
// hysteresis the hover target switches the instant the pointer leaves the
// body, the handle unmounts, and it can never be clicked (user report
// 2026-06-14). Both the general selection-hover tracker
// (`use-hover-context`) and the chart hover store (`echarts-renderer`)
// keep the current target while the pointer is still within reach of its
// handles, using the pure test below. This is a leaf module (no React, no
// DOM side effects) so either consumer can depend on it.

/** Pixels a handle rect is grown by on every side before the pointer is
 *  considered "out of reach". Large enough to bridge the body↔handle gap
 *  — the rotate knob sits ~24px above the top edge, chart handles a
 *  similar distance off the mark. */
export const HANDLE_AFFORDANCE_MARGIN_PX = 24;

/** Pure point-in-grown-rects test. `(x, y)` (viewport/client coords)
 *  counts as "within reach" when it falls inside ANY rect expanded by
 *  `margin` on every side. */
export function pointerWithinRects(
  x: number,
  y: number,
  rects: ReadonlyArray<DOMRectReadOnly>,
  margin: number = HANDLE_AFFORDANCE_MARGIN_PX,
): boolean {
  for (const r of rects) {
    if (x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin)
      return true;
  }
  return false;
}
