// Phase 10c — pure-function tests for presentation order reconciliation +
// reorder. The integration with `useDesign` and PresentPage is covered by e2e.

import type { Item as AgocraftItem } from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import {
  collectPresentationIds,
  effectivePresentationOrder,
  isSkippedFrame,
  presentationStepIds,
  reconcilePresentationOrder,
  reorder,
  reorderSet,
} from "./presentation-order.js";

function makeItem(
  id: string,
  kind: string,
  children: AgocraftItem[] = [],
  attrs: Record<string, unknown> = {},
): AgocraftItem {
  return {
    id: makeItemId(id),
    kind,
    attrs,
    units: [],
    children,
    meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 },
  };
}

describe("collectPresentationIds", () => {
  it("collects every nested frame in document order — design root excluded", () => {
    // WI-032 Phase 3 — single `frame` kind replaces the legacy 4.
    const root = makeItem("root", "weave-doc", [
      makeItem("a", "frame"),
      makeItem("b", "frame", [makeItem("c", "frame"), makeItem("d", "frame")]),
      makeItem("e", "frame"),
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
    const root = makeItem("root", "weave-doc", [makeItem("a", "frame"), makeItem("b", "frame")]);
    const design = {
      id: "d",
      title: "t",
      width: 1000,
      height: 1000,
      background: "#ffffff",
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

// WI-184 ⑪ — "skip in show" (PPT Hide Slide): the deck/rail keeps the frame,
// only present-mode stepping walks past it.
describe("isSkippedFrame / presentationStepIds", () => {
  function makeDesign(root: AgocraftItem, presentationOrder: string[]) {
    return {
      id: "d",
      title: "t",
      width: 1000,
      height: 1000,
      background: "#ffffff",
      document: {
        id: "d",
        schema: undefined as never,
        root,
        meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 as const, schemaRefs: [] },
      },
      presentationOrder,
      meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 as const },
    };
  }

  it("isSkippedFrame: true only for attrs.skipped === true", () => {
    expect(isSkippedFrame(makeItem("a", "frame"))).toBe(false);
    expect(isSkippedFrame(makeItem("a", "frame", [], { skipped: false }))).toBe(false);
    expect(isSkippedFrame(makeItem("a", "frame", [], { skipped: true }))).toBe(true);
  });

  it("skipped frames stay in the deck order but drop out of the step list", () => {
    const root = makeItem("root", "weave-doc", [
      makeItem("a", "frame"),
      makeItem("b", "frame", [], { skipped: true }),
      makeItem("c", "frame"),
    ]);
    const design = makeDesign(root, ["c", "b", "a"]);
    expect(effectivePresentationOrder(design)).toEqual(["c", "b", "a"]);
    expect(presentationStepIds(design)).toEqual(["c", "a"]);
  });

  it("identical to the deck order when nothing is skipped (incl. nested frames)", () => {
    const root = makeItem("root", "weave-doc", [
      makeItem("a", "frame", [makeItem("b", "frame")]),
      makeItem("c", "frame"),
    ]);
    const design = makeDesign(root, []);
    expect(presentationStepIds(design)).toEqual(["a", "b", "c"]);
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

// WI-184 ⑨ — multi-select drag: the whole set moves as a contiguous block.
describe("reorderSet", () => {
  it("dragging right lands the block AFTER the target (mirrors reorder's splice)", () => {
    // drag started on "a" (idx 0), set {a,c}, dropped on "d" (idx 3)
    expect(reorderSet(["a", "b", "c", "d", "e"], new Set(["a", "c"]), 0, 3)).toEqual([
      "b",
      "d",
      "a",
      "c",
      "e",
    ]);
  });
  it("dragging left lands the block BEFORE the target", () => {
    // drag started on "d" (idx 3), set {d,e}, dropped on "b" (idx 1)
    expect(reorderSet(["a", "b", "c", "d", "e"], new Set(["d", "e"]), 3, 1)).toEqual([
      "a",
      "d",
      "e",
      "b",
      "c",
    ]);
  });
  it("block keeps DECK order, not click order (set is unordered)", () => {
    expect(reorderSet(["a", "b", "c", "d"], new Set(["c", "a"]), 2, 3)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });
  it("no-ops when the drop target is a member of the moved set (incl. from === to)", () => {
    const order = ["a", "b", "c"];
    expect(reorderSet(order, new Set(["a", "b"]), 0, 1)).toEqual(order);
    expect(reorderSet(order, new Set(["a"]), 0, 0)).toEqual(order);
  });
  it("no-ops out-of-range or an empty/foreign set", () => {
    const order = ["a", "b", "c"];
    expect(reorderSet(order, new Set(["a"]), 0, 5)).toEqual(order);
    expect(reorderSet(order, new Set(["a"]), -1, 1)).toEqual(order);
    expect(reorderSet(order, new Set<string>(), 0, 1)).toEqual(order);
    expect(reorderSet(order, new Set(["zz"]), 0, 1)).toEqual(order);
  });
});
