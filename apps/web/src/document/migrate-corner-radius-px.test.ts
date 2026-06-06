// Unit tests for the legacy corner-radius ratio → absolute-px load migration.
//
// The conversion is size-dependent: px = ratio · (min(absW, absH) / 2), where
// the absolute box is the product of frame ratios down the ancestor chain ×
// the design's width × height. These tests assert that composition, the
// per-kind field selection, and the "leave it alone" cases.

import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  createSchema,
  itemId,
} from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { migrateCornerRadiusRatioToPx } from "./migrate-corner-radius-px.js";

const NOW = "2026-06-06T00:00:00Z";
const DESIGN_W = 1000;
const DESIGN_H = 800;

function makeItem(
  id: string,
  kind: string,
  attrs: Readonly<Record<string, unknown>>,
  children: ReadonlyArray<AgocraftItem> = [],
): AgocraftItem {
  return {
    id: itemId(id),
    kind,
    attrs,
    units: [],
    children,
    meta: { createdAt: NOW, updatedAt: NOW, schemaVersion: 3 },
  };
}

function makeDoc(children: ReadonlyArray<AgocraftItem>): AgocraftDocument {
  return {
    id: "test-design",
    schema: createSchema(),
    root: makeItem("test-design-root", "weave-doc", { title: "Test" }, children),
    meta: { createdAt: NOW, updatedAt: NOW, schemaVersion: 3, schemaRefs: [] },
  };
}

const frameRatio = (width: number, height: number) => ({ x: 0, y: 0, width, height, rotation: 0 });

function attrField(item: AgocraftItem | undefined, field: string): unknown {
  if (item === undefined) throw new Error("missing item");
  return (item.attrs as Record<string, unknown>)[field];
}

describe("migrateCornerRadiusRatioToPx", () => {
  it("converts a top-level image borderRadius ratio → px against its absolute box", () => {
    // image frame = 0.5 × 0.25 of a 1000×800 design → 500 × 200 abs box.
    // short side 200 → half-short 100. ratio 0.5 → 50px.
    const image = makeItem("img", "image", {
      frame: frameRatio(0.5, 0.25),
      src: "",
      borderRadius: 0.5,
    });
    const out = migrateCornerRadiusRatioToPx(makeDoc([image]), DESIGN_W, DESIGN_H);
    expect(out).not.toBe(makeDoc([image])); // new identity
    expect(attrField(out.root.children[0], "borderRadius")).toBe(50);
  });

  it("uses frame cornerRadius for frames and composes nested ancestor ratios", () => {
    // outer frame 0.5 × 0.5 → 500 × 400 abs.
    // inner image 0.4 × 0.5 of the outer → 200 × 200 abs (square).
    // short side 200 → half-short 100. ratio 1.0 → 100px (pill).
    const inner = makeItem("inner", "image", {
      frame: frameRatio(0.4, 0.5),
      src: "",
      borderRadius: 1,
    });
    const outer = makeItem("outer", "frame", { frame: frameRatio(0.5, 0.5), cornerRadius: 0.5 }, [
      inner,
    ]);
    const out = migrateCornerRadiusRatioToPx(makeDoc([outer]), DESIGN_W, DESIGN_H);
    const outFrame = out.root.children[0];
    // outer frame: 500 × 400 → half-short 200 → ratio 0.5 → 100px.
    expect(attrField(outFrame, "cornerRadius")).toBe(100);
    // inner image: 200 × 200 → half-short 100 → ratio 1.0 → 100px.
    expect(attrField(outFrame?.children[0], "borderRadius")).toBe(100);
  });

  it("leaves a 0 / absent radius and non-corner kinds untouched (identity preserved)", () => {
    const text = makeItem("t", "text", { frame: frameRatio(0.5, 0.5), text: "hi" });
    const sharpImg = makeItem("s", "image", {
      frame: frameRatio(0.5, 0.5),
      src: "",
      borderRadius: 0,
    });
    const doc = makeDoc([text, sharpImg]);
    const out = migrateCornerRadiusRatioToPx(doc, DESIGN_W, DESIGN_H);
    // nothing to change → same reference back.
    expect(out).toBe(doc);
  });

  it("is NOT idempotent — a second pass treats px as ratio (why the caller gates)", () => {
    // 500 × 200 image, ratio 0.5 → 50px on the first pass.
    const image = makeItem("img", "image", {
      frame: frameRatio(0.5, 0.25),
      src: "",
      borderRadius: 0.5,
    });
    const once = migrateCornerRadiusRatioToPx(makeDoc([image]), DESIGN_W, DESIGN_H);
    expect(attrField(once.root.children[0], "borderRadius")).toBe(50);
    // Second pass: 50 is now read as a "ratio", clamped to 1 → saturates to the
    // half-short (100). This is the corruption the meta-marker gate prevents.
    const twice = migrateCornerRadiusRatioToPx(once, DESIGN_W, DESIGN_H);
    expect(attrField(twice.root.children[0], "borderRadius")).toBe(100);
  });
});
