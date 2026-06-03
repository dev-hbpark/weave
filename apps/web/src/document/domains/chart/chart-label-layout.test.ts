// WI-078 Phase B — weave-computed category label layout.

import { describe, expect, it } from "vitest";
import { CHART_PLOT_MARGINS, categoryLabels, pieLabelLayout } from "./chart-label-layout.js";

const M = CHART_PLOT_MARGINS;
const PLOT_W = 1 - M.left - M.right;
const Y = 1 - M.bottom * 0.45;

describe("categoryLabels", () => {
  it("bar: one label per category, band-centered, in the bottom inset", () => {
    const out = categoryLabels("bar", ["A", "B", "C", "D"]);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ key: "A", text: "A", rowIndex: 0 });
    expect(out[0]?.xRatio).toBeCloseTo(M.left + (0.5 / 4) * PLOT_W, 5);
    expect(out[3]?.xRatio).toBeCloseTo(M.left + (3.5 / 4) * PLOT_W, 5);
    expect(out[0]?.yRatio).toBeCloseTo(Y, 5);
  });

  it("line: labels sit at the points (i/(N-1)), spanning the plot width", () => {
    const out = categoryLabels("line", ["A", "B", "C", "D"]);
    expect(out[0]?.xRatio).toBeCloseTo(M.left, 5);
    expect(out[3]?.xRatio).toBeCloseTo(M.left + PLOT_W, 5);
  });

  it("line with a single category → centered", () => {
    expect(categoryLabels("line", ["X"])[0]?.xRatio).toBeCloseTo(M.left + 0.5 * PLOT_W, 5);
  });

  it("pie / empty → no labels", () => {
    expect(categoryLabels("pie", ["A", "B"])).toEqual([]);
    expect(categoryLabels("bar", [])).toEqual([]);
  });

  it("rowIndex tracks position (for dataset sync)", () => {
    const out = categoryLabels("bar", ["A", "B", "C"]);
    expect(out.map((l) => l.rowIndex)).toEqual([0, 1, 2]);
  });
});

describe("pieLabelLayout", () => {
  const FRAC = 0.42; // mirrors PIE_LABEL_FRAC

  it("square (aspect 1): equal halves → A right, B left, both at mid-height", () => {
    // A frac 0.5 → mid 0.25 turn → 0° (right); B mid 0.75 turn → 180° (left).
    const out = pieLabelLayout(["A", "B"], [1, 1], 1);
    expect(out).toHaveLength(2);
    expect(out[0]?.xRatio).toBeCloseTo(0.5 + FRAC, 5);
    expect(out[0]?.yRatio).toBeCloseTo(0.5, 5);
    expect(out[1]?.xRatio).toBeCloseTo(0.5 - FRAC, 5);
    expect(out[1]?.yRatio).toBeCloseTo(0.5, 5);
    expect(out.map((l) => l.rowIndex)).toEqual([0, 1]);
  });

  it("landscape (aspect 2): x offset is compressed by 1/aspect, y is not", () => {
    const out = pieLabelLayout(["A", "B"], [1, 1], 2);
    expect(out[0]?.xRatio).toBeCloseTo(0.5 + FRAC / 2, 5); // right slice
    expect(out[0]?.yRatio).toBeCloseTo(0.5, 5);
  });

  it("portrait (aspect 0.5): y offset is compressed by aspect, x is not", () => {
    // Top slice ([1] single, mid 0.5 turn → 90° down). Use two to get a side.
    const out = pieLabelLayout(["A", "B"], [1, 1], 0.5);
    expect(out[0]?.xRatio).toBeCloseTo(0.5 + FRAC, 5); // x not compressed
    expect(out[0]?.yRatio).toBeCloseTo(0.5, 5);
  });

  it("weights the angle by value (bigger slice pushes the next label round)", () => {
    // A = 3/4 → mid 0.375 turn → 45° (lower-right); B = 1/4 → mid 0.875 → 225° (upper-left).
    const out = pieLabelLayout(["A", "B"], [3, 1], 1);
    expect(out[0]?.yRatio).toBeGreaterThan(0.5); // A below center
    expect(out[1]?.yRatio).toBeLessThan(0.5); // B above center
  });

  it("zero total / bad aspect → no labels", () => {
    expect(pieLabelLayout(["A"], [0], 1)).toEqual([]);
    expect(pieLabelLayout(["A"], [1], 0)).toEqual([]);
    expect(pieLabelLayout(["A"], [1], Number.NaN)).toEqual([]);
  });
});
