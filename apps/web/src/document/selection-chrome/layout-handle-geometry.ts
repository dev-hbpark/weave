// WI-146 — pure geometry for layout-edit handles (no DOM / React). Resolves grid
// track sizes + inter-track boundary positions so a handle can be drawn ON a
// track line, and maps a pointer projection back to a 0..1 ratio. Kept pure so
// the math is unit-tested independently of the canvas wiring.

import type { TrackSize } from "@agocraft/core";

/** A track's effective fr weight when it has no fixed ratio: `fr` uses its value,
 *  `auto` behaves as `fr:1`, `minmax` uses its `fr` max (else 1). `ratio` = 0
 *  (it is fixed, not a share). */
function frWeight(t: TrackSize): number {
  if (t.kind === "fr") return Math.max(0, t.value);
  if (t.kind === "auto") return 1;
  if (t.kind === "minmax") return t.max.kind === "fr" ? Math.max(0, t.max.value) : 1;
  return 0; // ratio
}

/** A track's fixed ratio size if it is `ratio` (or `minmax` whose min is a
 *  ratio floor), else null (it is a flexible share). */
function fixedRatio(t: TrackSize): number | null {
  if (t.kind === "ratio") return Math.max(0, t.value);
  return null;
}

/**
 * Resolve each track to a 0..1 ratio of the available main-axis extent
 * (CSS-grid-ish): fixed `ratio` tracks take their value; the remainder (after
 * fixed tracks + gaps) is shared among the flexible tracks by fr weight.
 * `available` and `gap` are 0..1 ratios of the same axis. Always returns one
 * size per track (≥ 0); an empty list → `[]`.
 */
export function resolveTrackSizes(
  tracks: ReadonlyArray<TrackSize>,
  gap: number,
  available = 1,
): number[] {
  const n = tracks.length;
  if (n === 0) return [];
  const gaps = Math.max(0, n - 1) * Math.max(0, gap);
  const fixedTotal = tracks.reduce((s, t) => s + (fixedRatio(t) ?? 0), 0);
  const frTotal = tracks.reduce((s, t) => s + frWeight(t), 0);
  const free = Math.max(0, available - gaps - fixedTotal);
  return tracks.map((t) => {
    const fixed = fixedRatio(t);
    if (fixed !== null) return fixed;
    return frTotal > 0 ? (frWeight(t) / frTotal) * free : 0;
  });
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
