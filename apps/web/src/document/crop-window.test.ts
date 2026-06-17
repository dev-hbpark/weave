// WI-244 / DR-161 — crop.window unit reader precedence: unit > legacy attr > identity.

import type { Item as AgocraftItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { CROP_WINDOW_UNIT_KIND, IDENTITY_CROP_WINDOW, readCropWindow } from "./crop-window.js";

function item(opts: {
  attrs?: Record<string, unknown>;
  units?: ReadonlyArray<{ kind: string; attrs: Record<string, unknown> }>;
}): AgocraftItem {
  return {
    id: "i1",
    kind: "image",
    attrs: opts.attrs ?? {},
    units: opts.units ?? [],
    children: [],
    meta: { createdAt: "", updatedAt: "", schemaVersion: 1 },
  } as unknown as AgocraftItem;
}

describe("readCropWindow", () => {
  it("returns identity when neither unit nor legacy attr is present", () => {
    expect(readCropWindow(item({}))).toEqual(IDENTITY_CROP_WINDOW);
  });

  it("reads the crop.window unit", () => {
    const got = readCropWindow(
      item({
        units: [
          { kind: CROP_WINDOW_UNIT_KIND, attrs: { x: 0.1, y: 0.2, w: 0.5, h: 0.6, rotation: 0.3 } },
        ],
      }),
    );
    expect(got).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6, rotation: 0.3 });
  });

  it("falls back to the legacy attrs.cropRatio when no unit", () => {
    const got = readCropWindow(item({ attrs: { cropRatio: { x: 0.25, y: 0, w: 0.5, h: 1 } } }));
    expect(got).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1, rotation: 0 });
  });

  it("prefers the unit over a legacy attr when both exist", () => {
    const got = readCropWindow(
      item({
        attrs: { cropRatio: { x: 0.9, y: 0.9, w: 0.1, h: 0.1 } },
        units: [{ kind: CROP_WINDOW_UNIT_KIND, attrs: { x: 0, y: 0, w: 1, h: 1, rotation: 0 } }],
      }),
    );
    expect(got).toEqual({ x: 0, y: 0, w: 1, h: 1, rotation: 0 });
  });

  it("coerces non-finite / missing fields to defaults", () => {
    const got = readCropWindow(
      item({ units: [{ kind: CROP_WINDOW_UNIT_KIND, attrs: { x: Number.NaN, w: 0.5 } }] }),
    );
    expect(got).toEqual({ x: 0, y: 0, w: 0.5, h: 1, rotation: 0 });
  });
});
