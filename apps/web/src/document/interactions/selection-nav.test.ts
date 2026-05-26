// WI-033 A3 — pure-function tests for the four keyboard navigation
// helpers (firstChildOf / parentOf / nextSiblingOf / prevSiblingOf).
// The hotkey wiring through editor-hotkeys.ts + DesignPage is covered
// by the e2e (figma-keyboard-selection-nav.spec.ts).

import { itemId as makeItemId } from "@agocraft/core";
import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import {
  firstChildOf,
  nextSiblingOf,
  parentOf,
  prevSiblingOf,
} from "./selection-context.js";

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

// Tree (siblings ordered A, B, C; A has nested A1 → A1a; A1 has sibling A2):
//   root
//   ├── A
//   │   ├── A1
//   │   │   └── A1a
//   │   └── A2
//   ├── B
//   └── C
const TREE = doc(
  frame("root", [
    frame("A", [frame("A1", [frame("A1a")]), frame("A2")]),
    frame("B"),
    frame("C"),
  ]),
);

describe("firstChildOf — Enter drill-down", () => {
  it("returns the first child of a parent frame", () => {
    expect(firstChildOf("A", TREE)).toBe("A1");
  });

  it("returns the only child when there's just one", () => {
    expect(firstChildOf("A1", TREE)).toBe("A1a");
  });

  it("returns undefined for a leaf (no children)", () => {
    expect(firstChildOf("A1a", TREE)).toBeUndefined();
  });

  it("returns undefined for a missing id", () => {
    expect(firstChildOf("missing", TREE)).toBeUndefined();
  });
});

describe("parentOf — Shift+Enter drill-up", () => {
  it("returns the parent for a nested frame", () => {
    expect(parentOf("A1a", TREE)).toBe("A1");
  });

  it("returns the parent at the second level", () => {
    expect(parentOf("A1", TREE)).toBe("A");
  });

  it("returns undefined for a top-level frame (root has no selectable parent)", () => {
    expect(parentOf("A", TREE)).toBeUndefined();
  });

  it("returns undefined for a missing id", () => {
    expect(parentOf("missing", TREE)).toBeUndefined();
  });
});

describe("nextSiblingOf — Tab", () => {
  it("returns the next sibling at the same level", () => {
    expect(nextSiblingOf("A", TREE)).toBe("B");
    expect(nextSiblingOf("B", TREE)).toBe("C");
    expect(nextSiblingOf("A1", TREE)).toBe("A2");
  });

  it("wraps around — last sibling → first sibling", () => {
    expect(nextSiblingOf("C", TREE)).toBe("A");
    expect(nextSiblingOf("A2", TREE)).toBe("A1");
  });

  it("returns the same id when the parent has a single child", () => {
    // A1's parent A has children [A1, A2]; A1a's parent A1 has only [A1a].
    expect(nextSiblingOf("A1a", TREE)).toBe("A1a");
  });

  it("returns undefined for a missing id", () => {
    expect(nextSiblingOf("missing", TREE)).toBeUndefined();
  });
});

describe("prevSiblingOf — Shift+Tab", () => {
  it("returns the previous sibling at the same level", () => {
    expect(prevSiblingOf("B", TREE)).toBe("A");
    expect(prevSiblingOf("C", TREE)).toBe("B");
    expect(prevSiblingOf("A2", TREE)).toBe("A1");
  });

  it("wraps around — first sibling → last sibling", () => {
    expect(prevSiblingOf("A", TREE)).toBe("C");
    expect(prevSiblingOf("A1", TREE)).toBe("A2");
  });

  it("returns the same id when the parent has a single child", () => {
    expect(prevSiblingOf("A1a", TREE)).toBe("A1a");
  });

  it("returns undefined for a missing id", () => {
    expect(prevSiblingOf("missing", TREE)).toBeUndefined();
  });
});
