import { describe, expect, it } from "vitest";
import { sampleOption, TONE_AXES } from "./tone-axes.js";

describe("TONE_AXES registry (DR-077 D1)", () => {
  it("has the five axes, each with unique option ids and non-empty fragments", () => {
    expect(TONE_AXES.map((a) => a.key)).toEqual([
      "palette",
      "typography",
      "layout",
      "decor",
      "shape",
    ]);
    for (const axis of TONE_AXES) {
      expect(axis.options.length).toBeGreaterThanOrEqual(2);
      const ids = axis.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length); // unique within axis
      for (const o of axis.options) {
        expect(o.label.length).toBeGreaterThan(0);
        expect(o.prompt.length).toBeGreaterThan(4);
      }
    }
  });

  it("multiplies to a ceiling far above the old 7 closed tones", () => {
    const ceiling = TONE_AXES.reduce((n, a) => n * a.options.length, 1);
    expect(ceiling).toBeGreaterThan(7); // product space, not a 7-item list
  });
});

describe("sampleOption", () => {
  const palette = TONE_AXES[0]!;

  it("is deterministic in (seed, axisIndex) and stays in range", () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const a = sampleOption(palette, seed, 0);
      const b = sampleOption(palette, seed, 0);
      expect(a).toBe(b);
      expect(palette.options).toContain(a);
    }
  });

  it("steers away from an excluded id when possible (D4)", () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const first = sampleOption(palette, seed, 0);
      const avoided = sampleOption(palette, seed, 0, first.id);
      expect(avoided.id).not.toBe(first.id); // axis has >1 option → always moves
    }
  });

  it("handles negative / large seeds without going out of range", () => {
    expect(palette.options).toContain(sampleOption(palette, -5, 2));
    expect(palette.options).toContain(sampleOption(palette, 9999, 4));
  });
});
