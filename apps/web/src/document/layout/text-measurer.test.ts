// WI-051 Step 3 — engine text-measure flag gate + graceful fallback.

import type { MeasureText } from "@agocraft/layout";
import { afterEach, describe, expect, it } from "vitest";
import {
  engineTextMeasureEnabled,
  freeTextHugRatio,
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

describe("engineTextMeasureEnabled (opt-in until live-verified)", () => {
  afterEach(() => store.clear());

  it("is OFF by default", () => {
    expect(engineTextMeasureEnabled()).toBe(false);
  });

  it("is enabled only by the exact value 'on'", () => {
    store.set("weave.engineTextMeasure", "on");
    expect(engineTextMeasureEnabled()).toBe(true);
    store.set("weave.engineTextMeasure", "yes");
    expect(engineTextMeasureEnabled()).toBe(false);
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
