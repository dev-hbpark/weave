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

  it("setZ stays a no-op (weave z-order is index/splice based, not numeric)", () => {
    const d = doc([frame("a", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(adapter.setZ("a", 5)).toEqual([]);
  });

  it("reorderLocalStack stays a no-op (peek mode commits via weave.design.reorderChildren)", () => {
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

  // WI-022 S1 — the four directional ops now return real `item.children.reorder`
  // Patches (splice within the item's direct parent). Convention: children[0] =
  // bottom, children[N-1] = top.
  function reorderAfter(patches: ReadonlyArray<{ type: string }>): string[] | "none" {
    if (patches.length === 0) return "none";
    const p = patches[0] as { type: string; itemId: unknown; after: ReadonlyArray<unknown> };
    expect(p.type).toBe("item.children.reorder");
    expect(String(p.itemId)).toBe("root");
    return p.after.map(String);
  }

  it("moveToTop splices the item to the end of its parent's children", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide"), frame("c", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(reorderAfter(adapter.moveToTop("a"))).toEqual(["b", "c", "a"]);
  });

  it("moveToBottom splices the item to the start", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide"), frame("c", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(reorderAfter(adapter.moveToBottom("c"))).toEqual(["c", "a", "b"]);
  });

  it("moveAbove places the item immediately above the target (higher index)", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide"), frame("c", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(reorderAfter(adapter.moveAbove("a", "c"))).toEqual(["b", "c", "a"]);
  });

  it("moveBelow places the item immediately below the target (lower index)", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide"), frame("c", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(reorderAfter(adapter.moveBelow("c", "a"))).toEqual(["c", "a", "b"]);
  });

  it("returns an empty Patch[] on a no-op (already at the boundary / one-element parent)", () => {
    const d = doc([frame("a", "slide"), frame("b", "slide"), frame("c", "slide")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(adapter.moveToTop("c")).toEqual([]); // already last
    expect(adapter.moveToBottom("a")).toEqual([]); // already first
    const solo = doc([frame("x", "slide")]);
    const soloAdapter = createDesignFrameZOrderAdapter({ getDocument: () => solo });
    expect(soloAdapter.moveToTop("x")).toEqual([]);
  });

  it("operates across mixed top-level kinds (one adapter serves all)", () => {
    const d = doc([frame("a", "slide"), frame("b", "canvas-design"), frame("c", "media")]);
    const adapter = createDesignFrameZOrderAdapter({ getDocument: () => d });
    expect(reorderAfter(adapter.moveToTop("b"))).toEqual(["a", "c", "b"]);
  });
});
