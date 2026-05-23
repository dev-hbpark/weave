// Phase 10c — pure-function tests for presentation order reconciliation +
// reorder. The integration with `useDesign` and PresentPage is covered by e2e.

import { itemId as makeItemId } from "@agocraft/core";
import type { Item as AgocraftItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import {
  collectPresentationIds,
  effectivePresentationOrder,
  reconcilePresentationOrder,
  reorder,
} from "./presentation-order.js";

function makeItem(id: string, kind: string, children: AgocraftItem[] = []): AgocraftItem {
  return {
    id: makeItemId(id),
    kind,
    attrs: {},
    units: [],
    children,
    meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 },
  };
}

describe("collectPresentationIds", () => {
  it("collects every nested frame in document order — design root excluded", () => {
    // Phase 12d — the design itself isn't a slide; only the frames are.
    const root = makeItem("root", "weave-doc", [
      makeItem("a", "slide"),
      makeItem("b", "canvas-design", [
        makeItem("c", "slide"),
        makeItem("d", "block-doc"),
      ]),
      makeItem("e", "media"),
    ]);
    expect(collectPresentationIds(root)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("reconcilePresentationOrder", () => {
  it("keeps saved order, prunes stale, appends missing in document order", () => {
    const saved = ["b", "e", "x-stale", "c"];
    const present = ["b", "c", "e", "f-new"];
    expect(reconcilePresentationOrder(saved, present)).toEqual(["b", "e", "c", "f-new"]);
  });

  it("identity when saved equals present", () => {
    const saved = ["root", "a", "b"];
    const present = ["root", "a", "b"];
    expect(reconcilePresentationOrder(saved, present)).toEqual(["root", "a", "b"]);
  });
});

describe("effectivePresentationOrder", () => {
  it("uses tree + saved order to derive final order", () => {
    const root = makeItem("root", "weave-doc", [
      makeItem("a", "slide"),
      makeItem("b", "slide"),
    ]);
    const design = {
      id: "d",
      title: "t",
      width: 1000,
      height: 1000,
      document: {
        id: "d",
        schema: undefined as never,
        root,
        meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 as const, schemaRefs: [] },
      },
      presentationOrder: ["b", "a"],
      meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 as const },
    };
    expect(effectivePresentationOrder(design)).toEqual(["b", "a"]);
  });
});

describe("reorder", () => {
  it("moves from one index to another", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("no-ops out-of-range or same", () => {
    expect(reorder(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(reorder(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(reorder(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});
