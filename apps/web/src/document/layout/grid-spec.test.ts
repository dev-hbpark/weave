import { describe, expect, it } from "vitest";
import { gridDimsForChildCount, gridSpecForChildCount } from "./grid-spec.js";

describe("gridDimsForChildCount", () => {
  it("is at least 2×2 for 0–4 children (small grids still read as a grid)", () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(gridDimsForChildCount(n)).toEqual({ columns: 2, rows: 2 });
    }
  });

  it("grows to fit one child per cell above 4", () => {
    expect(gridDimsForChildCount(5)).toEqual({ columns: 3, rows: 2 }); // 6 cells
    expect(gridDimsForChildCount(6)).toEqual({ columns: 3, rows: 2 });
    expect(gridDimsForChildCount(7)).toEqual({ columns: 3, rows: 3 }); // 9 cells
    expect(gridDimsForChildCount(9)).toEqual({ columns: 3, rows: 3 });
    expect(gridDimsForChildCount(10)).toEqual({ columns: 4, rows: 3 }); // 12 cells
    expect(gridDimsForChildCount(12)).toEqual({ columns: 4, rows: 3 });
  });

  it("always has enough cells for every child", () => {
    for (let n = 0; n <= 50; n += 1) {
      const { columns, rows } = gridDimsForChildCount(n);
      expect(columns * rows).toBeGreaterThanOrEqual(Math.max(1, n));
    }
  });

  it("treats negative / fractional counts as ≥1 (min 2×2)", () => {
    expect(gridDimsForChildCount(-3)).toEqual({ columns: 2, rows: 2 });
    expect(gridDimsForChildCount(2.7)).toEqual({ columns: 2, rows: 2 });
  });
});

describe("gridSpecForChildCount", () => {
  it("builds an auto-grid spec with the computed track counts", () => {
    const spec = gridSpecForChildCount(6);
    expect(spec.kind).toBe("auto-grid");
    expect(spec.columns).toHaveLength(3);
    expect(spec.rows).toHaveLength(2);
  });

  it("carries over gap / justify / align from the base spec", () => {
    const spec = gridSpecForChildCount(0, {
      columnGap: 0.02,
      rowGap: 0.03,
      justify: "center",
      align: "start",
    });
    expect(spec.columnGap).toBe(0.02);
    expect(spec.rowGap).toBe(0.03);
    expect(spec.justify).toBe("center");
    expect(spec.align).toBe("start");
    // ...but the tracks are (re)derived to 2×2.
    expect(spec.columns).toHaveLength(2);
    expect(spec.rows).toHaveLength(2);
  });
});
