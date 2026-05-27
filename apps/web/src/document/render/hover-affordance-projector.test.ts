// WI-040 Phase 3 — projector unit tests.
//
// Pinned cases:
//   1. Hovered frame at root → hovered + siblings; parent = null (root
//      is skipped — tinting the entire canvas is noise).
//   2. Hovered frame nested in another frame → hovered + siblings +
//      parent (the containing frame).
//   3. Hovered canvas-shape inside a frame's attrs.shapes → hovered
//      uses shape's frame-local rect projected through frame box;
//      siblings = other shapes in the same array; parent = the frame.
//   4. Selection exclusion — selected ids drop out of every tier
//      individually; if everything is selected the projection is empty
//      but valid.
//   5. Unknown / unprojectable hover kinds (handle / background / none
//      / hotspot) return EMPTY.

import type { Document as AgocraftDocument, Item as AgocraftItem, ItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { projectHoverAffordance } from "./hover-affordance-projector.js";

const DESIGN_W = 1000;
const DESIGN_H = 600;

function makeItem(
  id: string,
  attrs: Record<string, unknown>,
  children: ReadonlyArray<AgocraftItem> = [],
): AgocraftItem {
  return {
    id: id as ItemId,
    kind: "frame",
    attrs,
    children,
    behaviors: [],
    relations: [],
    units: [],
  } as unknown as AgocraftItem;
}

function makeDoc(children: ReadonlyArray<AgocraftItem>): AgocraftDocument {
  return {
    id: "demo",
    schemaVersion: 9,
    root: makeItem("root", {}, children),
  } as unknown as AgocraftDocument;
}

describe("projectHoverAffordance — frame paths", () => {
  it("returns EMPTY for unprojectable kinds", () => {
    const doc = makeDoc([
      makeItem("a", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }),
    ]);
    for (const kind of ["handle", "background", "hotspot", "none", "garbage"]) {
      expect(
        projectHoverAffordance({
          doc,
          hoveredKind: kind,
          hoveredId: "a",
          designWidth: DESIGN_W,
          designHeight: DESIGN_H,
          selectedIds: new Set(),
        }),
      ).toEqual({ hovered: null, siblings: [], parent: null });
    }
  });

  it("hovered frame at root: hovered + siblings, parent stays null (root skipped)", () => {
    const doc = makeDoc([
      makeItem("a", { frame: { x: 0, y: 0, width: 0.5, height: 0.5, rotation: 0 } }),
      makeItem("b", { frame: { x: 0.5, y: 0, width: 0.5, height: 0.5, rotation: 0 } }),
      makeItem("c", { frame: { x: 0, y: 0.5, width: 1, height: 0.5, rotation: 0 } }),
    ]);
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(),
    });
    expect(out.hovered).toEqual({ x: 0, y: 0, width: 500, height: 300, id: "a" });
    expect(out.siblings).toEqual([
      { x: 500, y: 0, width: 500, height: 300, id: "b" },
      { x: 0, y: 300, width: 1000, height: 300, id: "c" },
    ]);
    expect(out.parent).toBeNull();
  });

  it("nested hovered frame: parent + siblings derived from containing frame", () => {
    const outer = makeItem(
      "outer",
      { frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 } },
      [
        makeItem("inner-a", {
          frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 },
        }),
        makeItem("inner-b", {
          frame: { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 },
        }),
      ],
    );
    const doc = makeDoc([outer]);
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "inner-a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(),
    });
    expect(out.hovered).toEqual({ x: 100, y: 60, width: 400, height: 480, id: "inner-a" });
    expect(out.siblings).toEqual([{ x: 500, y: 60, width: 400, height: 480, id: "inner-b" }]);
    expect(out.parent).toEqual({
      x: 100,
      y: 60,
      width: 800,
      height: 480,
      id: "outer",
    });
  });

  it("rotation is preserved on every tier when non-zero", () => {
    const outer = makeItem("outer", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0.5 } }, [
      makeItem("inner", {
        frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0.25 },
      }),
    ]);
    const doc = makeDoc([outer]);
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "inner",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(),
    });
    expect(out.hovered?.rotation).toBe(0.25);
    expect(out.parent?.rotation).toBe(0.5);
  });
});

describe("projectHoverAffordance — selection exclusion", () => {
  const doc = makeDoc([
    makeItem("outer", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }, [
      makeItem("a", { frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 } }),
      makeItem("b", { frame: { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 } }),
    ]),
  ]);

  it("drops hovered when its id is selected", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(["a"]),
    });
    expect(out.hovered).toBeNull();
    expect(out.siblings.map((s) => s.id)).toEqual(["b"]);
    expect(out.parent?.id).toBe("outer");
  });

  it("drops selected siblings element-wise", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(["b"]),
    });
    expect(out.hovered?.id).toBe("a");
    expect(out.siblings).toEqual([]);
    expect(out.parent?.id).toBe("outer");
  });

  it("drops parent when selected", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(["outer"]),
    });
    expect(out.hovered?.id).toBe("a");
    expect(out.siblings.map((s) => s.id)).toEqual(["b"]);
    expect(out.parent).toBeNull();
  });

  it("returns all-null projection when every tier is selected", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(["a", "b", "outer"]),
    });
    expect(out).toEqual({ hovered: null, siblings: [], parent: null });
  });
});

describe("projectHoverAffordance — canvas-shape path", () => {
  const shapeA = {
    id: "shape-a",
    x: 0.1,
    y: 0.1,
    width: 0.3,
    height: 0.4,
    rotation: 0,
    hue: "#f00",
  };
  const shapeB = {
    id: "shape-b",
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.3,
    rotation: 0.5,
    hue: "#0f0",
  };
  const frame = makeItem("frame-1", {
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 },
    shapes: [shapeA, shapeB],
  });
  const doc = makeDoc([frame]);

  it("hovered shape: hovered + sibling shape + parent frame", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "shape",
      hoveredId: "shape-a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(),
    });
    // frame absolute box: x=100, y=60, w=800, h=480.
    expect(out.parent).toEqual({ x: 100, y: 60, width: 800, height: 480, id: "frame-1" });
    // shape-a: x=100 + 0.1*800 = 180, y=60 + 0.1*480 = 108, w=0.3*800=240, h=0.4*480=192.
    expect(out.hovered).toEqual({ x: 180, y: 108, width: 240, height: 192, id: "shape-a" });
    // shape-b: x=100+0.5*800=500, y=60+0.5*480=300, w=0.4*800=320, h=0.3*480=144, rotation=0.5
    expect(out.siblings).toEqual([
      { x: 500, y: 300, width: 320, height: 144, rotation: 0.5, id: "shape-b" },
    ]);
  });

  it("selected shape is excluded from siblings", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "shape",
      hoveredId: "shape-a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(["shape-b"]),
    });
    expect(out.siblings).toEqual([]);
  });

  it("returns EMPTY when shape id is unknown", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "shape",
      hoveredId: "shape-missing",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(),
    });
    expect(out).toEqual({ hovered: null, siblings: [], parent: null });
  });
});
