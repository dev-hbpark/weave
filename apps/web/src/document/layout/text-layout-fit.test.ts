// DR-157 — the single text-into-layout fit seam. textHugChildPolicy is pure (tested in
// full); textHugFrameRatio depends on the engine measurer (a browser canvas), so in node
// it returns undefined — the measure math itself is covered by text-measurer.test.ts.

import { describe, expect, it } from "vitest";
import { textHugChildPolicy, textHugFrameRatio } from "./text-layout-fit.js";

describe("textHugChildPolicy (shared per-parent child policy)", () => {
  it("auto-flex → content-hug basis:auto, no crossSize (box hugs, render font-fit off)", () => {
    expect(textHugChildPolicy("auto-flex")).toEqual({
      kind: "auto-flex",
      grow: 0,
      shrink: 1,
      basis: "auto",
    });
  });
  it("auto-grid → undefined (keep the engine cell; render shrink-to-fit handles overflow)", () => {
    expect(textHugChildPolicy("auto-grid")).toBeUndefined();
  });
  it("free / absolute / no layout → undefined (frame-only hug)", () => {
    expect(textHugChildPolicy("absolute-constraints")).toBeUndefined();
    expect(textHugChildPolicy(undefined)).toBeUndefined();
  });
});

describe("textHugFrameRatio (shared measure)", () => {
  it("returns undefined with no browser measurer (node) — callers keep the seeded frame", () => {
    const attrs = { text: "x", fontFamily: "Inter", fontSize: 24 };
    expect(textHugFrameRatio(attrs, { w: 1000, h: 500 }, 500)).toBeUndefined();
  });
});
