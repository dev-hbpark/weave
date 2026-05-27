// WI-040 Phase 3 — projector unit tests.
//
// Pinned cases (2026-05-27 scope: hovered → descendants ⊂ hovered's
// subtree; parent = direct parent; tree siblings are NOT projected):
//   1. Unprojectable hover kinds (handle / background / none / hotspot)
//      return EMPTY.
//   2. Hovered frame at root, no children → hovered only; parent = null;
//      descendants empty.
//   3. Hovered frame nested in another frame, with its own children →
//      hovered + descendants (the child tree) + parent (direct parent).
//      Tree siblings (the parent's OTHER children) are absent.
//   4. Nested descendants — grandchildren surface in the descendants
//      list flat.
//   5. Hovered canvas-shape inside a frame's attrs.shapes → hovered +
//      parent frame; descendants empty; sibling shapes are absent.
//   6. Selection exclusion — selected ids drop from their tier
//      element-wise; if every tier is selected the projection is the
//      empty projection.
//   7. Rotation is preserved on every emitted tier.

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
      ).toEqual({ hovered: null, descendants: [], parent: null });
    }
  });

  it("hovered leaf at root: hovered only; parent + descendants empty (root skipped)", () => {
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
    // Tree siblings (b, c) are no longer projected — scope is descendants,
    // not parent's other children.
    expect(out.descendants).toEqual([]);
    expect(out.parent).toBeNull();
  });

  it("nested hovered frame: descendants from own subtree, parent = direct parent", () => {
    const outer = makeItem(
      "outer",
      { frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 } },
      [
        makeItem(
          "inner-a",
          { frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 } },
          [
            makeItem("leaf-a1", { frame: { x: 0, y: 0, width: 1, height: 0.5, rotation: 0 } }),
            makeItem("leaf-a2", { frame: { x: 0, y: 0.5, width: 1, height: 0.5, rotation: 0 } }),
          ],
        ),
        makeItem("inner-b", { frame: { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 } }),
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
    // Descendants: inner-a's own children flattened. inner-b (a tree
    // sibling) is absent.
    expect(out.descendants).toEqual([
      { x: 100, y: 60, width: 400, height: 240, id: "leaf-a1" },
      { x: 100, y: 300, width: 400, height: 240, id: "leaf-a2" },
    ]);
    expect(out.parent).toEqual({
      x: 100,
      y: 60,
      width: 800,
      height: 480,
      id: "outer",
    });
  });

  it("descendants flatten grandchildren in document order", () => {
    const root = makeItem("a", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }, [
      makeItem("b", { frame: { x: 0, y: 0, width: 1, height: 0.5, rotation: 0 } }, [
        makeItem("b1", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }),
      ]),
      makeItem("c", { frame: { x: 0, y: 0.5, width: 1, height: 0.5, rotation: 0 } }),
    ]);
    const doc = makeDoc([root]);
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(),
    });
    expect(out.descendants.map((r) => r.id)).toEqual(["b", "b1", "c"]);
    expect(out.parent).toBeNull(); // direct parent is the doc root → skipped
  });

  it("rotation is preserved on every tier when non-zero", () => {
    const outer = makeItem("outer", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0.5 } }, [
      makeItem("inner", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0.25 } }, [
        makeItem("leaf", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0.75 } }),
      ]),
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
    expect(out.descendants[0]?.rotation).toBe(0.75);
  });
});

describe("projectHoverAffordance — selection exclusion", () => {
  const doc = makeDoc([
    makeItem("outer", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }, [
      makeItem("a", { frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 } }, [
        makeItem("a1", { frame: { x: 0, y: 0, width: 1, height: 0.5, rotation: 0 } }),
        makeItem("a2", { frame: { x: 0, y: 0.5, width: 1, height: 0.5, rotation: 0 } }),
      ]),
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
    expect(out.descendants.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(out.parent?.id).toBe("outer");
  });

  it("drops selected descendants element-wise but still recurses into them", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(["a1"]),
    });
    expect(out.hovered?.id).toBe("a");
    // a1 is selected → dropped; a2 still surfaces.
    expect(out.descendants.map((r) => r.id)).toEqual(["a2"]);
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
    expect(out.descendants.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(out.parent).toBeNull();
  });

  it("returns all-null projection when every tier is selected", () => {
    const out = projectHoverAffordance({
      doc,
      hoveredKind: "frame",
      hoveredId: "a",
      designWidth: DESIGN_W,
      designHeight: DESIGN_H,
      selectedIds: new Set(["a", "a1", "a2", "outer"]),
    });
    expect(out).toEqual({ hovered: null, descendants: [], parent: null });
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

  it("hovered shape: hovered + parent frame; descendants empty (shapes have no children)", () => {
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
    // Peer shapes are no longer projected — sibling chrome was removed
    // from the spec. Only the parent frame anchors the hover for shapes.
    expect(out.descendants).toEqual([]);
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
    expect(out).toEqual({ hovered: null, descendants: [], parent: null });
  });
});
