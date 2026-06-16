// WI-051 Step 3 — engine text-measure flag gate + graceful fallback.

import { afterEach, describe, expect, it } from "vitest";
import { engineTextMeasureEnabled, measureTextInput } from "./text-measurer.js";

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
