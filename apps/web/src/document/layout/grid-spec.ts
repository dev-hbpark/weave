// Grid sizing helpers — pick a column/row count for an auto-grid frame so its
// children each land in their OWN cell (no overlap), and build the matching
// AutoGridSpec. Shared by frame creation (Option+drag) and the
// `weave.frame.setLayout` command so "becomes a grid" behaves the same
// everywhere: a frame that turns into a grid is sized to fit its children.

import { type AutoGridSpec, createAutoGridSpec, trackFr } from "@agocraft/core";

/** Column/row counts for a grid that holds `childCount` items one-per-cell.
 *  Minimum **2×2** (an empty or small grid still reads as a grid); from 4
 *  children up it grows to ⌈√n⌉ columns × ⌈n / cols⌉ rows so every child gets
 *  its own cell. Examples: 0–4 → 2×2, 5–6 → 3×2, 7–9 → 3×3, 10–12 → 4×3. */
export function gridDimsForChildCount(childCount: number): {
  readonly columns: number;
  readonly rows: number;
} {
  const n = Math.max(1, Math.floor(childCount));
  const columns = Math.max(2, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(2, Math.ceil(n / columns));
  return { columns, rows };
}

/** An `AutoGridSpec` sized so `childCount` items each land in their own cell
 *  (min 2×2). `base` carries over gap / justify / align / padding; only the
 *  track arrays are (re)derived. */
export function gridSpecForChildCount(
  childCount: number,
  base?: Partial<AutoGridSpec>,
): AutoGridSpec {
  const { columns, rows } = gridDimsForChildCount(childCount);
  return createAutoGridSpec({
    ...base,
    columns: Array.from({ length: columns }, () => trackFr(1)),
    rows: Array.from({ length: rows }, () => trackFr(1)),
  });
}
