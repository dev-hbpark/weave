import type { Document, Item } from "@agocraft/core";
import { itemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { createDesignFrameZOrderAdapter } from "./design-frame.zorder.js";

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

describe("createDesignFrameZOrderAdapter", () => {
  it("readZ returns the index in root.children", () => {
    const d = doc([frame("a", "slide"), frame("b", "canvas-design"), frame("c", "block-doc")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(adapter.getZ("a")).toBe(0);
    expect(adapter.getZ("b")).toBe(1);
    expect(adapter.getZ("c")).toBe(2);
  });

  it("readZ returns -1 for unknown items", () => {
    const d = doc([frame("a", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(adapter.getZ("ghost")).toBe(-1);
  });

  it("writeZ returns empty Patch[] (Phase 2 — reducer extension pending)", () => {
    const d = doc([frame("a", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(adapter.setZ("a", 5)).toEqual([]);
  });

  it("reorderLocalStack returns empty Patch[] (Phase 2)", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(adapter.reorderLocalStack(["b", "a"])).toEqual([]);
  });

  it("readZ reflects document mutations through the getDocument closure", () => {
    let d = doc([frame("a", "slide"), frame("b", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(adapter.getZ("b")).toBe(1);
    // simulate doc replacement (reorder happened externally)
    d = doc([frame("b", "slide"), frame("a", "slide")]);
    expect(adapter.getZ("b")).toBe(0);
    expect(adapter.getZ("a")).toBe(1);
  });

  it("moveToTop uses listSiblings to find the max sibling z (returns empty Patch in Phase 2)", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide"), frame("c", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    // Phase 2 returns empty Patch; verify the call path doesn't throw.
    expect(adapter.moveToTop("a")).toEqual([]);
    expect(adapter.moveToBottom("c")).toEqual([]);
    expect(adapter.moveAbove("a", "c")).toEqual([]);
    expect(adapter.moveBelow("c", "a")).toEqual([]);
  });

  it("listSiblings (via default reorderLocalStack contract) sees all root.children", () => {
    const d = doc([frame("a", "slide"), frame("b", "canvas-design"), frame("c", "media")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    // moveToTop default reads sibling z range; verify the path runs cleanly
    // across mixed kinds (all 4 top-level kinds share the adapter).
    expect(() => adapter.moveToTop("b")).not.toThrow();
  });
});
