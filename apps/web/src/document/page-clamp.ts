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

// ---------------------------------------------------------------------------
// WI-159 — multi-select GROUP min-overlap (rigid shared-delta clamp).
//
// A multi-select drag translates every member by the SAME delta. Clamping each
// member individually (clampFrameToPage) deforms the group at page edges:
// members hit their personal clamp limit at different deltas and stop one by
// one while the rest keep moving. The fix clamps the shared DELTA once —
// intersect every member's allowed-delta interval (the delta form of the
// clampAxis position interval) and clamp into the intersection — so the group
// translates rigidly AND every member keeps its own min overlap (DR-111 D5's
// per-item "never lost off-page" invariant is preserved; a union-box clamp
// would let a trailing member end fully off-page, invisible and unclickable).
//
// Pure math; the caller (FrameStage `computeMove`) guarantees every member
// receives identical inputs (same member set, same parent dims, same viewport
// delta), so each member independently computes the identical clamped delta.

export interface RatioBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Per-axis: clamp the shared delta into ∩ᵢ [mᵢ-sizeᵢ-posᵢ, 1-mᵢ-posᵢ].
 *  Each member's own start position is valid (previous drags clamped it), so
 *  the intersection is never empty for valid inputs; if a pre-invalid state
 *  makes it empty, the hi bound wins deterministically (no NaN). */
function clampDeltaAxis(
  members: ReadonlyArray<{ readonly pos: number; readonly size: number }>,
  delta: number,
  min: number,
): number {
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  for (const { pos, size } of members) {
    const m = Math.min(Math.max(min, 0), size);
    lo = Math.max(lo, m - size - pos);
    hi = Math.min(hi, 1 - m - pos);
  }
  return Math.min(Math.max(delta, lo), hi);
}

/** Clamp a shared translation delta (parent-ratio units) so EVERY member box
 *  keeps the spec's min overlap with the page [0,1]×[0,1]. Empty `members`
 *  returns the delta unchanged. */
export function clampSharedDelta(
  members: ReadonlyArray<RatioBox>,
  dx: number,
  dy: number,
  spec: PageClampSpec,
): { dx: number; dy: number } {
  if (members.length === 0) return { dx, dy };
  return {
    dx: clampDeltaAxis(
      members.map((f) => ({ pos: f.x, size: f.width })),
      dx,
      spec.minX,
    ),
    dy: clampDeltaAxis(
      members.map((f) => ({ pos: f.y, size: f.height })),
      dy,
      spec.minY,
    ),
  };
}
