// WI-146 — pure geometry for layout-edit handles (no DOM / React). Resolves grid
// track sizes + inter-track boundary positions so a handle can be drawn ON a
// track line, and maps a pointer projection back to a 0..1 ratio. Kept pure so
// the math is unit-tested independently of the canvas wiring.

import type { TrackSize } from "@agocraft/core";
import { resolveTrackSizes as engineResolveTrackSizes } from "@agocraft/layout";

/**
 * Resolve each track to a 0..1 parent-ratio size, delegating to the SAME
 * algorithm the layout engine renders with (`@agocraft/layout`) so a handle
 * drawn from these sizes sits exactly on the rendered track boundary. `available`
 * is net of padding; an empty list → `[]`.
 */
export function resolveTrackSizes(
  tracks: ReadonlyArray<TrackSize>,
  gap: number,
  available = 1,
): number[] {
  if (tracks.length === 0) return [];
  return [...engineResolveTrackSizes({ tracks, gap, available })];
}

/**
 * The `n-1` inter-track boundary CENTER positions (0..1 ratios from the inner
 * start), each sitting in the middle of the gap between track i and i+1.
 * `sizes` are resolved track sizes (from `resolveTrackSizes`).
 */
export function boundaryOffsets(sizes: ReadonlyArray<number>, gap: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < sizes.length - 1; i++) {
    acc += sizes[i] ?? 0;
    out.push(acc + gap / 2); // centre of the gap
    acc += gap;
  }
  return out;
}

/** Start offset (0..1) of track `index` from the inner start. */
export function trackStartOffset(sizes: ReadonlyArray<number>, gap: number, index: number): number {
  let acc = 0;
  for (let i = 0; i < index && i < sizes.length; i++) acc += (sizes[i] ?? 0) + gap;
  return acc;
}

/** Project a screen pointer onto an axis unit vector relative to an origin, in
 *  design units (divide by zoom). Mirrors the corner-radius handle's
 *  `screen / zoom` mapping so behaviour is identical at any zoom. */
export function projectPointer(
  clientX: number,
  clientY: number,
  origin: { readonly x: number; readonly y: number },
  axis: { readonly x: number; readonly y: number },
  zoom: number,
): number {
  const proj = (clientX - origin.x) * axis.x + (clientY - origin.y) * axis.y;
  return zoom > 0 ? proj / zoom : 0;
}
