// WI-051 Step 3 — engine text-measure flag gate + graceful fallback.

import type { MeasureText } from "@agocraft/layout";
import { afterEach, describe, expect, it } from "vitest";
import {
  engineTextMeasureEnabled,
  freeTextHugRatio,
  gridCellFontShrink,
  measureTextInput,
  resolveCssFontFamily,
} from "./text-measurer.js";

describe("resolveCssFontFamily (Canvas2D can't resolve CSS vars)", () => {
  it("passes a concrete family / stack through unchanged", () => {
    expect(resolveCssFontFamily("Inter")).toBe("Inter");
    expect(resolveCssFontFamily("Inter, system-ui, sans-serif")).toBe(
      "Inter, system-ui, sans-serif",
    );
  });
  it("falls back to the var()'s own fallback when the property is unset (no DOM value)", () => {
    expect(resolveCssFontFamily("var(--font-sans, Arial)")).toBe("Arial");
  });
  it("falls back to sans-serif for a bare var with no fallback + no DOM value", () => {
    expect(resolveCssFontFamily("var(--font-sans)")).toBe("sans-serif");
  });
});

describe("gridCellFontShrink (measured grid-cell font shrink — fitFontScale successor)", () => {
  const spec = { text: "long text", fontFamily: "Inter", fontSizePx: 40 };
  it("is undefined when the content already fits the cell (no shrink)", () => {
    const fits: MeasureText = () => ({ widthPx: 100, heightPx: 80, minContentPx: 40 });
    expect(gridCellFontShrink(fits, spec, 200, 100)).toBeUndefined();
  });
  it("shrinks the font by the cell-height / content-height ratio when it overflows", () => {
    // wrapped content is 200px tall in a 100px cell → scale 0.5 → 40 * 0.5 = 20px
    const tall: MeasureText = () => ({ widthPx: 180, heightPx: 200, minContentPx: 40 });
    expect(gridCellFontShrink(tall, spec, 200, 100)).toBeCloseTo(20, 5);
  });
  it("floors the shrunk font at the minimum (never below ~11px)", () => {
    const huge: MeasureText = () => ({ widthPx: 180, heightPx: 4000, minContentPx: 40 });
    expect(gridCellFontShrink(huge, spec, 200, 100)).toBe(11);
  });
  it("wraps to the cell WIDTH (maxWidthPx) when measuring", () => {
    let seen: number | undefined;
    const probe: MeasureText = (s) => {
      seen = s.maxWidthPx;
      return { widthPx: 180, heightPx: 200, minContentPx: 40 };
    };
    gridCellFontShrink(probe, spec, 240, 100);
    expect(seen).toBe(240);
  });
  it("is undefined for a non-positive cell / font / degenerate measure", () => {
    const ok: MeasureText = () => ({ widthPx: 180, heightPx: 200, minContentPx: 40 });
    expect(gridCellFontShrink(ok, spec, 0, 100)).toBeUndefined();
    expect(gridCellFontShrink(ok, { ...spec, fontSizePx: 0 }, 200, 100)).toBeUndefined();
    const zero: MeasureText = () => ({ widthPx: 0, heightPx: 0, minContentPx: 0 });
    expect(gridCellFontShrink(zero, spec, 200, 100)).toBeUndefined();
  });
});

describe("freeTextHugRatio (free-placed text content hug)", () => {
  const fake: MeasureText = () => ({ widthPx: 200, heightPx: 60, minContentPx: 40 });
  it("returns content px ÷ container px as parent ratios", () => {
    const r = freeTextHugRatio(fake, { text: "x", fontFamily: "Inter", fontSizePx: 24 }, 1000, 500);
    expect(r).toEqual({ wRatio: 0.2, hRatio: 0.12 });
  });
  it("is undefined for a non-positive container box / font", () => {
    const s = { text: "x", fontFamily: "Inter", fontSizePx: 24 };
    expect(freeTextHugRatio(fake, s, 0, 500)).toBeUndefined();
    expect(freeTextHugRatio(fake, { ...s, fontSizePx: 0 }, 1000, 500)).toBeUndefined();
  });
  it("is undefined when the measurer returns a degenerate size", () => {
    const zero: MeasureText = () => ({ widthPx: 0, heightPx: 0, minContentPx: 0 });
    expect(
      freeTextHugRatio(zero, { text: "x", fontFamily: "Inter", fontSizePx: 24 }, 1000, 500),
    ).toBeUndefined();
  });
});

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

describe("engineTextMeasureEnabled (default ON, escape hatch 'off')", () => {
  afterEach(() => store.clear());

  it("is ON by default", () => {
    expect(engineTextMeasureEnabled()).toBe(true);
  });

  it("is disabled only by the exact value 'off'", () => {
    store.set("weave.engineTextMeasure", "off");
    expect(engineTextMeasureEnabled()).toBe(false);
    store.set("weave.engineTextMeasure", "on");
    expect(engineTextMeasureEnabled()).toBe(true);
    store.set("weave.engineTextMeasure", "anything");
    expect(engineTextMeasureEnabled()).toBe(true);
  });
});

describe("measureTextInput (Hug-reflow injection slice)", () => {
  afterEach(() => store.clear());

  it("returns {} when disabled — the optional measureText stays absent", () => {
    expect(measureTextInput()).toEqual({});
  });

  it("never throws, and degrades to {} when enabled without a working canvas", () => {
    store.set("weave.engineTextMeasure", "on");
    // node / jsdom has no real Canvas2D → the measurer construction is caught and
    // the engine keeps its geometry path (graceful, no crash).
    expect(() => measureTextInput()).not.toThrow();
    expect(measureTextInput()).toEqual({});
  });
});
