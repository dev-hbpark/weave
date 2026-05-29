import type { Document, Item } from "@agocraft/core";
import { itemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { reorderRootChildren } from "../agocraft-mirror.js";

function frame(id: string, kind: string): Item {
  return {
    id: itemId(id),
    kind,
    attrs: {},
    units: [],
    children: [],
    meta: {
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:00:00.000Z",
      schemaVersion: 1,
    },
  };
}

function doc(children: Item[]): Document {
  return {
    id: "doc1",
    schema: { kinds: new Map(), unitKinds: new Map() } as unknown as Document["schema"],
    root: {
      id: itemId("root"),
      kind: "weave-doc",
      attrs: {},
      units: [],
      children,
      meta: {
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z",
        schemaVersion: 1,
      },
    },
    meta: {
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:00:00.000Z",
      schemaVersion: 1,
      schemaRefs: [],
    },
  };
}

describe("reorderRootChildren", () => {
  it("reorders children in z-ascending order per orderedAsc", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide"), frame("c", "slide")]);
    const next = reorderRootChildren(d, ["c", "a", "b"]);
    expect(next.root.children.map((c) => String(c.id))).toEqual(["c", "a", "b"]);
  });

  it("keeps items not in orderedAsc at the end of the result", () => {
    const d = doc([
      frame("a", "slide"),
      frame("b", "slide"),
      frame("c", "slide"),
      frame("d", "slide"),
    ]);
    // Only b and d are in the local stack
    const next = reorderRootChildren(d, ["d", "b"]);
    // b, d reordered first; a, c retain their relative order at end.
    expect(next.root.children.map((c) => String(c.id))).toEqual(["d", "b", "a", "c"]);
  });

  it("returns the same document instance when the order is already correct", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide")]);
    const next = reorderRootChildren(d, ["a", "b"]);
    expect(next).toBe(d);
  });

  it("ignores unknown ids in orderedAsc", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide")]);
    const next = reorderRootChildren(d, ["ghost", "b", "a"]);
    // ghost is filtered out (not in children); b, a reorder applies.
    expect(next.root.children.map((c) => String(c.id))).toEqual(["b", "a"]);
  });

  it("empty orderedAsc is a no-op", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide")]);
    expect(reorderRootChildren(d, [])).toBe(d);
  });

  it("updates the document-level meta.updatedAt when a real change happens", () => {
    // WI-022 S1: the @agocraft/core reorder helper is clock-free; weave stamps
    // the doc-level `meta.updatedAt` (the persistence-freshness contract) via
    // the host shim. Per-node timestamps are no longer bumped on a live edit.
    const d = doc([frame("a", "slide"), frame("b", "slide")]);
    const next = reorderRootChildren(d, ["b", "a"]);
    expect(next.meta.updatedAt).not.toBe(d.meta.updatedAt);
  });
});
