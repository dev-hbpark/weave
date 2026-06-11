// WI-183 — pure resize geometry: base dir math (extracted unchanged from
// FrameStage computeResize), Shift corner aspect lock, Alt resize-from-center,
// and their composition. DR-022 text font scaling must read the FINAL height
// (post-modifier), which is the reason the modifiers live inside this helper.

import { describe, expect, it } from "vitest";
import { computeResizeFrame, type ResizeSourceFrame } from "./resize-geometry.js";

const PARENT = { width: 1000, height: 500 };
const BASE: ResizeSourceFrame = { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 };

const centerOf = (f: { x: number; y: number; width: number; height: number }) => ({
  cx: f.x + f.width / 2,
  cy: f.y + f.height / 2,
});

describe("computeResizeFrame — base (no modifiers)", () => {
  it("se corner grows width/height by the parent-ratio deltas, x/y fixed", () => {
    const r = computeResizeFrame(BASE, "se", 100, 50, PARENT);
    expect(r.x).toBeCloseTo(0.2, 9);
    expect(r.y).toBeCloseTo(0.2, 9);
    expect(r.width).toBeCloseTo(0.5, 9); // +100/1000
    expect(r.height).toBeCloseTo(0.5, 9); // +50/500
  });

  it("nw corner moves the origin and shrinks", () => {
    const r = computeResizeFrame(BASE, "nw", 100, 50, PARENT);
    expect(r.x).toBeCloseTo(0.3, 9);
    expect(r.width).toBeCloseTo(0.3, 9);
    expect(r.y).toBeCloseTo(0.3, 9);
    expect(r.height).toBeCloseTo(0.3, 9);
  });

  it("clamps width/height at 0.01", () => {
    const r = computeResizeFrame(BASE, "se", -2000, -2000, PARENT);
    expect(r.width).toBe(0.01);
    expect(r.height).toBe(0.01);
  });
});

describe("computeResizeFrame — Shift corner aspect lock", () => {
  const mods = { aspectLock: true, fromCenter: false };

  it("locks nw/nh to the original aspect, dominant axis drives", () => {
    // dx → rw = 1.5 (dominant); dy → rh = 1.1
    const r = computeResizeFrame(BASE, "se", 200, 20, PARENT, mods);
    expect(r.width).toBeCloseTo(0.6, 9);
    expect(r.height).toBeCloseTo(0.6, 9); // oh * 1.5
    expect(r.width / r.height).toBeCloseTo(BASE.width / BASE.height, 9);
    expect(r.x).toBeCloseTo(0.2, 9); // anchored at top-left
    expect(r.y).toBeCloseTo(0.2, 9);
  });

  it("re-anchors at the corner opposite the handle (nw drag)", () => {
    const r = computeResizeFrame(BASE, "nw", -200, 0, PARENT, mods);
    // rw = 1.5 dominant → nw=0.6, nh=0.6; bottom-right (0.6, 0.6) fixed.
    expect(r.x + r.width).toBeCloseTo(BASE.x + BASE.width, 9);
    expect(r.y + r.height).toBeCloseTo(BASE.y + BASE.height, 9);
  });

  it("does NOT apply on edge drags", () => {
    const r = computeResizeFrame(BASE, "e", 100, 0, PARENT, mods);
    expect(r.width).toBeCloseTo(0.5, 9);
    expect(r.height).toBeCloseTo(0.4, 9); // untouched
  });

  it("floors the scale so dragging past the anchor never flips the box", () => {
    const r = computeResizeFrame(BASE, "se", -1000, -1000, PARENT, mods);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.width / r.height).toBeCloseTo(BASE.width / BASE.height, 6);
  });
});

describe("computeResizeFrame — Alt resize from center", () => {
  const mods = { aspectLock: false, fromCenter: true };

  it("edge drag grows both sides, center fixed", () => {
    const r = computeResizeFrame(BASE, "e", 100, 0, PARENT, mods);
    expect(r.width).toBeCloseTo(0.6, 9); // 2 × (+0.1)
    expect(r.height).toBeCloseTo(0.4, 9);
    expect(centerOf(r)).toEqual(centerOf(BASE));
  });

  it("corner drag doubles both axes, center fixed", () => {
    const r = computeResizeFrame(BASE, "se", 100, 50, PARENT, mods);
    expect(r.width).toBeCloseTo(0.6, 9);
    expect(r.height).toBeCloseTo(0.6, 9);
    expect(centerOf(r).cx).toBeCloseTo(centerOf(BASE).cx, 9);
    expect(centerOf(r).cy).toBeCloseTo(centerOf(BASE).cy, 9);
  });
});

describe("computeResizeFrame — Shift+Alt compose", () => {
  it("aspect-locked resize about the center", () => {
    const r = computeResizeFrame(BASE, "se", 200, 20, PARENT, {
      aspectLock: true,
      fromCenter: true,
    });
    // s = 1.5 → locked (0.6, 0.6) → center-doubled: ow(2s−1) = 0.4×2 = 0.8
    expect(r.width).toBeCloseTo(0.8, 9);
    expect(r.height).toBeCloseTo(0.8, 9);
    expect(r.width / r.height).toBeCloseTo(BASE.width / BASE.height, 9);
    expect(centerOf(r).cx).toBeCloseTo(centerOf(BASE).cx, 9);
    expect(centerOf(r).cy).toBeCloseTo(centerOf(BASE).cy, 9);
  });
});

describe("computeResizeFrame — DR-022 text font scaling reads the FINAL height", () => {
  const TEXT: ResizeSourceFrame = {
    ...BASE,
    __origFontSize: 32,
    __designWidth: 1920,
    __origFontSizeSpec: { kind: "px", value: 32 },
  };

  it("corner drag without modifiers scales the glyph by nh/oh", () => {
    const r = computeResizeFrame(TEXT, "se", 0, 100, PARENT); // nh 0.4→0.6
    expect(r.__newFontSize).toBeCloseTo(32 * 1.5, 9);
    expect(r.__newFontSizeSpec?.kind).toBe("px");
    expect(r.__newFontSizeSpec?.value).toBeCloseTo(48, 9);
  });

  it("Alt center corner drag scales the glyph by the DOUBLED height", () => {
    const r = computeResizeFrame(TEXT, "se", 0, 100, PARENT, {
      aspectLock: false,
      fromCenter: true,
    });
    // nh = 0.4 + 2×0.2 = 0.8 → factor 2
    expect(r.height).toBeCloseTo(0.8, 9);
    expect(r.__newFontSize).toBeCloseTo(64, 9);
  });

  it("edge drag never touches fontSize", () => {
    const r = computeResizeFrame(TEXT, "e", 100, 0, PARENT, {
      aspectLock: true,
      fromCenter: false,
    });
    expect(r.__newFontSize).toBeUndefined();
  });

  it("text min-width clamp still holds under modifiers", () => {
    const r = computeResizeFrame(TEXT, "w", 2000, 0, PARENT, {
      aspectLock: false,
      fromCenter: true,
    });
    expect(r.width).toBeGreaterThanOrEqual((32 * 0.6) / 1920);
  });
});
