// WI-039 — buildFrameTree + resolvePickerTargetId. Pure helpers for
// the "Move to…" ContextMenu sub-menu.

import type { Item as AgocraftItem } from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { addChild, toAgocraftDocument } from "../agocraft-mirror.js";
import type { Item, Document as WeaveDocument } from "../types.js";
import { FULL_FRAME } from "../types.js";
import { buildFrameTree, resolvePickerTargetId } from "./frame-tree.js";

const META_DATE = "2026-05-27T00:00:00Z";

function frameWith(id: string, attrs: Record<string, unknown> = {}): Item {
  return {
    id,
    kind: "frame",
    attrs: { frame: FULL_FRAME, ...attrs },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
}

function nestedFrame(id: string, attrs: Record<string, unknown> = {}): AgocraftItem {
  return {
    id: makeItemId(id),
    kind: "frame",
    attrs: { frame: FULL_FRAME, ...attrs },
    units: [],
    children: [],
    meta: {
      createdAt: META_DATE,
      updatedAt: META_DATE,
      schemaVersion: 9,
    } as AgocraftItem["meta"],
  };
}

/** root
 *  ├─ p1
 *  │   ├─ c1
 *  │   └─ c2
 *  └─ p2 */
function makeDoc() {
  const weave: WeaveDocument = {
    id: "doc",
    title: "doc",
    items: [frameWith("p1", { name: "Parent 1" }), frameWith("p2")],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  let doc = toAgocraftDocument(weave);
  doc = addChild(doc, nestedFrame("c1"), "p1");
  doc = addChild(doc, nestedFrame("c2", { title: "Child 2" }), "p1");
  return doc;
}

describe("WI-039 — buildFrameTree", () => {
  it("first row is the synthetic root with id '@root' and depth 0", () => {
    const tree = buildFrameTree(makeDoc(), []);
    expect(tree[0]).toMatchObject({ id: "@root", depth: 0, disabled: false });
  });

  it("emits a depth-first walk: root → p1 → c1 → c2 → p2", () => {
    const tree = buildFrameTree(makeDoc(), []);
    expect(tree.map((r) => r.id)).toEqual(["@root", "p1", "c1", "c2", "p2"]);
    expect(tree.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1]);
  });

  it("uses attrs.name when present (Parent 1)", () => {
    const tree = buildFrameTree(makeDoc(), []);
    const p1 = tree.find((r) => r.id === "p1");
    expect(p1?.label).toBe("Parent 1");
  });

  it("falls back to attrs.title when name is absent (Child 2)", () => {
    const tree = buildFrameTree(makeDoc(), []);
    const c2 = tree.find((r) => r.id === "c2");
    expect(c2?.label).toBe("Child 2");
  });

  it("falls back to 'kind · shortId' when neither name nor title is set", () => {
    const tree = buildFrameTree(makeDoc(), []);
    const c1 = tree.find((r) => r.id === "c1");
    expect(c1?.label).toMatch(/^frame · /);
  });

  it("disables the moved item itself and all its descendants", () => {
    const tree = buildFrameTree(makeDoc(), ["p1"]);
    const byId = new Map(tree.map((r) => [r.id, r] as const));
    expect(byId.get("p1")?.disabled).toBe(true);
    expect(byId.get("c1")?.disabled).toBe(true);
    expect(byId.get("c2")?.disabled).toBe(true);
    // Siblings stay enabled.
    expect(byId.get("p2")?.disabled).toBe(false);
    expect(byId.get("@root")?.disabled).toBe(false);
  });

  it("unions disabled set across multiple moved items", () => {
    const tree = buildFrameTree(makeDoc(), ["c1", "p2"]);
    const byId = new Map(tree.map((r) => [r.id, r] as const));
    expect(byId.get("c1")?.disabled).toBe(true);
    expect(byId.get("p2")?.disabled).toBe(true);
    expect(byId.get("c2")?.disabled).toBe(false);
    expect(byId.get("p1")?.disabled).toBe(false);
  });
});

describe("WI-039 — resolvePickerTargetId", () => {
  it("'@root' resolves to the document's root id", () => {
    const doc = makeDoc();
    expect(resolvePickerTargetId(doc, "@root")).toBe(String(doc.root.id));
  });

  it("frame ids pass through unchanged", () => {
    const doc = makeDoc();
    expect(resolvePickerTargetId(doc, "p1")).toBe("p1");
    expect(resolvePickerTargetId(doc, "c1")).toBe("c1");
  });
});
