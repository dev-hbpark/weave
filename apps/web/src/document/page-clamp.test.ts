// WI-153 P3 / DR-111 D6 — soft min-overlap clamp math.

import { describe, expect, it } from "vitest";
import { clampAxis, clampFrameToPage, clampSharedDelta, rotatedAabb } from "./page-clamp.js";

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

// WI-159 — group (multi-select) min-overlap: rigid shared-delta clamp.

describe("clampSharedDelta", () => {
  const spec = { minX: 0.05, minY: 0.05 };
  const a = { x: 0.1, y: 0.4, width: 0.2, height: 0.2 };
  const b = { x: 0.6, y: 0.4, width: 0.2, height: 0.2 };

  it("passes an in-page delta through untouched", () => {
    const d = clampSharedDelta([a, b], 0.1, 0.05, spec);
    expect(d.dx).toBeCloseTo(0.1);
    expect(d.dy).toBeCloseTo(0.05);
  });

  it("an empty member set never clamps", () => {
    expect(clampSharedDelta([], -5, 5, spec)).toEqual({ dx: -5, dy: 5 });
  });

  it("the most restrictive member binds: leftward drag stops at the LEFTMOST member's limit", () => {
    // a may go down to minX - width - a.x = 0.05-0.2-0.1 = -0.25;
    // b down to 0.05-0.2-0.6 = -0.75. Intersection lower bound = -0.25.
    const d = clampSharedDelta([a, b], -2, 0, spec);
    expect(d.dx).toBeCloseTo(-0.25);
    expect(d.dy).toBe(0);
    // EVERY member keeps min overlap (D5 per-item invariant)...
    expect(a.x + d.dx + a.width).toBeCloseTo(spec.minX); // a pinned at its own limit
    expect(b.x + d.dx + b.width).toBeGreaterThan(spec.minX);
    // ...and the translation is rigid (same delta → gap invariant).
    expect(b.x + d.dx - (a.x + d.dx)).toBeCloseTo(b.x - a.x);
  });

  it("rightward drag stops at the RIGHTMOST member's limit", () => {
    // b may go up to 1 - minX - b.x = 0.95-0.6 = 0.35; a up to 0.85.
    const d = clampSharedDelta([a, b], 2, 0, spec);
    expect(d.dx).toBeCloseTo(0.35);
  });

  it("clamps both axes independently", () => {
    const d = clampSharedDelta([a, b], -2, 2, spec);
    expect(d.dx).toBeCloseTo(-0.25);
    // y: both at 0.4, height 0.2 → up to 1-0.05-0.4 = 0.55.
    expect(d.dy).toBeCloseTo(0.55);
  });

  it("a member smaller than min must stay fully inside (effective min = its size)", () => {
    const tiny = { x: 0.5, y: 0.5, width: 0.02, height: 0.02 };
    const d = clampSharedDelta([a, tiny], -2, 0, spec);
    // tiny: m = size → lower delta bound = 0 - 0.5 = -0.5; a's bound = -0.25 binds.
    expect(d.dx).toBeCloseTo(-0.25);
    const dRight = clampSharedDelta([a, tiny], 2, 0, spec);
    // tiny: upper = 1 - 0.02 - 0.5 = 0.48; a's = 0.85 → tiny binds.
    expect(dRight.dx).toBeCloseTo(0.48);
  });
});

// WI-160 — rotated visual AABB (회전 박스 경계 정합).

describe("rotatedAabb", () => {
  const f = { x: 0.1, y: 0.4, width: 0.2, height: 0.2 };

  it("rotation 0 / unset returns the frame box unchanged", () => {
    expect(rotatedAabb({ ...f, rotation: 0 }, 16 / 9)).toEqual(f);
    expect(rotatedAabb(f, 16 / 9)).toEqual(f);
  });

  it("π (180°) is the identity up to float noise", () => {
    const r = rotatedAabb({ ...f, rotation: Math.PI }, 16 / 9);
    expect(r.x).toBeCloseTo(f.x);
    expect(r.y).toBeCloseTo(f.y);
    expect(r.width).toBeCloseTo(f.width);
    expect(r.height).toBeCloseTo(f.height);
  });

  it("90° swaps the pixel dims — ratio dims scale by the parent aspect", () => {
    // Parent 1920×1080 (aspect 16/9): 0.2×0.2 ratio = 384×216 px; rotated 90°
    // the AABB is 216×384 px → ratio 216/1920 = 0.1125 × 384/1080 ≈ 0.3556.
    const aspect = 1920 / 1080;
    const r = rotatedAabb({ ...f, rotation: Math.PI / 2 }, aspect);
    expect(r.width).toBeCloseTo(f.height / aspect); // 0.1125
    expect(r.height).toBeCloseTo(f.width * aspect); // 0.35556
    // Center preserved.
    expect(r.x + r.width / 2).toBeCloseTo(f.x + f.width / 2);
    expect(r.y + r.height / 2).toBeCloseTo(f.y + f.height / 2);
  });

  it("45° on a square parent grows a square by √2, center preserved", () => {
    const r = rotatedAabb({ ...f, rotation: Math.PI / 4 }, 1);
    expect(r.width).toBeCloseTo(0.2 * Math.SQRT2);
    expect(r.height).toBeCloseTo(0.2 * Math.SQRT2);
    expect(r.x + r.width / 2).toBeCloseTo(0.2);
    expect(r.y + r.height / 2).toBeCloseTo(0.5);
  });

  it("negative angle gives the same AABB (|cos|/|sin| symmetry)", () => {
    const pos = rotatedAabb({ ...f, rotation: 0.7 }, 16 / 9);
    const neg = rotatedAabb({ ...f, rotation: -0.7 }, 16 / 9);
    expect(neg.x).toBeCloseTo(pos.x);
    expect(neg.y).toBeCloseTo(pos.y);
    expect(neg.width).toBeCloseTo(pos.width);
    expect(neg.height).toBeCloseTo(pos.height);
  });

  it("non-positive aspect falls back to 1 (no NaN/Infinity)", () => {
    const r = rotatedAabb({ ...f, rotation: Math.PI / 2 }, 0);
    expect(r.width).toBeCloseTo(f.height);
    expect(r.height).toBeCloseTo(f.width);
  });

  it("feeds clampSharedDelta: a 90°-rotated member constrains by its AABB", () => {
    // 0.3-wide × 0.1-tall at 90° on a square parent → AABB 0.1×0.3, x shifts
    // to center-±0.05: aabb.x = 0.5+0.15-0.05 = 0.6.
    const rot = { x: 0.5, y: 0.5, width: 0.3, height: 0.1, rotation: Math.PI / 2 };
    const aabb = rotatedAabb(rot, 1);
    expect(aabb.x).toBeCloseTo(0.6);
    expect(aabb.width).toBeCloseTo(0.1);
    const d = clampSharedDelta([aabb], -2, 0, { minX: 0.05, minY: 0.05 });
    // lower bound = minX - aabbW - aabb.x = 0.05 - 0.1 - 0.6 = -0.65.
    expect(d.dx).toBeCloseTo(-0.65);
  });
});
