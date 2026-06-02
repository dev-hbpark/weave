// WI-074 / DR-029 — crop window geometry unit tests. Focus: setStraighten now
// allows a full 360° (normalized into (-π, π]); resize/pan stay clamped to the
// frame box.

import { describe, expect, it } from "vitest";
import {
  MIN_CROP_WINDOW,
  panCropWindow,
  resizeCropWindow,
  setStraighten,
} from "./crop-geometry.js";
import type { CropDraft } from "./interactions/cropping-state.js";

const base: CropDraft = { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0 };
const deg = (d: number): number => (d * Math.PI) / 180;
const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

describe("setStraighten — full 360°", () => {
  it("keeps angles within (-π, π] as-is", () => {
    for (const d of [0, 10, 45, 90, 135, 179, 180]) {
      expect(setStraighten(base, deg(d)).rotation).toBeCloseTo(deg(d), 9);
    }
    expect(setStraighten(base, deg(-90)).rotation).toBeCloseTo(deg(-90), 9);
  });

  it("does NOT clamp beyond 45° (regression: was ±45°)", () => {
    expect(setStraighten(base, deg(90)).rotation).toBeCloseTo(deg(90), 9);
    expect(setStraighten(base, deg(170)).rotation).toBeCloseTo(deg(170), 9);
  });

  it("wraps angles past ±180° into the equivalent (-π, π] value", () => {
    // 200° → -160°
    expect(setStraighten(base, deg(200)).rotation).toBeCloseTo(deg(-160), 9);
    // 360° → 0
    expect(close(setStraighten(base, deg(360)).rotation, 0)).toBe(true);
    // 370° → 10°
    expect(setStraighten(base, deg(370)).rotation).toBeCloseTo(deg(10), 9);
    // -200° → 160°
    expect(setStraighten(base, deg(-200)).rotation).toBeCloseTo(deg(160), 9);
  });

  it("guards non-finite input to 0", () => {
    expect(setStraighten(base, Number.NaN).rotation).toBe(0);
    expect(setStraighten(base, Number.POSITIVE_INFINITY).rotation).toBe(0);
  });

  it("preserves the window (only rotation changes)", () => {
    const r = setStraighten(base, deg(123));
    expect({ x: r.x, y: r.y, w: r.w, h: r.h }).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  });
});

describe("resizeCropWindow / panCropWindow stay clamped", () => {
  it("se resize shrinks toward the SE corner, never below MIN", () => {
    const r = resizeCropWindow(base, "se", -0.9, -0.9);
    expect(r.w).toBeGreaterThanOrEqual(MIN_CROP_WINDOW - 1e-9);
    expect(r.h).toBeGreaterThanOrEqual(MIN_CROP_WINDOW - 1e-9);
  });

  it("pan keeps the window inside [0, 1-w]×[0, 1-h]", () => {
    const r = panCropWindow(base, 5, 5);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThanOrEqual(1 - r.w + 1e-9);
    expect(r.y).toBeLessThanOrEqual(1 - r.h + 1e-9);
  });
});
