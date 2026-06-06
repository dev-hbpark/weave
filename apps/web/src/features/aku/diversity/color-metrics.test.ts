import { describe, expect, it } from "vitest";
import { nn } from "../../../lib/nn.js";
import { colorDeltaE, deltaE2000, type Lab, parseColor, rgbToLab } from "./color-metrics.js";

describe("parseColor", () => {
  it("parses #rgb, #rrggbb, and rgb()/rgba()", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#1f2933")).toEqual({ r: 0x1f, g: 0x29, b: 0x33 });
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("rgba(10 20 30 / 0.5)")).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("returns null for unresolvable tokens / named colors", () => {
    expect(parseColor("var(--text-default)")).toBeNull();
    expect(parseColor("rebeccapurple")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("deltaE2000 — Sharma et al. reference pairs", () => {
  // Published CIEDE2000 test data (Lab1, Lab2, expected ΔE00). Tolerance 1e-3.
  const cases: ReadonlyArray<[Lab, Lab, number]> = [
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: -1.3802, b: -84.2814 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
    [{ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 }, 2.3669],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ L: 61.2901, a: 3.7196, b: -5.3901 }, { L: 61.4292, a: 2.248, b: -4.962 }, 1.8731],
    [{ L: 22.7233, a: 20.0904, b: -46.694 }, { L: 23.0331, a: 14.973, b: -42.5619 }, 2.0373],
  ];

  for (const [l1, l2, expected] of cases) {
    it(`ΔE00 ≈ ${expected}`, () => {
      expect(deltaE2000(l1, l2)).toBeCloseTo(expected, 3);
    });
  }

  it("is symmetric and zero for identical colors", () => {
    const a: Lab = { L: 50, a: 10, b: -20 };
    const b: Lab = { L: 55, a: -5, b: 15 };
    expect(deltaE2000(a, a)).toBeCloseTo(0, 6);
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 6);
  });
});

describe("colorDeltaE (string → ΔE00)", () => {
  it("separates distinct hues and returns ~0 for identical", () => {
    expect(colorDeltaE("#111111", "#111111")).toBeCloseTo(0, 6);
    const d = colorDeltaE("#e23b3b", "#2b6fe2");
    expect(d).not.toBeNull();
    expect(nn(d)).toBeGreaterThan(20); // red vs blue — perceptually far apart
  });

  it("returns null when either color is a token", () => {
    expect(colorDeltaE("var(--bg)", "#111111")).toBeNull();
    expect(colorDeltaE("#111111", "var(--bg)")).toBeNull();
  });
});

describe("rgbToLab sanity", () => {
  it("maps black→L0, white→L100", () => {
    expect(rgbToLab({ r: 0, g: 0, b: 0 }).L).toBeCloseTo(0, 3);
    expect(rgbToLab({ r: 255, g: 255, b: 255 }).L).toBeCloseTo(100, 3);
  });
});
