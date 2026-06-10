// WI-153 P3 / DR-111 D6 — soft min-overlap clamp for page-bounded editing.
//
// Page-bounded formats (slide-deck / doc-page) must never let an item be dragged
// fully off its page and lost (the page clips at its edge — D5 — so an off-page
// item is invisible AND unclickable). The clamp is SOFT: bleed stays allowed, the
// item may hang past the edge, but at least `minOverlap` of it (per axis, in
// parent-ratio units) must remain inside the page box [0,1]×[0,1].
//
// Pure math — the caller (FrameStage's `computeMove`) decides WHEN it applies
// (page-bounded format + direct child of the active page + rotation 0; rotated
// boxes are skipped per DR-111 "비회전 우선").

export interface PageClampSpec {
  /** Minimum on-page overlap along X, as a ratio of the parent width (0..1). */
  readonly minX: number;
  /** Minimum on-page overlap along Y, as a ratio of the parent height (0..1). */
  readonly minY: number;
}

/** Clamp a parent-ratio position so the [pos, pos+size] interval keeps at least
 *  `min` overlap with [0,1]. An item smaller than `min` must sit fully inside
 *  (effective min = its own size). */
export function clampAxis(pos: number, size: number, min: number): number {
  const m = Math.min(Math.max(min, 0), size);
  // Overlap with [0,1] = min(pos+size, 1) - max(pos, 0) ≥ m  ⇔  m-size ≤ pos ≤ 1-m.
  return Math.min(Math.max(pos, m - size), 1 - m);
}

/** Apply the per-axis soft clamp to an item frame's x/y (parent-ratio units). */
export function clampFrameToPage(
  frame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  spec: PageClampSpec,
): { x: number; y: number } {
  return {
    x: clampAxis(frame.x, frame.width, spec.minX),
    y: clampAxis(frame.y, frame.height, spec.minY),
  };
}
