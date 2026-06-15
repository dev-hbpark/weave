import { describe, expect, it } from "vitest";
import { clampRefitPx, shouldRefitHeight } from "./text-autofit.js";

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
