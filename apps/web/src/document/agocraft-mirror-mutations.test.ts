// WI-013 Phase 4 — pure-function mutation helpers on AgocraftDocument.

import {
  itemId as makeItemId,
  transactionId as makeTransactionId,
  unitId as makeUnitId,
} from "@agocraft/core";
import type { Change, Item as AgocraftItem, ItemMeta } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import {
  addChild,
  applyChangeToDocument,
  removeChild,
  toAgocraftDocument,
  updateAttrs,
  updateChild,
  updateUnitAttrs,
} from "./agocraft-mirror.js";
import { FULL_FRAME } from "./types.js";
import type { Document as WeaveDocument } from "./types.js";

const META: ItemMeta = {
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
  schemaVersion: 3,
};

function makeDoc(): ReturnType<typeof toAgocraftDocument> {
  const weave: WeaveDocument = {
    id: "test-doc",
    title: "Mutation harness",
    items: [
      {
        id: "slide-1",
        kind: "slide",
        attrs: { frame: FULL_FRAME, title: "Original", bullets: ["a"] },
        behaviors: [],
        createdAt: META.createdAt,
      },
    ],
    updatedAt: META.updatedAt,
    schemaVersion: 3,
  };
  return toAgocraftDocument(weave);
}

describe("agocraft mutation helpers (Phase 4)", () => {
  it("addChild appends an Item and bumps updatedAt", () => {
    const doc = makeDoc();
    const newItem: AgocraftItem = {
      id: makeItemId("slide-2"),
      kind: "slide",
      attrs: { frame: FULL_FRAME, title: "New", bullets: [] },
      units: [],
      children: [],
      meta: META,
    };
    const next = addChild(doc, newItem);
    expect(next.root.children).toHaveLength(2);
    expect(next.meta.updatedAt).not.toBe(doc.meta.updatedAt);
  });

  it("removeChild filters by string-equality of id", () => {
    const doc = makeDoc();
    const next = removeChild(doc, "slide-1");
    expect(next.root.children).toHaveLength(0);
  });

  it("updateChild only mutates the matching item", () => {
    const doc = makeDoc();
    const next = updateChild(doc, "slide-1", (item) => updateAttrs(item, { title: "Edited" }));
    const updated = next.root.children[0];
    expect(updated).toBeDefined();
    expect(updated?.attrs.title).toBe("Edited");
    // Original bullets array preserved (updateAttrs is a shallow merge).
    expect(updated?.attrs.bullets).toEqual(["a"]);
  });

  it("updateChild on a non-matching id is a no-op for that child", () => {
    const doc = makeDoc();
    const next = updateChild(doc, "ghost", (item) => updateAttrs(item, { title: "Edited" }));
    expect(next.root.children[0]?.attrs.title).toBe("Original");
  });

  it("applyChangeToDocument applies an item.attrs Change to the matching child", () => {
    const doc = makeDoc();
    const change: Change = {
      type: "item.attrs",
      itemId: makeItemId("slide-1"),
      before: { title: "Original", bullets: ["a"] },
      after: { title: "Reduced", bullets: ["a", "b"] },
      transactionId: makeTransactionId("tx-test"),
      timestamp: 0,
      origin: { kind: "user-command", commandName: "weave.item.update" },
    };
    const next = applyChangeToDocument(doc, change);
    expect(next.root.children[0]?.attrs.title).toBe("Reduced");
    expect(next.root.children[0]?.attrs.bullets).toEqual(["a", "b"]);
  });

  it("applyChangeToDocument applies a unit.attrs Change at path[0] to the matching unit", () => {
    const docWithUnit = updateChild(makeDoc(), "slide-1", (item) => ({
      ...item,
      units: [
        ...item.units,
        {
          id: makeUnitId("u-1"),
          kind: "camera-target",
          attrs: { behavior: { kind: "camera-target", id: "cam-1", order: 0 } },
          meta: { schemaVersion: 3 },
        },
      ],
    }));
    const change: Change = {
      type: "unit.attrs",
      itemId: makeItemId("slide-1"),
      unitId: makeUnitId("u-1"),
      unitKind: "camera-target",
      path: ["behavior"],
      before: { kind: "camera-target", id: "cam-1", order: 0 },
      after: { kind: "camera-target", id: "cam-1", order: 9 },
      transactionId: makeTransactionId("tx-test"),
      timestamp: 0,
      origin: { kind: "user-command", commandName: "weave.behavior.update" },
    };
    const next = applyChangeToDocument(docWithUnit, change);
    const child = next.root.children[0];
    const unit = child?.units.find((u) => String(u.id) === "u-1");
    expect((unit?.attrs.behavior as { order: number }).order).toBe(9);
  });

  it("applyChangeToDocument is a no-op for item.children / item.units kinds in this phase", () => {
    const doc = makeDoc();
    const change: Change = {
      type: "item.children",
      itemId: doc.root.id,
      added: [makeItemId("ghost")],
      removed: [],
      transactionId: makeTransactionId("tx-test"),
      timestamp: 0,
      origin: { kind: "user-command", commandName: "weave.item.add" },
    };
    const next = applyChangeToDocument(doc, change);
    expect(next.root.children).toHaveLength(doc.root.children.length);
  });

  it("updateUnitAttrs replaces only the matching unit's attrs", () => {
    const doc = makeDoc();
    // Add a unit, then mutate it.
    const withUnit = updateChild(doc, "slide-1", (item) => ({
      ...item,
      units: [
        ...item.units,
        {
          id: makeUnitId("u-1"),
          kind: "camera-target",
          attrs: { behavior: { kind: "camera-target", id: "cam-1", order: 0 } },
          meta: { schemaVersion: 3 },
        },
      ],
    }));
    const next = updateChild(withUnit, "slide-1", (item) =>
      updateUnitAttrs(item, "u-1", { behavior: { kind: "camera-target", id: "cam-1", order: 5 } }),
    );
    const child = next.root.children[0];
    const updatedUnit = child?.units.find((u) => String(u.id) === "u-1");
    expect(updatedUnit?.attrs.behavior).toEqual({
      kind: "camera-target",
      id: "cam-1",
      order: 5,
    });
  });
});
