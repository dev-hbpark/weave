import { afterEach, describe, expect, it } from "vitest";
import { fitFontScale, isTextAutofitEnabled } from "./text-autofit.js";

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
