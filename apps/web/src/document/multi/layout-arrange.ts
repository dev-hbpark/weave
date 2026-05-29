// WI-048 — multi-selection "arrange into Flex / Grid", one-shot.
//
// Pure function, mirroring `align-ops.ts`: given the selected items' frames
// (parent 0..1 ratio) and a target layout, return new frames in the same
// space. No container frame is created — the items keep their place in the
// tree and are simply repositioned (the host wires the result through
// `weave.items.resizeMulti`). The SAME function powers the hover preview
// (compute → render ghosts) and the click (compute → apply).
//
// The RUBBER-BAND (the union of the selected items' current outer bounds) is
// PRESERVED EXACTLY: the arranged grid TILES it edge-to-edge — it neither grows
// past the band nor collapses to a strip inside it. Earlier attempts failed at
// both ends: sizing the cell to the largest footprint grew the grid past the
// selection; sizing it to min(bandW/cols, bandH/rows) made a square that
// collapsed a wide flex row to a thin center strip. The band must just be FILLED.
//
// The band is divided into cols × rows equal RECTANGULAR cells
// (cellW = bandW / cols, cellH = bandH / rows). Each item's OUTER bounds (AABB)
// is sized to fill its cell, so equal cells give equal footprints ("반반씩" for
// two), and the union of all cells is exactly the band. An unrotated item's box
// = the cell; a rotated item solves for the raw box whose pixel AABB equals the
// cell. The only impossible case is an exact-45° item in a non-square cell (its
// AABB is always square) — there we fall back to the largest inscribed square.
//
// All math runs in DESIGN PIXELS: rotation is isotropic in pixels (CSS rotates
// the rendered element), not in the non-square 0..1 ratio space, so cells must
// be measured in pixels and converted back. Idempotent for the fillable cases:
// after one arrange the items' AABBs tile the band, so re-running re-derives the
// same band and the same cells.

export type ArrangeLayout = "flex" | "grid";

export interface ArrangeFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Radians around the frame center. Optional — absent = 0. Rotated items
   *  are arranged by their outer (AABB) footprint and sized so that footprint
   *  fills the cell. */
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

/** The raw (unrotated) box whose pixel AABB exactly fills `cellW × cellH` when
 *  rotated by `rot`. The AABB of a w×h box is (w·a + h·b, w·b + h·a) with
 *  a = |cos|, b = |sin|; solving that 2×2 system for w, h gives the fill box.
 *  When a² = b² (an exact 45° item, whose AABB is always square) a non-square
 *  cell is unfillable — fall back to the largest inscribed square AABB. */
function rawBoxFillingCell(
  cellW: number,
  cellH: number,
  rot: number,
): { readonly w: number; readonly h: number } {
  if (rot === 0) return { w: cellW, h: cellH };
  const a = Math.abs(Math.cos(rot));
  const b = Math.abs(Math.sin(rot));
  const det = a * a - b * b; // cos(2·rot)
  if (Math.abs(det) > 1e-6) {
    const w = (cellW * a - cellH * b) / det;
    const h = (cellH * a - cellW * b) / det;
    if (w > 0 && h > 0) return { w, h };
  }
  // Degenerate (≈45°) or negative: largest square whose AABB fits the cell.
  // A square raw box s rotated has AABB s·(a + b); keep that ≤ min(cellW, cellH).
  const s = Math.min(cellW, cellH) / (a + b);
  return { w: s, h: s };
}

/** Compute the arranged frames. Pure: same inputs → same outputs, no doc
 *  lookup, no patches. Caller (host) wires the result into
 *  `weave.items.resizeMulti` (apply) or a ghost overlay (preview).
 *  Same-coordinate-space (one parent) is the caller's invariant.
 *
 *  `designW`/`designH` are the design's absolute pixel size. They matter
 *  because the band is tiled IN PIXELS (what the user sees) and a rotated
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

  // Rubber-band (pixels) = the union of the items' current outer bounds (AABB).
  // This is the region the user sees selected and is the FIXED budget the grid
  // must fit inside.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of px) {
    const ab = pxAabb(p);
    minX = Math.min(minX, p.cx - ab.w / 2);
    minY = Math.min(minY, p.cy - ab.h / 2);
    maxX = Math.max(maxX, p.cx + ab.w / 2);
    maxY = Math.max(maxY, p.cy + ab.h / 2);
  }
  const bandW = maxX - minX;
  const bandH = maxY - minY;
  if (!(bandW > 0) || !(bandH > 0)) {
    return items.map((it) => ({ id: it.id, frame: it.frame }));
  }

  const { cols, rows } =
    layout === "grid" ? gridDims(items.length) : { cols: items.length, rows: 1 };

  // Equal rectangular cells that TILE the band exactly (no gaps, no overflow).
  const cellW = bandW / cols;
  const cellH = bandH / rows;

  return items.map((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellCx = minX + col * cellW + cellW / 2;
    const cellCy = minY + row * cellH + cellH / 2;
    const rot = it.frame.rotation ?? 0;
    // Raw box (pixels) whose rotated AABB fills the cell, then px → ratio.
    const raw = rawBoxFillingCell(cellW, cellH, rot);
    return {
      id: it.id,
      frame: {
        x: (cellCx - raw.w / 2) / W,
        y: (cellCy - raw.h / 2) / H,
        width: raw.w / W,
        height: raw.h / H,
        rotation: rot,
      },
    };
  });
}
