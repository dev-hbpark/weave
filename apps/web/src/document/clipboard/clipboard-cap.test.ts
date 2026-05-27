// WI-041 Phase 4 — MAX_PASTE_NODES cap behaviour, unit-test layer.
//
// The e2e equivalent (a 501-node subtree round-trip) does not fit in
// Playwright's per-test timeout because every `addFrame` round-trip is
// O(ms). Here we synthesise the subtree directly and assert the count
// + gate decision are correct.

import type { SerializedItem } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { countSubtreeNodes, MAX_PASTE_NODES } from "./clipboard-types.js";

function makeItem(id: string, children: SerializedItem[] = []): SerializedItem {
  return {
    id,
    kind: "shape",
    attrs: {},
    units: [],
    children,
    meta: {
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
      schemaVersion: 1,
    } as unknown as SerializedItem["meta"],
  };
}

describe("WI-041 Phase 4 — countSubtreeNodes", () => {
  it("counts a single leaf as 1", () => {
    expect(countSubtreeNodes(makeItem("a"))).toBe(1);
  });

  it("counts root + N children correctly", () => {
    const root = makeItem("root", [makeItem("c1"), makeItem("c2"), makeItem("c3")]);
    expect(countSubtreeNodes(root)).toBe(4);
  });

  it("walks nested subtrees (3 levels)", () => {
    const root = makeItem("r", [makeItem("a", [makeItem("a-x"), makeItem("a-y")]), makeItem("b")]);
    // r + a + a-x + a-y + b = 5
    expect(countSubtreeNodes(root)).toBe(5);
  });

  it("counts MAX_PASTE_NODES exactly when synthesised at the cap", () => {
    // Build a flat tree of MAX_PASTE_NODES - 1 children under a single
    // root; total = MAX_PASTE_NODES.
    const children: SerializedItem[] = [];
    for (let i = 0; i < MAX_PASTE_NODES - 1; i++) {
      children.push(makeItem(`c${i}`));
    }
    const root = makeItem("root", children);
    expect(countSubtreeNodes(root)).toBe(MAX_PASTE_NODES);
  });

  it("counts MAX_PASTE_NODES + 1 when one extra child is added (gate trips)", () => {
    const children: SerializedItem[] = [];
    for (let i = 0; i < MAX_PASTE_NODES; i++) {
      children.push(makeItem(`c${i}`));
    }
    const root = makeItem("root", children);
    const total = countSubtreeNodes(root);
    expect(total).toBe(MAX_PASTE_NODES + 1);
    expect(total > MAX_PASTE_NODES).toBe(true); // gate trips
  });
});
