// WI-153 P3 / DR-111 D6 — soft min-overlap clamp math.

import { describe, expect, it } from "vitest";
import { clampAxis, clampFrameToPage } from "./page-clamp.js";

describe("clampAxis (min-overlap with [0,1])", () => {
  it("leaves a fully on-page position untouched", () => {
    expect(clampAxis(0.3, 0.4, 0.05)).toBe(0.3);
    expect(clampAxis(0, 0.4, 0.05)).toBe(0);
    expect(clampAxis(0.6, 0.4, 0.05)).toBe(0.6);
  });

  it("allows bleed but keeps min overlap on the left edge", () => {
    // Item dragged far left: overlap = pos+size must stay ≥ min.
    expect(clampAxis(-0.9, 0.4, 0.05)).toBeCloseTo(0.05 - 0.4); // -0.35
    // Partial bleed within the allowance is untouched.
    expect(clampAxis(-0.2, 0.4, 0.05)).toBe(-0.2);
  });

  it("allows bleed but keeps min overlap on the right edge", () => {
    // Item dragged far right: overlap = 1-pos must stay ≥ min.
    expect(clampAxis(1.7, 0.4, 0.05)).toBeCloseTo(0.95);
    expect(clampAxis(0.9, 0.4, 0.05)).toBe(0.9);
  });

  it("an item smaller than min must stay fully inside", () => {
    // size 0.02 < min 0.05 → effective min = size → pos ∈ [0, 1-size].
    expect(clampAxis(-0.5, 0.02, 0.05)).toBe(0);
    expect(clampAxis(1.5, 0.02, 0.05)).toBeCloseTo(0.98);
  });

  it("a negative/zero min degrades to 'any overlap ≥ 0' without NaN", () => {
    expect(clampAxis(-0.4, 0.4, 0)).toBe(-0.4);
    expect(clampAxis(-0.41, 0.4, 0)).toBeCloseTo(-0.4);
    expect(clampAxis(2, 0.4, -1)).toBe(1);
  });
});

describe("clampFrameToPage", () => {
  it("clamps both axes independently", () => {
    const next = clampFrameToPage(
      { x: -0.9, y: 0.3, width: 0.4, height: 0.2 },
      { minX: 0.05, minY: 0.1 },
    );
    expect(next.x).toBeCloseTo(-0.35);
    expect(next.y).toBe(0.3); // on-page → untouched
  });

  it("keeps a corner-escaping item pinned to min overlap on both axes", () => {
    const next = clampFrameToPage(
      { x: 5, y: -5, width: 0.4, height: 0.2 },
      { minX: 0.05, minY: 0.05 },
    );
    expect(next.x).toBeCloseTo(0.95);
    expect(next.y).toBeCloseTo(0.05 - 0.2);
  });
});
