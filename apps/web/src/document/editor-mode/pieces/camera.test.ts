// WI-157 / WI-166 — fit-to-active-page box math, now owned by the camera
// policy piece (migrated from pages/page-fit.test.ts when the math moved
// into the CameraPolicy — Decommission Sweep).

import { describe, expect, it } from "vitest";
import { FULL_FRAME } from "../../types.js";
import { fitActivePage, pageFitBox } from "./camera.js";

describe("pageFitBox (WI-157)", () => {
  it("returns undefined for FULL_FRAME — the base fit already frames it", () => {
    expect(pageFitBox(FULL_FRAME, 1280, 720)).toBeUndefined();
  });

  it("tolerates float noise around FULL_FRAME (epsilon compare)", () => {
    expect(
      pageFitBox({ x: 1e-9, y: -1e-9, width: 1 + 1e-9, height: 1 - 1e-9, rotation: 0 }, 1280, 720),
    ).toBeUndefined();
  });

  it("maps a non-full page to its design-px box", () => {
    expect(pageFitBox({ x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0 }, 1280, 720)).toEqual(
      { x: 512, y: 288, w: 256, h: 144 },
    );
  });

  it("treats a rotated full-size frame as non-full (unrotated box)", () => {
    expect(pageFitBox({ x: 0, y: 0, width: 1, height: 1, rotation: 0.3 }, 1000, 500)).toEqual({
      x: 0,
      y: 0,
      w: 1000,
      h: 500,
    });
  });
});

describe("fitActivePage (WI-166 CameraPolicy)", () => {
  const doc = {
    root: {
      id: "root",
      children: [
        { id: "p1", attrs: { frame: FULL_FRAME } },
        { id: "p2", attrs: { frame: { x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0 } } },
        { id: "p3", attrs: {} },
      ],
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal Document stub — fitActivePage only reads root.children[].{id,attrs}
  } as any;

  it("returns undefined with no active page", () => {
    expect(fitActivePage(doc, undefined, 1280, 720)).toBeUndefined();
  });

  it("returns undefined for a FULL_FRAME active page (base fit suffices)", () => {
    expect(fitActivePage(doc, "p1", 1280, 720)).toBeUndefined();
  });

  it("returns the page box for a non-full active page", () => {
    expect(fitActivePage(doc, "p2", 1280, 720)).toEqual({ x: 512, y: 288, w: 256, h: 144 });
  });

  it("returns undefined for an unknown id or a frame-less page", () => {
    expect(fitActivePage(doc, "missing", 1280, 720)).toBeUndefined();
    expect(fitActivePage(doc, "p3", 1280, 720)).toBeUndefined();
  });
});
