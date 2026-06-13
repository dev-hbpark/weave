// WI-214 / DR-137 — pure-function tests for `buildBreadcrumb`. The
// integration with DesignPage's selectFrame + the bar rendering is covered
// by the e2e (figma-selection-breadcrumb.spec.ts).

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { buildBreadcrumb } from "./breadcrumb-trail.js";

function frame(
  id: string,
  attrs: { label?: string; title?: string },
  children: AgocraftItem[] = [],
): AgocraftItem {
  return {
    id: makeItemId(id),
    kind: "frame",
    attrs: {
      frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
      ...(attrs.label !== undefined ? { label: attrs.label } : {}),
      ...(attrs.title !== undefined ? { title: attrs.title } : {}),
    },
    units: [],
    children,
    meta: { createdAt: "t", updatedAt: "t", schemaVersion: 9 },
  };
}

function textItem(id: string, attrs: { title?: string }): AgocraftItem {
  return {
    id: makeItemId(id),
    kind: "text",
    attrs: { ...(attrs.title !== undefined ? { title: attrs.title } : {}) },
    units: [],
    children: [],
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

// root
//  └ A "Top"
//     └ B "Row"
//        └ C "Cell"  (text, title "Hello")
const TREE = root([
  frame("A", { label: "Top" }, [
    frame("B", { label: "Row" }, [textItem("C", { title: "Hello" })]),
  ]),
]);

describe("buildBreadcrumb", () => {
  it("returns the full top-down trail for a deeply nested selection", () => {
    const segs = buildBreadcrumb(TREE, "C");
    expect(segs.map((s) => s.id)).toEqual(["A", "B", "C"]);
    expect(segs.map((s) => s.label)).toEqual(["Top", "Row", "Hello"]);
  });

  it("marks only the last segment as current", () => {
    const segs = buildBreadcrumb(TREE, "C");
    expect(segs.map((s) => s.isCurrent)).toEqual([false, false, true]);
  });

  it("includes a mid-level frame as the current (last) segment when selected", () => {
    const segs = buildBreadcrumb(TREE, "B");
    expect(segs.map((s) => s.id)).toEqual(["A", "B"]);
    expect(segs[1]?.isCurrent).toBe(true);
  });

  it("returns [] for a top-level frame (no navigable ancestor)", () => {
    // trail = [A], length 1 → below the ≥2 gate (DR-137 §게이트).
    expect(buildBreadcrumb(TREE, "A")).toEqual([]);
  });

  it("returns [] for a missing id", () => {
    expect(buildBreadcrumb(TREE, "does-not-exist")).toEqual([]);
  });

  it("returns [] for null / undefined selection", () => {
    expect(buildBreadcrumb(TREE, null)).toEqual([]);
    expect(buildBreadcrumb(TREE, undefined)).toEqual([]);
  });

  it("never includes the synthetic design root as a segment", () => {
    const segs = buildBreadcrumb(TREE, "C");
    expect(segs.every((s) => s.id !== "root")).toBe(true);
  });

  it("prefers attrs.label, then title, then a localised kind name", () => {
    const tree = root([
      frame("P", { label: "Parent" }, [
        // no label, no title → localised kind name "프레임"
        frame("Q", {}, [textItem("R", { title: "Body" })]),
      ]),
    ]);
    const segs = buildBreadcrumb(tree, "R");
    expect(segs.map((s) => s.label)).toEqual(["Parent", "프레임", "Body"]);
  });
});
