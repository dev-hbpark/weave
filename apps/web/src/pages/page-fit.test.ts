// WI-157 — fit-to-active-page box math.

import { describe, expect, it } from "vitest";
import { FULL_FRAME } from "../document/types.js";
import { pageFitBox } from "./page-fit.js";

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
