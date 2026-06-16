import { describe, expect, it } from "vitest";
import {
  clampEstHeightRatio,
  ENGINE_MIN_MAIN_SHARE,
  EST_HEIGHT_RATIO_CAP,
  EST_HEIGHT_RATIO_FLOOR,
  MIN_FIT_FONT_PX,
  MIN_FIT_SCALE,
  minFitScaleFor,
} from "./text-fit-floors.js";

// These were 5 inline magic numbers across TextBlock / text-autofit / agent-text-resize
// before consolidation — this suite locks the single-source values + the derived
// px↔scale / ratio relationships so a drift is caught here, not in a layout regression.

describe("text-fit-floors — constants", () => {
  it("holds the consolidated floor values", () => {
    expect(MIN_FIT_FONT_PX).toBe(11);
    expect(MIN_FIT_SCALE).toBe(0.3);
    expect(EST_HEIGHT_RATIO_FLOOR).toBe(0.02);
    expect(EST_HEIGHT_RATIO_CAP).toBe(0.95);
    // Must stay in sync with @agocraft/layout auto-flex MIN_MAIN_SHARE.
    expect(ENGINE_MIN_MAIN_SHARE).toBe(0.04);
  });
});

describe("minFitScaleFor (render shrink-to-fit floor)", () => {
  it("floors at MIN_FIT_SCALE for a normal font (px floor not yet binding)", () => {
    // 11/24 ≈ 0.458 > 0.3 → the px floor binds (stays readable at 11px)
    expect(minFitScaleFor(24)).toBeCloseTo(11 / 24, 5);
  });
  it("floors at MIN_FIT_SCALE for a large font (px floor would be jarringly small)", () => {
    // 11/200 = 0.055 < 0.3 → the 0.3 scale floor binds instead
    expect(minFitScaleFor(200)).toBe(0.3);
  });
  it("never returns below MIN_FIT_SCALE", () => {
    expect(minFitScaleFor(1000)).toBe(0.3);
  });
  it("returns MIN_FIT_SCALE for a non-ready (non-positive) font px", () => {
    expect(minFitScaleFor(0)).toBe(0.3);
    expect(minFitScaleFor(-5)).toBe(0.3);
  });
});

describe("clampEstHeightRatio (add-time estimate band)", () => {
  it("passes a value already inside the band", () => {
    expect(clampEstHeightRatio(0.5)).toBe(0.5);
  });
  it("floors a too-small estimate (no 0-height box)", () => {
    expect(clampEstHeightRatio(0.001)).toBe(0.02);
    expect(clampEstHeightRatio(0)).toBe(0.02);
  });
  it("caps a too-tall estimate (leaves room in the container)", () => {
    expect(clampEstHeightRatio(2)).toBe(0.95);
  });
});
