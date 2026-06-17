// WI-247 / DR-163 — flip unit model: applicability rule + toggle manipulation.

import type { Item as AgocraftItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { flipUnit } from "./flip-unit.js";

const item = (kind: string, units: ReadonlyArray<{ kind: string; attrs: object }> = []) =>
  ({ id: "i", kind, attrs: {}, units, children: [], meta: {} }) as unknown as AgocraftItem;

describe("flipUnit", () => {
  it("appliesTo: image/video/shape/line/frame yes; text/qr no (the per-unit rule)", () => {
    for (const k of ["image", "video", "shape", "line", "frame"]) {
      expect(flipUnit.appliesTo(item(k))).toBe(true);
    }
    for (const k of ["text", "qr"]) {
      expect(flipUnit.appliesTo(item(k))).toBe(false);
    }
  });

  it("toggle flips only the requested axis", () => {
    expect(flipUnit.toggle({ flipH: false, flipV: false }, "horizontal")).toEqual({
      flipH: true,
      flipV: false,
    });
    expect(flipUnit.toggle({ flipH: true, flipV: false }, "vertical")).toEqual({
      flipH: true,
      flipV: true,
    });
    expect(flipUnit.toggle({ flipH: true, flipV: false }, "horizontal")).toEqual({
      flipH: false,
      flipV: false,
    });
  });

  it("toAttrs clears (null) when neither axis is set, else persists the 2-bit state", () => {
    expect(flipUnit.toAttrs({ flipH: false, flipV: false })).toBeNull();
    expect(flipUnit.toAttrs({ flipH: true, flipV: false })).toEqual({ flipH: true, flipV: false });
  });

  it("validate coerces non-booleans to false", () => {
    const r = flipUnit.validate({ flipH: 1, flipV: true });
    expect(r.ok && r.value).toEqual({ flipH: false, flipV: true });
  });

  it("read returns the current flip state (identity when absent)", () => {
    expect(flipUnit.read(item("image"))).toEqual({ flipH: false, flipV: false });
    expect(
      flipUnit.read(item("image", [{ kind: "transform.flip", attrs: { flipH: true } }])),
    ).toEqual({ flipH: true, flipV: false });
  });

  it("isAxis guards the axis input", () => {
    expect(flipUnit.isAxis("horizontal")).toBe(true);
    expect(flipUnit.isAxis("diagonal")).toBe(false);
  });
});
