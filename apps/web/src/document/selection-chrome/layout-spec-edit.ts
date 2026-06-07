// WI-146 — pure spec-edit helpers for layout-edit handles (no DOM / React). Each
// returns a NEW spec/policy with one value changed + clamped; the handle's drag
// sink calls these then dispatches weave.frame.setLayout / weave.item.setLayoutChild
// with a mergeKey (one undo). Pure → unit-tested.

import {
  type AutoFlexSpec,
  type AutoGridChildPolicy,
  type AutoGridSpec,
  type TrackSize,
  trackRatio,
} from "@agocraft/core";
import { resolveTrackSizes, trackStartOffset } from "./layout-handle-geometry.js";

/** Max gap as a 0..1 ratio of the main axis — a half-frame gap is already absurd;
 *  the clamp keeps a drag from pushing children off-frame. */
export const MAX_GAP = 0.5;
/** Smallest track size a resize drag may leave (0..1) — keeps a track grabbable. */
export const MIN_TRACK = 0.02;

export function clampGap(gap: number): number {
  if (!Number.isFinite(gap)) return 0;
  return Math.max(0, Math.min(MAX_GAP, gap));
}

/** Set the uniform flex `gap` (0..1 of the main axis), clamped. */
export function setFlexGap(spec: AutoFlexSpec, gap: number): AutoFlexSpec {
  return { ...spec, gap: clampGap(gap) };
}

/**
 * Resize the boundary between track `index` and `index+1` so the boundary's new
 * start-offset is `newBoundaryStart` (0..1 from the inner start). The PAIR's
 * combined size is preserved (only these two tracks change); both become fixed
 * `ratio` tracks (a drag is an explicit-size intent — fr/auto convert to ratio).
 * Other tracks are untouched. Returns the new track array.
 */
export function resizeGridTrackBoundary(
  tracks: ReadonlyArray<TrackSize>,
  gap: number,
  available: number,
  index: number,
  newBoundaryStart: number,
): TrackSize[] {
  const n = tracks.length;
  if (index < 0 || index >= n - 1) return [...tracks];
  const sizes = resolveTrackSizes(tracks, gap, available);
  const a = sizes[index] ?? 0;
  const b = sizes[index + 1] ?? 0;
  const pairStart = trackStartOffset(sizes, gap, index);
  const combined = a + b;
  // newBoundaryStart is where track `index` ends → its new size.
  let newA = newBoundaryStart - pairStart;
  newA = Math.max(MIN_TRACK, Math.min(combined - MIN_TRACK, newA));
  const newB = combined - newA;
  const next = [...tracks];
  next[index] = trackRatio(newA);
  next[index + 1] = trackRatio(newB);
  return next;
}

/** Resize column or row tracks on a grid spec (returns a new spec). */
export function resizeGridAxis(
  spec: AutoGridSpec,
  axis: "column" | "row",
  available: number,
  boundaryIndex: number,
  newBoundaryStart: number,
): AutoGridSpec {
  if (axis === "column") {
    return {
      ...spec,
      columns: resizeGridTrackBoundary(
        spec.columns,
        spec.columnGap,
        available,
        boundaryIndex,
        newBoundaryStart,
      ),
    };
  }
  return {
    ...spec,
    rows: resizeGridTrackBoundary(
      spec.rows,
      spec.rowGap,
      available,
      boundaryIndex,
      newBoundaryStart,
    ),
  };
}

/** Clamp a span to [1, maxFromStart] (maxFromStart = trackCount - startIndex). */
export function clampSpan(span: number, maxFromStart: number): number {
  const s = Math.round(Number.isFinite(span) ? span : 1);
  return Math.max(1, Math.min(Math.max(1, maxFromStart), s));
}

/**
 * Set a grid child's column/row span (cell merge), clamped so the span stays
 * within the track bounds from its current start. `colTracks`/`rowTracks` are the
 * parent's track counts. Pass `undefined` for an axis to leave it unchanged.
 */
export function setGridSpan(
  policy: AutoGridChildPolicy,
  next: { readonly columnSpan?: number; readonly rowSpan?: number },
  colTracks: number,
  rowTracks: number,
): AutoGridChildPolicy {
  const out = { ...policy };
  if (next.columnSpan !== undefined) {
    out.columnSpan = clampSpan(next.columnSpan, colTracks - (policy.column - 1));
  }
  if (next.rowSpan !== undefined) {
    out.rowSpan = clampSpan(next.rowSpan, rowTracks - (policy.row - 1));
  }
  return out;
}
