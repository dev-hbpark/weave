// WI-033 A4 — pure-function tests for `findFramesAtPoint`. The
// integration with NestedFrame's onContextMenu + the viewport→design-
// plane coordinate transform is covered by the e2e
// (figma-right-click-layer-picker.spec.ts).

import { itemId as makeItemId } from "@agocraft/core";
import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { findFramesAtPoint } from "./hit-test.js";

function frame(
  id: string,
  attrs: { x: number; y: number; width: number; height: number; label?: string },
  children: AgocraftItem[] = [],
): AgocraftItem {
  return {
    id: makeItemId(id),
    kind: "frame",
    attrs: {
      frame: {
        x: attrs.x,
        y: attrs.y,
        width: attrs.width,
        height: attrs.height,
        rotation: 0,
      },
      ...(attrs.label !== undefined ? { label: attrs.label } : {}),
    },
    units: [],
    children,
    meta: { createdAt: "t", updatedAt: "t", schemaVersion: 9 },
  };
}

function root(children: AgocraftItem[]): AgocraftDocument {
  return {
    schemaVersion: 9,
    root: {
      id: makeItemId("root"),
      kind: "weave-doc",
      attrs: {},
      units: [],
      children,
      meta: { createdAt: "t", updatedAt: "t", schemaVersion: 9 },
    },
  } as unknown as AgocraftDocument;
}

// Design 1000 × 1000.
//
// ┌──────────────────────────────────┐  A: x=0,y=0, w=0.5, h=0.5 → 0..500 × 0..500
// │ ┌─────────────┐                  │     A1 nested: x=0.4, y=0.4, w=0.2, h=0.2 of A
// │ │     A1      │                  │       → absolute (200, 200) - (300, 300)
// │ │             │                  │
// │ └─────────────┘    A             │
// │                                  │
// │                ┌──────────────┐  │  B: x=0.5, y=0.5, w=0.5, h=0.5 → 500..1000 × 500..1000
// │                │              │  │
// │                │      B       │  │
// │                └──────────────┘  │
// └──────────────────────────────────┘
const TREE = root([
  frame(
    "A",
    { x: 0, y: 0, width: 0.5, height: 0.5, label: "Top" },
    [frame("A1", { x: 0.4, y: 0.4, width: 0.2, height: 0.2, label: "Nested" })],
  ),
  frame("B", { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }),
]);

describe("findFramesAtPoint", () => {
  it("returns the top-level frame when the point hits it but not a child", () => {
    const hits = findFramesAtPoint(TREE, 100, 100, 1000, 1000);
    expect(hits.map((h) => h.id)).toEqual(["A"]);
    expect(hits[0]?.label).toBe("Top");
    expect(hits[0]?.depth).toBe(0);
    expect(hits[0]?.widthPx).toBe(500);
    expect(hits[0]?.heightPx).toBe(500);
  });

  it("returns deepest-first when a nested child is hit", () => {
    const hits = findFramesAtPoint(TREE, 250, 250, 1000, 1000);
    // A1 absolute = (200, 200) - (300, 300) — point 250,250 is inside both A and A1.
    expect(hits.map((h) => h.id)).toEqual(["A1", "A"]);
    expect(hits[0]?.depth).toBe(1);
    expect(hits[1]?.depth).toBe(0);
  });

  it("returns the second top-level sibling when its area is hit", () => {
    const hits = findFramesAtPoint(TREE, 750, 750, 1000, 1000);
    expect(hits.map((h) => h.id)).toEqual(["B"]);
  });

  it("returns an empty array when the point is in empty design space", () => {
    // (600, 100) — outside A (0..500 × 0..500) and outside B (500..1000 × 500..1000).
    const hits = findFramesAtPoint(TREE, 600, 100, 1000, 1000);
    expect(hits).toEqual([]);
  });

  it("falls back to label 'Frame' when no attrs.label is set", () => {
    const hits = findFramesAtPoint(TREE, 750, 750, 1000, 1000);
    expect(hits[0]?.label).toBe("Frame");
  });

  it("rounds the absolute width/height to whole px", () => {
    const hits = findFramesAtPoint(TREE, 250, 250, 1000, 1000);
    const a1 = hits.find((h) => h.id === "A1");
    expect(a1?.widthPx).toBe(100); // 0.2 × 0.5 × 1000 = 100
    expect(a1?.heightPx).toBe(100);
  });

  it("excludes the design root from the results", () => {
    // No matter where the point lands, the synthetic root never appears.
    const hits = findFramesAtPoint(TREE, 250, 250, 1000, 1000);
    expect(hits.every((h) => h.id !== "root")).toBe(true);
  });

  it("returns an empty array when the doc has no frame children", () => {
    const emptyTree = root([]);
    expect(findFramesAtPoint(emptyTree, 500, 500, 1000, 1000)).toEqual([]);
  });

  it("handles point on a boundary (treats edge as inside)", () => {
    // A is 0..500 × 0..500 — point (0, 0) is on the corner.
    const hits = findFramesAtPoint(TREE, 0, 0, 1000, 1000);
    expect(hits.map((h) => h.id)).toEqual(["A"]);
  });
});
