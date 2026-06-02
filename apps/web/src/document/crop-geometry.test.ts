// WI-074 / DR-029 — crop window geometry unit tests. Focus: setStraighten now
// allows a full 360° (normalized into (-π, π]); resize/pan stay clamped to the
// frame box.

import { describe, expect, it } from "vitest";
import {
  coverZoom,
  MIN_CROP_WINDOW,
  panCropOffset,
  panCropWindow,
  resizeCropWindow,
  setStraighten,
} from "./crop-geometry.js";
import type { CropDraft } from "./interactions/cropping-state.js";

const base: CropDraft = { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0, ox: 0, oy: 0 };
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

  it("pan (θ=0) keeps the window inside [0, 1-w]×[0, 1-h]", () => {
    const r = panCropWindow(base, 5, 5);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThanOrEqual(1 - r.w + 1e-9);
    expect(r.y).toBeLessThanOrEqual(1 - r.h + 1e-9);
  });
});

describe("panCropWindow — window stays in source [0,1] (D11)", () => {
  const sq: CropDraft = { x: 0.25, y: 0.25, w: 0.5, h: 0.5, rotation: 0, ox: 0, oy: 0 };

  it("clamps to [0, 1-w] / [0, 1-h]", () => {
    expect(panCropWindow(sq, -10, 0).x).toBeCloseTo(0.5, 6); // 1-w
    expect(panCropWindow(sq, 10, 0).x).toBeCloseTo(0, 6);
    expect(panCropWindow(sq, 0, -10).y).toBeCloseTo(0.5, 6);
    expect(panCropWindow(sq, 0, 10).y).toBeCloseTo(0, 6);
  });
});

describe("panCropOffset — pan within the rotation magnification (D12)", () => {
  const sq: CropDraft = { x: 0.25, y: 0.25, w: 0.5, h: 0.5, rotation: 0, ox: 0, oy: 0 };

  it("θ=0 has no magnification slack → offset pinned to 0", () => {
    const r = panCropOffset({ ...sq }, 0.3, 0.3, 1);
    expect(r.ox).toBe(0);
    expect(r.oy).toBe(0);
  });

  it("rotated: a small drag moves the offset (reachable magnified overflow)", () => {
    const r = panCropOffset({ ...sq, rotation: deg(45) }, 0.1, 0, 1);
    expect(Math.abs(r.ox) + Math.abs(r.oy)).toBeGreaterThan(0);
  });

  it("rotated: offset is clamped (huge drag stays finite and bounded by the magnification)", () => {
    const r = panCropOffset({ ...sq, rotation: deg(45) }, 100, 100, 1);
    expect(Number.isFinite(r.ox)).toBe(true);
    expect(Number.isFinite(r.oy)).toBe(true);
    // Bounded by the rotated full-source half-extent (Z/(2w) ≈ 1.41 for w=0.5,45°).
    expect(Math.abs(r.ox)).toBeLessThan(2);
    expect(Math.abs(r.oy)).toBeLessThan(2);
  });

  it("rotated: opposite drags give opposite-signed offsets", () => {
    const a = panCropOffset({ ...sq, rotation: deg(30) }, 0.15, 0, 1).ox;
    const b = panCropOffset({ ...sq, rotation: deg(30) }, -0.15, 0, 1).ox;
    expect(Math.sign(a)).toBe(-Math.sign(b));
  });
});

describe("coverZoom", () => {
  it("is 1 at θ=0 and max(a, 1/a) at 90°", () => {
    expect(coverZoom(0, 2)).toBe(1);
    expect(coverZoom(Math.PI / 2, 2)).toBeCloseTo(2, 6);
    expect(coverZoom(Math.PI / 2, 0.5)).toBeCloseTo(2, 6);
  });
  it("uses |cos|/|sin| so θ and θ+π give the same zoom", () => {
    expect(coverZoom(deg(30), 1.5)).toBeCloseTo(coverZoom(deg(210), 1.5), 9);
  });
});
