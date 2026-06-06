// WI-107 — roaming geometry.

import { describe, expect, it } from "vitest";
import { randomViewportPoint, roamPointInRect, type ScreenRect, travelDir } from "./roam-target.js";

const BW = 60;
const BH = 120;
const VW = 1000;
const VH = 800;

describe("roamPointInRect", () => {
  it("centers the box on a random point inside the rect", () => {
    const rect: ScreenRect = { left: 400, top: 300, width: 200, height: 100 };
    const p = roamPointInRect(rect, BW, BH, VW, VH, () => 0.5);
    expect(p.x).toBe(500 - BW / 2);
    expect(p.y).toBe(350 - BH / 2);
  });

  it("clamps to the viewport so the box never clips off-screen", () => {
    const rect: ScreenRect = { left: 980, top: 780, width: 40, height: 40 };
    const p = roamPointInRect(rect, BW, BH, VW, VH, () => 1);
    expect(p.x).toBeLessThanOrEqual(VW - BW - 4);
    expect(p.y).toBeLessThanOrEqual(VH - BH - 4);
    expect(p.x).toBeGreaterThanOrEqual(4);
    expect(p.y).toBeGreaterThanOrEqual(4);
  });
});

describe("randomViewportPoint", () => {
  it("stays within the viewport margins for any rng", () => {
    for (const r of [0, 0.5, 1]) {
      const p = randomViewportPoint(BW, BH, VW, VH, () => r);
      expect(p.x).toBeGreaterThanOrEqual(16);
      expect(p.y).toBeGreaterThanOrEqual(16);
      expect(p.x).toBeLessThanOrEqual(VW - BW - 16);
      expect(p.y).toBeLessThanOrEqual(VH - BH - 16);
    }
  });

  it("spans the range (rng 0 → near margin, rng 1 → near far edge)", () => {
    const lo = randomViewportPoint(BW, BH, VW, VH, () => 0);
    const hi = randomViewportPoint(BW, BH, VW, VH, () => 1);
    expect(lo.x).toBe(16);
    expect(hi.x).toBe(VW - BW - 16);
  });

  it("pins to margin when the viewport is smaller than the box", () => {
    const p = randomViewportPoint(BW, BH, 40, 40, () => 0.5);
    expect(p.x).toBe(16);
    expect(p.y).toBe(16);
  });
});

describe("travelDir", () => {
  it("defaults to right on first move", () => {
    expect(travelDir(null, 123)).toBe("right");
  });
  it("faces the direction of horizontal travel (ties → right)", () => {
    expect(travelDir(500, 200)).toBe("left");
    expect(travelDir(200, 500)).toBe("right");
    expect(travelDir(300, 300)).toBe("right");
  });
});
