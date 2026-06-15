import { afterEach, describe, expect, it } from "vitest";
import {
  clampRefitPx,
  fitFontScale,
  isTextAutofitEnabled,
  shouldRefitHeight,
  shrinkFontTarget,
} from "./text-autofit.js";

describe("fitFontScale (WI-238 rev2 — render-level shrink-to-fit)", () => {
  it("scales down when content is taller than the box", () => {
    expect(fitFontScale(40, 60, 100, 100, 0.3)).toBeCloseTo(40 / 60, 5);
  });
  it("returns 1 when content already fits (never scales up)", () => {
    expect(fitFontScale(60, 40, 100, 100, 0.3)).toBe(1);
    expect(fitFontScale(60, 60, 100, 100, 0.3)).toBe(1);
  });
  it("floors at minScale (no microscopic text)", () => {
    expect(fitFontScale(10, 100, 100, 100, 0.3)).toBe(0.3);
  });
  it("uses the tighter of height/width", () => {
    expect(fitFontScale(100, 100, 30, 60, 0.1)).toBeCloseTo(0.5, 5); // width tighter
  });
  it("returns 1 for non-ready inputs", () => {
    expect(fitFontScale(0, 60, 100, 100, 0.3)).toBe(1);
    expect(fitFontScale(40, 0, 100, 100, 0.3)).toBe(1);
  });
});

describe("shrinkFontTarget (WI-238 rev — grid cell shrink-to-fit)", () => {
  it("shrinks the font by the overflow so content fits the cell box", () => {
    // 22px font, content 60px in a 40px box → 22 × 40/60 ≈ 14.67
    expect(shrinkFontTarget(22, 40, 60)).toBeCloseTo(14.67, 1);
  });
  it("never shrinks below the readable floor", () => {
    expect(shrinkFontTarget(22, 10, 100, 11)).toBe(11); // would be 2.2 → floored
  });
  it("does NOT shrink when content already fits (≤ box) — convergent, never grows", () => {
    expect(shrinkFontTarget(22, 40, 40)).toBe(22);
    expect(shrinkFontTarget(22, 40, 20)).toBe(22); // never scales UP
  });
  it("returns current for non-ready inputs", () => {
    expect(shrinkFontTarget(0, 40, 60)).toBe(0);
    expect(shrinkFontTarget(22, 0, 60)).toBe(22);
    expect(shrinkFontTarget(22, 40, Number.NaN)).toBe(22);
  });
});

describe("isTextAutofitEnabled (WI-237 iteration 2 flag)", () => {
  // node test env has no localStorage — install a minimal stub for this block.
  const store = new Map<string, string>();
  const had = "localStorage" in globalThis;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => store.clear());
  if (!had) {
    // restore after the suite if we added it (best-effort; harmless if left)
  }

  it("defaults ON (no flag set) — iteration 3 default", () => {
    expect(isTextAutofitEnabled()).toBe(true);
  });
  it("is disabled ONLY by the exact value 'off'", () => {
    store.set("weave.textAutofit", "off");
    expect(isTextAutofitEnabled()).toBe(false);
    store.set("weave.textAutofit", "on");
    expect(isTextAutofitEnabled()).toBe(true);
    store.set("weave.textAutofit", "anything");
    expect(isTextAutofitEnabled()).toBe(true);
  });
});

// WI-237 / DR-152 — pure decision core for content-height auto-fit.
describe("clampRefitPx", () => {
  it("returns the measured height when no bounds", () => {
    expect(clampRefitPx(80)).toBe(80);
  });
  it("floors at minPx and caps at maxPx", () => {
    expect(clampRefitPx(5, { minPx: 12 })).toBe(12);
    expect(clampRefitPx(9000, { maxPx: 1080 })).toBe(1080);
    expect(clampRefitPx(50, { minPx: 12, maxPx: 1080 })).toBe(50);
  });
});

describe("shouldRefitHeight", () => {
  it("refits when content needs clearly more than the box (clip case)", () => {
    expect(shouldRefitHeight(40, 80)).toBe(true); // 2-line title in a 1-line box
  });
  it("refits when the box is clearly too tall (balloon case)", () => {
    expect(shouldRefitHeight(450, 39)).toBe(true);
  });
  it("does NOT refit once converged (within threshold) — idempotent, no loop", () => {
    expect(shouldRefitHeight(80, 81)).toBe(false); // 1px < 2px threshold
    expect(shouldRefitHeight(80, 80)).toBe(false);
  });
  it("respects a custom threshold", () => {
    expect(shouldRefitHeight(80, 85, { thresholdPx: 8 })).toBe(false);
    expect(shouldRefitHeight(80, 95, { thresholdPx: 8 })).toBe(true);
  });
  it("compares against the CLAMPED target (no thrash toward an out-of-bounds measure)", () => {
    // measured 9000 but capped to 1080 → already at cap → no refit
    expect(shouldRefitHeight(1080, 9000, { maxPx: 1080 })).toBe(false);
    // measured 5 but floored to 12 → box at 12 already → no refit
    expect(shouldRefitHeight(12, 5, { minPx: 12 })).toBe(false);
  });
  it("ignores non-ready / non-finite measurements (no write before measure)", () => {
    expect(shouldRefitHeight(40, 0)).toBe(false);
    expect(shouldRefitHeight(40, Number.NaN)).toBe(false);
    expect(shouldRefitHeight(Number.NaN, 80)).toBe(false);
  });
});
