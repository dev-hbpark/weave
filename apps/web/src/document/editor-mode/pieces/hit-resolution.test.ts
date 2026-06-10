// WI-166 P3 — HitPolicy piece tests. The selectTarget suites are the
// WI-033 A1/A2 + WI-163 `selectFromHit` specs migrated verbatim from
// document/interactions/selection-from-hit.test.ts (decommissioned in the
// same change — the algorithm moved into this piece). The moveTarget
// suites are new: they pin the free-placement deepest resolution (무회귀)
// and the page-bounded parent-first resolution (one-gesture select+move,
// 행동 변경 ③). NestedFrame / FrameStage integration is covered by the
// e2e (figma-parent-first-select / selection-follows-drag /
// editor-mode-hit specs).

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import type { HitMoveContext, HitSelectContext } from "../types.js";
import { ACTIVE_PAGE_HIT, DOC_ROOT_HIT } from "./hit-resolution.js";

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

/** selectTarget ctx shorthand — free-placement (no active page). */
function sel(intent: HitSelectContext["intent"], currentId?: string): HitSelectContext {
  return { intent, currentId, activePageId: undefined };
}

/** selectTarget ctx shorthand — page-bounded (active page set). */
function pageSel(
  intent: HitSelectContext["intent"],
  activePageId: string,
  currentId?: string,
): HitSelectContext {
  return { intent, currentId, activePageId };
}

// Tree:
//   root
//   ├── A
//   │   └── A1
//   │       └── A1a
//   └── B
const TREE = doc(frame("root", [frame("A", [frame("A1", [frame("A1a")])]), frame("B")]));

describe("DOC_ROOT_HIT.selectTarget — A1 parent-first auto-select (plain intent)", () => {
  it("clicking a top-level frame with no current selection → that top-level", () => {
    expect(DOC_ROOT_HIT.selectTarget("A", TREE, sel("plain"))).toBe("A");
  });

  it("clicking a deeply nested frame from outside-context → walks one level in (top-level)", () => {
    // Current selection is null → not in A's context → top-level on trail = "A".
    expect(DOC_ROOT_HIT.selectTarget("A1a", TREE, sel("plain"))).toBe("A");
  });

  it("clicking deeper while already in the context → drills to the leaf", () => {
    // Current selection is "A" — A1a's trail is [A, A1, A1a] which includes "A".
    expect(DOC_ROOT_HIT.selectTarget("A1a", TREE, sel("plain", "A"))).toBe("A1a");
  });

  it("clicking a sibling top-level frame → that sibling top-level (different context)", () => {
    // Current = "A". Click "B". B's trail = [B] which does NOT include "A".
    expect(DOC_ROOT_HIT.selectTarget("B", TREE, sel("plain", "A"))).toBe("B");
  });

  it("clicking the same already-selected frame → unchanged (frame's own trail contains itself)", () => {
    expect(DOC_ROOT_HIT.selectTarget("A", TREE, sel("plain", "A"))).toBe("A");
  });
});

// Sibling-context tree — separate fixture so the assertions about
// "sibling pick inside the entered frame" don't fight the single-chain
// shape of TREE.
//
//   root
//   └── P                       (a frame the user "enters")
//       ├── X                   (an item inside P)
//       ├── Y                   (sibling of X inside P)
//       └── N                   (a nested frame, also inside P)
//           └── Na              (leaf inside the nested frame)
//
// And one more top-level frame to test cross-context exits:
//
//   └── Z                       (sibling of P at root)
const SIB_TREE = doc(
  frame("root", [frame("P", [frame("X"), frame("Y"), frame("N", [frame("Na")])]), frame("Z")]),
);

describe("DOC_ROOT_HIT.selectTarget — sibling-of-current inside the same parent frame", () => {
  it("X selected → clicking Y (sibling inside P) drills directly to Y", () => {
    // Parent of X is P; P is on Y's trail → drill to Y. Once the user is
    // inside P, P acts as the local root.
    expect(DOC_ROOT_HIT.selectTarget("Y", SIB_TREE, sel("plain", "X"))).toBe("Y");
  });

  it("X selected → clicking nested frame N (sibling of X inside P) drills to N", () => {
    expect(DOC_ROOT_HIT.selectTarget("N", SIB_TREE, sel("plain", "X"))).toBe("N");
  });

  it("X selected → clicking deep leaf Na (inside N inside P) drills to Na", () => {
    // Na's trail = [P, N, Na]. P is the parent of X → in-context → drill.
    expect(DOC_ROOT_HIT.selectTarget("Na", SIB_TREE, sel("plain", "X"))).toBe("Na");
  });

  it("X selected → clicking Z (sibling of P at root) walks one level in (parent-first)", () => {
    // Z's trail = [Z]. X's parent is P, which is NOT on Z's trail. The
    // user is leaving P's context entirely → parent-first → Z.
    expect(DOC_ROOT_HIT.selectTarget("Z", SIB_TREE, sel("plain", "X"))).toBe("Z");
  });

  it("X selected → clicking P itself selects P (P is the parent of X → in-context)", () => {
    expect(DOC_ROOT_HIT.selectTarget("P", SIB_TREE, sel("plain", "X"))).toBe("P");
  });

  it("Na selected → clicking X (above the drilled depth) re-anchors at the top-level P", () => {
    // X's trail = [P, X]. Parent of Na = N, NOT on trail; Na itself NOT on
    // trail. The user is stepping back out — parent-first → P.
    expect(DOC_ROOT_HIT.selectTarget("X", SIB_TREE, sel("plain", "Na"))).toBe("P");
  });
});

describe("DOC_ROOT_HIT.selectTarget — A2 Cmd/Ctrl deep select (deep intent)", () => {
  it("Cmd-click on a leaf → that leaf, regardless of current selection", () => {
    expect(DOC_ROOT_HIT.selectTarget("A1a", TREE, sel("deep"))).toBe("A1a");
  });

  it("Cmd-click on a top-level → that top-level (deep is depth-blind, not depth-preferring)", () => {
    expect(DOC_ROOT_HIT.selectTarget("B", TREE, sel("deep"))).toBe("B");
  });

  it("Cmd-click from a foreign context still hits the leaf directly", () => {
    expect(DOC_ROOT_HIT.selectTarget("A1a", TREE, sel("deep", "B"))).toBe("A1a");
  });
});

describe("DOC_ROOT_HIT.selectTarget — toggle intent (Shift)", () => {
  it("toggle resolves to the click target so single-selection consumers stay coherent", () => {
    expect(DOC_ROOT_HIT.selectTarget("A1", TREE, sel("toggle", "B"))).toBe("A1");
  });
});

// WI-163 — page-bounded flavors resolve from the ACTIVE PAGE. The page is
// an ARTBOARD: plain/toggle hits on it resolve to null (background /
// not-multi-selectable), parent-first starts INSIDE it, and only Cmd/Ctrl
// deep keeps selecting it (page-fill escape hatch).
//
//   root
//   └── P            (the active page)
//       ├── X
//       └── N
//           └── Na
const PAGE_TREE = doc(frame("root", [frame("P", [frame("X"), frame("N", [frame("Na")])])]));

describe("ACTIVE_PAGE_HIT.selectTarget — WI-163 artboard context root", () => {
  it("plain hit ON the page → null (background click)", () => {
    expect(ACTIVE_PAGE_HIT.selectTarget("P", PAGE_TREE, pageSel("plain", "P"))).toBeNull();
  });

  it("plain hit on a deep leaf, no selection → first level INSIDE the page (not the page)", () => {
    // Na's trail = [P, N, Na]; without the context root this would pick P.
    expect(ACTIVE_PAGE_HIT.selectTarget("Na", PAGE_TREE, pageSel("plain", "P"))).toBe("N");
  });

  it("plain hit on a page-direct item, no selection → that item", () => {
    expect(ACTIVE_PAGE_HIT.selectTarget("X", PAGE_TREE, pageSel("plain", "P"))).toBe("X");
  });

  it("in-context drill is unchanged: N selected → clicking Na drills to Na", () => {
    expect(ACTIVE_PAGE_HIT.selectTarget("Na", PAGE_TREE, pageSel("plain", "P", "N"))).toBe("Na");
  });

  it("deep (Cmd/Ctrl) hit ON the page → the page (fill-editing escape hatch)", () => {
    expect(ACTIVE_PAGE_HIT.selectTarget("P", PAGE_TREE, pageSel("deep", "P"))).toBe("P");
  });

  it("toggle (Shift) hit ON the page → null (page never joins a multi-selection)", () => {
    expect(ACTIVE_PAGE_HIT.selectTarget("P", PAGE_TREE, pageSel("toggle", "P", "X"))).toBeNull();
  });

  it("toggle on an in-page item is unchanged", () => {
    expect(ACTIVE_PAGE_HIT.selectTarget("X", PAGE_TREE, pageSel("toggle", "P", "N"))).toBe("X");
  });

  it("undefined activePageId keeps the WI-033 model intact (top-level pick)", () => {
    // Empty-deck edge: no active page → behaves like the doc-root model.
    expect(ACTIVE_PAGE_HIT.selectTarget("Na", PAGE_TREE, sel("plain"))).toBe("P");
  });
});

describe("selectTarget — edge cases", () => {
  it("hit id not in the tree → null (caller falls back)", () => {
    expect(DOC_ROOT_HIT.selectTarget("missing", TREE, sel("plain"))).toBeNull();
  });

  it("hit id is the root → null (root is never selectable)", () => {
    expect(DOC_ROOT_HIT.selectTarget("root", TREE, sel("plain"))).toBeNull();
  });

  it("shape selections arrive as currentId: undefined → treated as no-context, walks one level in", () => {
    expect(DOC_ROOT_HIT.selectTarget("A1a", TREE, sel("plain", undefined))).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// moveTarget — drag-start resolution. climbToMovable / admit are consumer
// seams (LayoutEngine + capability∩lock); the fakes below stand in for them.
// ---------------------------------------------------------------------------

/** Identity climb (no layout containers) + admit-all except listed ids. */
function move(
  overrides: Partial<HitMoveContext> & { readonly rejected?: ReadonlyArray<string> } = {},
): HitMoveContext {
  const { rejected = [], ...rest } = overrides;
  return {
    currentId: undefined,
    activePageId: undefined,
    climbToMovable: (id) => id,
    admit: (id) => !rejected.includes(id),
    ...rest,
  };
}

describe("DOC_ROOT_HIT.moveTarget — free placement keeps the deepest resolution (무회귀)", () => {
  it("an unselected deep child is its own move target", () => {
    expect(DOC_ROOT_HIT.moveTarget("A1a", TREE, move())).toBe("A1a");
  });

  it("a layout-managed child climbs to its container", () => {
    const climbed = move({ climbToMovable: (id) => (id === "A1a" ? "A1" : id) });
    expect(DOC_ROOT_HIT.moveTarget("A1a", TREE, climbed)).toBe("A1");
  });

  it("a locked / immovable climbed target declines the move", () => {
    expect(DOC_ROOT_HIT.moveTarget("A1a", TREE, move({ rejected: ["A1a"] }))).toBeNull();
  });
});

describe("ACTIVE_PAGE_HIT.moveTarget — page-bounded parent-first (one-gesture select+move)", () => {
  it("drag on an unselected deep child aims at its page-direct ancestor", () => {
    // Na is two levels inside page P → the move target is N (page-direct),
    // exactly what a plain click would select. commitFrame then selects N
    // once per gesture → one-gesture select+move (행동 변경 ③).
    expect(ACTIVE_PAGE_HIT.moveTarget("Na", PAGE_TREE, move({ activePageId: "P" }))).toBe("N");
  });

  it("drag on a page-direct item moves that item", () => {
    expect(ACTIVE_PAGE_HIT.moveTarget("X", PAGE_TREE, move({ activePageId: "P" }))).toBe("X");
  });

  it("drag ON the page itself declines (falls through to the rubber band)", () => {
    expect(ACTIVE_PAGE_HIT.moveTarget("P", PAGE_TREE, move({ activePageId: "P" }))).toBeNull();
  });

  it("in-context drag drills like an in-context click: N selected → dragging Na moves Na", () => {
    expect(
      ACTIVE_PAGE_HIT.moveTarget("Na", PAGE_TREE, move({ activePageId: "P", currentId: "N" })),
    ).toBe("Na");
  });

  it("the parent-first pick still climbs + admits (a page-layout-managed pick climbing to the stage declines)", () => {
    // N climbs to the page P (e.g. the page owns a flex layout) and the
    // stage is not movable → null. The admission seam stays in charge.
    const ctx = move({
      activePageId: "P",
      climbToMovable: (id) => (id === "N" ? "P" : id),
      rejected: ["P"],
    });
    expect(ACTIVE_PAGE_HIT.moveTarget("Na", PAGE_TREE, ctx)).toBeNull();
  });

  it("undefined activePageId (empty deck) declines nothing exists to move", () => {
    // No active page → parent-first walks from the doc root; the pick is
    // the top-level page P itself, which admission rejects in real composi-
    // tions (stage role). With admit-all fakes the pick surfaces as P —
    // assert the resolution shape, the role gate lives in RolePolicy.
    expect(ACTIVE_PAGE_HIT.moveTarget("Na", PAGE_TREE, move())).toBe("P");
  });
});
