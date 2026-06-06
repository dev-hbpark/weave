import { describe, expect, it } from "vitest";
import {
  clampCornerRadiusPx,
  cornerRadiusFractionToPx,
  cornerRadiusPxToFraction,
  cssBorderRadius,
  isUniformRadii,
  mediaBorderRadius,
  perCornerRectPath,
  uniformRadii,
} from "./corner-radius.js";

describe("corner-radius helpers", () => {
  describe("clampCornerRadiusPx", () => {
    it("caps at half the SHORT side (50% rule), circular", () => {
      // 200 × 100 → cap 50.
      expect(clampCornerRadiusPx(80, 200, 100)).toBe(50);
      expect(clampCornerRadiusPx(30, 200, 100)).toBe(30);
    });
    it("uses min(w,h) regardless of which axis is shorter", () => {
      expect(clampCornerRadiusPx(999, 100, 400)).toBe(50);
      expect(clampCornerRadiusPx(999, 400, 100)).toBe(50);
    });
    it("floors at 0 and tolerates a degenerate box", () => {
      expect(clampCornerRadiusPx(-5, 200, 100)).toBe(0);
      expect(clampCornerRadiusPx(10, 0, 100)).toBe(0);
    });
  });

  describe("px ↔ fraction round-trip", () => {
    it("fraction 1 = pill on the short axis (half-short px)", () => {
      expect(cornerRadiusFractionToPx(1, 200, 100)).toBe(50);
      expect(cornerRadiusPxToFraction(50, 200, 100)).toBe(1);
    });
    it("saturates the fraction at 1 for oversized px", () => {
      expect(cornerRadiusPxToFraction(9999, 200, 100)).toBe(1);
    });
    it("is a clean inverse in the valid range", () => {
      const px = cornerRadiusFractionToPx(0.4, 300, 120); // half-short = 60 → 24
      expect(px).toBeCloseTo(24, 6);
      expect(cornerRadiusPxToFraction(px, 300, 120)).toBeCloseTo(0.4, 6);
    });
    it("clamps a negative fraction to 0", () => {
      expect(cornerRadiusFractionToPx(-1, 200, 100)).toBe(0);
    });
  });

  // The model's resize promise: an absolute px radius is size-independent — the
  // SAME stored value yields the SAME corner until a side shrinks past 2×radius,
  // where the half-short clamp re-engages (Figma behaviour).
  describe("resize semantics (absolute px is size-independent)", () => {
    it("keeps the radius through a grow on either axis", () => {
      expect(clampCornerRadiusPx(50, 200, 100)).toBe(50); // start
      expect(clampCornerRadiusPx(50, 400, 100)).toBe(50); // grow width → unchanged
      expect(clampCornerRadiusPx(50, 400, 300)).toBe(50); // grow height → unchanged
    });
    it("re-clamps only once the short side forces it", () => {
      expect(clampCornerRadiusPx(50, 400, 60)).toBe(30); // height 60 → cap 30
    });
  });

  // ── Per-corner (WI-109) ────────────────────────────────────────────────
  describe("per-corner helpers", () => {
    it("uniformRadii / isUniformRadii", () => {
      expect(uniformRadii(8)).toEqual({ tl: 8, tr: 8, br: 8, bl: 8 });
      expect(isUniformRadii(uniformRadii(8))).toBe(true);
      expect(isUniformRadii({ tl: 8, tr: 8, br: 8, bl: 9 })).toBe(false);
    });
    it("cssBorderRadius emits tl/tr/br/bl px", () => {
      expect(cssBorderRadius({ tl: 1, tr: 2, br: 3, bl: 4 })).toBe("1px 2px 3px 4px");
    });
    it("mediaBorderRadius prefers the tuple, falls back to scalar then 0", () => {
      expect(mediaBorderRadius({ tl: 1, tr: 2, br: 3, bl: 4 }, 9)).toBe("1px 2px 3px 4px");
      expect(mediaBorderRadius(undefined, 9)).toBe("9px");
      expect(mediaBorderRadius(undefined, 0)).toBe(0);
      expect(mediaBorderRadius(undefined, undefined)).toBe(0);
    });
    it("perCornerRectPath clamps each corner to the half-short side and closes", () => {
      // 200×100 box → cap 50. A 999 corner is clamped to 50.
      const d = perCornerRectPath(200, 100, { tl: 999, tr: 0, br: 0, bl: 0 });
      expect(d.startsWith("M 50 0")).toBe(true); // top-left arc begins at x=50
      expect(d).toContain("A 50 50 0 0 1 50 0"); // tl arc radius 50
      expect(d).toContain("L 200 0"); // sharp top-right (tr=0)
      expect(d.trimEnd().endsWith("Z")).toBe(true);
    });
  });
});
