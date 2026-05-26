// WI-033 A1+A2 — pure-function tests for `selectFromHit`. NestedFrame's
// onClick wires through this helper; the integration with React state is
// covered by the e2e (figma-parent-first-select.spec.ts +
// figma-cmd-click-deep-select.spec.ts).

import { itemId as makeItemId } from "@agocraft/core";
import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { selectFromHit, type Selection } from "./selection-context.js";

function frame(id: string, children: AgocraftItem[] = []): AgocraftItem {
  return {
    id: makeItemId(id),
    kind: "frame",
    attrs: {},
    units: [],
    children,
    meta: { createdAt: "t", updatedAt: "t", schemaVersion: 9 },
  };
}

function doc(root: AgocraftItem): AgocraftDocument {
  return {
    schemaVersion: 9,
    root,
  } as unknown as AgocraftDocument;
}

// Tree:
//   root
//   ├── A
//   │   └── A1
//   │       └── A1a
//   └── B
const TREE = doc(
  frame("root", [
    frame("A", [frame("A1", [frame("A1a")])]),
    frame("B"),
  ]),
);

const sel = (id: string): Selection => ({ kind: "frame", id });

describe("selectFromHit — A1 parent-first auto-select (plain intent)", () => {
  it("clicking a top-level frame with no current selection → that top-level", () => {
    const next = selectFromHit("A", "plain", TREE, null);
    expect(next).toEqual({ kind: "frame", id: "A" });
  });

  it("clicking a deeply nested frame from outside-context → walks one level in (top-level)", () => {
    const next = selectFromHit("A1a", "plain", TREE, null);
    // Current selection is null → not in A's context → return top-level on trail = "A".
    expect(next).toEqual({ kind: "frame", id: "A" });
  });

  it("clicking deeper while already in the context → drills to the leaf", () => {
    // Current selection is "A" — A1a's trail is [A, A1, A1a] which includes "A".
    const next = selectFromHit("A1a", "plain", TREE, sel("A"));
    expect(next).toEqual({ kind: "frame", id: "A1a" });
  });

  it("clicking a sibling top-level frame → that sibling top-level (different context)", () => {
    // Current = "A". Click "B". B's trail = [B] which does NOT include "A".
    const next = selectFromHit("B", "plain", TREE, sel("A"));
    expect(next).toEqual({ kind: "frame", id: "B" });
  });

  it("clicking the same already-selected frame → unchanged (frame's own trail contains itself)", () => {
    const next = selectFromHit("A", "plain", TREE, sel("A"));
    expect(next).toEqual({ kind: "frame", id: "A" });
  });
});

describe("selectFromHit — A2 Cmd/Ctrl deep select (deep intent)", () => {
  it("Cmd-click on a leaf → that leaf, regardless of current selection", () => {
    const next = selectFromHit("A1a", "deep", TREE, null);
    expect(next).toEqual({ kind: "frame", id: "A1a" });
  });

  it("Cmd-click on a top-level → that top-level (deep is depth-blind, not depth-preferring)", () => {
    const next = selectFromHit("B", "deep", TREE, null);
    expect(next).toEqual({ kind: "frame", id: "B" });
  });

  it("Cmd-click from a foreign context still hits the leaf directly", () => {
    const next = selectFromHit("A1a", "deep", TREE, sel("B"));
    expect(next).toEqual({ kind: "frame", id: "A1a" });
  });
});

describe("selectFromHit — toggle intent (Shift)", () => {
  it("toggle resolves to the click target so single-selection consumers stay coherent", () => {
    const next = selectFromHit("A1", "toggle", TREE, sel("B"));
    expect(next).toEqual({ kind: "frame", id: "A1" });
  });
});

describe("selectFromHit — edge cases", () => {
  it("hit id not in the tree → null (caller falls back)", () => {
    const next = selectFromHit("missing", "plain", TREE, null);
    expect(next).toBeNull();
  });

  it("hit id is the root → null (root is never selectable)", () => {
    const next = selectFromHit("root", "plain", TREE, null);
    expect(next).toBeNull();
  });

  it("current selection is a shape (not frame) → treated as no-context, walks one level in", () => {
    const shapeSel: Selection = { kind: "shape", frameId: "B", shapeId: "s1" };
    const next = selectFromHit("A1a", "plain", TREE, shapeSel);
    expect(next).toEqual({ kind: "frame", id: "A" });
  });
});
