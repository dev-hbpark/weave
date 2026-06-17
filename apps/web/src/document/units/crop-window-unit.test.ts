// WI-247 / DR-163 — crop.window unit model: validation + attrs projection +
// manipulation (the geometry math itself is covered by crop-geometry tests).

import { describe, expect, it } from "vitest";
import type { CropDraft } from "../interactions/cropping-state.js";
import { cropWindowUnit } from "./crop-window-unit.js";

describe("cropWindowUnit", () => {
  it("appliesTo is always true (crop is kind-agnostic)", () => {
    expect(cropWindowUnit.appliesTo({ kind: "text" } as never)).toBe(true);
    expect(cropWindowUnit.appliesTo({ kind: "frame" } as never)).toBe(true);
  });

  it("validate accepts a 0..1 window", () => {
    const r = cropWindowUnit.validate({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    expect(r.ok && r.value).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  });

  it("validate rejects out-of-range / zero-size with invalid-input", () => {
    for (const bad of [
      undefined,
      { x: 0.6, y: 0, w: 0.6, h: 1 }, // x+w > 1
      { x: 0, y: 0, w: 0, h: 1 }, // w <= 0
      { x: -0.1, y: 0, w: 0.5, h: 1 }, // x < 0
    ]) {
      const r = cropWindowUnit.validate(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("invalid-input");
    }
  });

  it("validate rejects a non-finite rotation", () => {
    const r = cropWindowUnit.validate({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rotation: Number.POSITIVE_INFINITY,
    });
    expect(r.ok).toBe(false);
  });

  it("toAttrs omits rotation when absent, keeps it when provided", () => {
    expect(cropWindowUnit.toAttrs({ x: 0, y: 0, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropWindowUnit.toAttrs({ x: 0, y: 0, w: 1, h: 1, rotation: 0.5 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rotation: 0.5,
    });
  });

  it("straighten normalizes the angle into (-π, π]", () => {
    const draft = { x: 0, y: 0, w: 1, h: 1, rotation: 0, ox: 0, oy: 0 } as CropDraft;
    const out = cropWindowUnit.straighten(draft, Math.PI * 3); // 3π → π
    expect(out.rotation).toBeCloseTo(Math.PI, 5);
  });

  it("resize keeps the window inside [0,1] with a minimum size", () => {
    const draft = { x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0, ox: 0, oy: 0 } as CropDraft;
    const out = cropWindowUnit.resize(draft, "e", 1, 0); // drag east far past the edge
    expect(out.x + out.w).toBeLessThanOrEqual(1 + 1e-9);
  });
});
