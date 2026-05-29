// WI-048 — multi-selection "arrange into Flex / Grid", one-shot.
//
// Pure function, mirroring `align-ops.ts`: given the selected items' frames
// (parent 0..1 ratio) and a target layout, return new frames in the same
// space. No container frame is created — the items keep their place in the
// tree and are simply repositioned (the host wires the result through
// `weave.items.resizeMulti`). The SAME function powers the hover preview
// (compute → render ghosts) and the click (compute → apply).
//
// Uniform SQUARE cells. Each item is placed into an equal square cell sized to
// the LARGEST item footprint (a rotated item's footprint is its axis-aligned
// outer bounds / AABB; an unrotated item's is its box). Every item then FILLS
// its cell — the rotated item's AABB and the unrotated item's box become the
// same square, so they tile the grid edge-to-edge and occupy equal halves.
//
// Why square cells (not the bbox-proportional tracks we used before): a
// rotated item's AABB can only fill a SQUARE cell (a 45° item's AABB is always
// square). Proportional/non-square cells leave the rotated item smaller than
// its cell, and — because the next arrange re-measures the now-smaller AABB —
// repeated presses progressively shrink it. Square cells sized to the footprint
// make each item exactly fill its cell, so re-running the arrange is a no-op
// (idempotent: no progressive growth or shrink).

export type ArrangeLayout = "flex" | "grid";

export interface ArrangeFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Radians around the frame center. Optional — absent = 0. Rotated items
   *  are arranged by their outer (AABB) footprint and sized so that footprint
   *  fills the square cell. */
  readonly rotation?: number;
}

export interface ArrangeInput {
  readonly id: string;
  readonly frame: ArrangeFrame;
}

export interface ArrangeOutput {
  readonly id: string;
  readonly frame: ArrangeFrame;
}

/** Near-square grid dimensions for `count` items: cols = ceil(√n), so 4 → 2×2,
 *  6 → 3×2, 9 → 3×3. Flex collapses to a single row (cols = n). */
function gridDims(count: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows };
}

/** Item geometry resolved to DESIGN PIXELS. Rotation is isotropic in pixels
 *  (CSS rotates the rendered element), NOT in the non-square 0..1 ratio space,
 *  so all AABB / square-cell math must run in pixels and convert back. */
interface PxItem {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly rot: number;
}

function pxAabb(p: PxItem): { readonly w: number; readonly h: number } {
  if (p.rot === 0) return { w: p.w, h: p.h };
  const c = Math.abs(Math.cos(p.rot));
  const s = Math.abs(Math.sin(p.rot));
  return { w: p.w * c + p.h * s, h: p.w * s + p.h * c };
}

/** Compute the arranged frames. Pure: same inputs → same outputs, no doc
 *  lookup, no patches. Caller (host) wires the result into
 *  `weave.items.resizeMulti` (apply) or a ghost overlay (preview).
 *  Same-coordinate-space (one parent) is the caller's invariant.
 *
 *  `designW`/`designH` are the design's absolute pixel size. They matter
 *  because cells are square IN PIXELS (what the user sees) and a rotated
 *  item's outer bounds are an isotropic-in-pixels rotation — using the raw
 *  ratio space would make the cells render as the design's aspect rectangle
 *  and the rotated item's bounds would not match. Default 1×1 (square). */
export function computeArrangedFrames(
  items: ReadonlyArray<ArrangeInput>,
  layout: ArrangeLayout,
  designW = 1,
  designH = 1,
): ReadonlyArray<ArrangeOutput> {
  if (items.length < 2) return items.map((it) => ({ id: it.id, frame: it.frame }));
  const W = designW > 0 ? designW : 1;
  const H = designH > 0 ? designH : 1;

  const px: PxItem[] = items.map((it) => ({
    cx: (it.frame.x + it.frame.width / 2) * W,
    cy: (it.frame.y + it.frame.height / 2) * H,
    w: it.frame.width * W,
    h: it.frame.height * H,
    rot: it.frame.rotation ?? 0,
  }));

  // Square cell (pixels) = the largest footprint dimension, so the biggest item
  // fills its cell exactly and smaller items grow to match (never shrink — the
  // cause of the "shrinks on every press" bug).
  let cell = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of px) {
    const ab = pxAabb(p);
    cell = Math.max(cell, ab.w, ab.h);
    minX = Math.min(minX, p.cx - ab.w / 2);
    minY = Math.min(minY, p.cy - ab.h / 2);
    maxX = Math.max(maxX, p.cx + ab.w / 2);
    maxY = Math.max(maxY, p.cy + ab.h / 2);
  }
  if (cell <= 0) return items.map((it) => ({ id: it.id, frame: it.frame }));

  const { cols, rows } =
    layout === "grid" ? gridDims(items.length) : { cols: items.length, rows: 1 };

  // Center the grid on the selection's current center (keeps it in place).
  const originX = (minX + maxX) / 2 - (cols * cell) / 2;
  const originY = (minY + maxY) / 2 - (rows * cell) / 2;

  return items.map((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellCx = originX + col * cell + cell / 2;
    const cellCy = originY + row * cell + cell / 2;
    const rot = it.frame.rotation ?? 0;
    // Raw box (pixels) that fills the square cell: unrotated → the cell itself;
    // rotated → the square whose pixel AABB equals the cell (AABB =
    // raw·(|cos|+|sin|), so raw = cell / (|cos|+|sin|)). Convert px → ratio.
    let rawPx = cell;
    if (rot !== 0) {
      const c = Math.abs(Math.cos(rot));
      const s = Math.abs(Math.sin(rot));
      rawPx = cell / (c + s);
    }
    return {
      id: it.id,
      frame: {
        x: (cellCx - rawPx / 2) / W,
        y: (cellCy - rawPx / 2) / H,
        width: rawPx / W,
        height: rawPx / H,
        rotation: rot,
      },
    };
  });
}
