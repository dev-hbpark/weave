// WI-166 / DR-114 P1 — registry + RolePolicy unit tests. The registry rows
// must reproduce the prior scattered predicates exactly (P1 acceptance =
// zero behavior change): `isArtboardId` ⇔ roleOf === "stage", and the
// WI-163/WI-164 artboard gates ⇔ STAGE capabilities.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import type { DocFlavor } from "../types.js";
import { EDITOR_MODES, editorModeFor } from "./registry.js";
import { capabilityOf, type RolePolicy } from "./types.js";

function makeItem(id: string, kind: string, children: AgocraftItem[] = []): AgocraftItem {
  return {
    id: makeItemId(id),
    kind,
    attrs: {},
    units: [],
    children,
    meta: { createdAt: "t", updatedAt: "t", schemaVersion: 5 },
  };
}

function makeDoc(children: AgocraftItem[]): AgocraftDocument {
  return { root: makeItem("root", "weave-doc", children) } as AgocraftDocument;
}

const FLAVORS: DocFlavor[] = ["mixed", "slide-deck", "canvas-board", "doc-page"];

describe("EDITOR_MODES registry (DR-114)", () => {
  it("covers every DocFlavor (exhaustive record, one row per flavor)", () => {
    for (const f of FLAVORS) expect(EDITOR_MODES[f]).toBeDefined();
  });

  it("declares the per-flavor canvas mode (mixed/canvas-board infinite, slide-deck/doc-page page-bounded)", () => {
    expect(editorModeFor("mixed").mode).toBe("infinite");
    expect(editorModeFor("canvas-board").mode).toBe("infinite");
    expect(editorModeFor("slide-deck").mode).toBe("page-bounded");
    expect(editorModeFor("doc-page").mode).toBe("page-bounded");
  });

  it("defaults an undefined / unknown legacy flavor to mixed", () => {
    expect(editorModeFor(undefined)).toBe(EDITOR_MODES.mixed);
    expect(editorModeFor("legacy-unknown" as DocFlavor)).toBe(EDITOR_MODES.mixed);
  });
});

describe("RolePolicy (WI-163 absorbed predicate)", () => {
  const doc = makeDoc([makeItem("page-1", "frame", [makeItem("child-1", "frame")])]);

  it("free-placement flavors: every item is an element (no stage)", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      const { roles } = editorModeFor(f);
      expect(roles.roleOf(doc, "page-1")).toBe("element");
      expect(roles.roleOf(doc, "child-1")).toBe("element");
    }
  });

  it("page-bounded flavors: root-direct item = stage, descendants = element", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      const { roles } = editorModeFor(f);
      expect(roles.roleOf(doc, "page-1")).toBe("stage");
      expect(roles.roleOf(doc, "child-1")).toBe("element");
      expect(roles.roleOf(doc, "not-in-doc")).toBe("element");
    }
  });

  it("stage capabilities reproduce the WI-163/WI-164 artboard gates", () => {
    const caps = capabilityOf(editorModeFor("slide-deck").roles, doc, "page-1");
    expect(caps).toEqual({
      movable: false,
      resizable: false,
      rotatable: false,
      deletable: false,
      navigable: false,
      hoverable: false,
      quickActions: false,
      canvasHandles: false,
      selectable: "deep-only",
    });
  });

  it("element capabilities allow everything (lock stays orthogonal)", () => {
    const caps = capabilityOf(editorModeFor("slide-deck").roles, doc, "child-1");
    expect(
      Object.entries(caps).every(([k, v]) => (k === "selectable" ? v === "normal" : v === true)),
    ).toBe(true);
  });

  it("consumers depend on the interface only — a fake policy injects without the registry (DR-114 §2b)", () => {
    // The DI payoff: no flavor, no React tree, no registry — a consumer-side
    // test hands `capabilityOf` (the consumer call pattern) a hand-rolled
    // policy and observes the gate flip.
    const everythingIsStage: RolePolicy = {
      roleOf: () => "stage",
      capabilities: editorModeFor("slide-deck").roles.capabilities,
    };
    expect(capabilityOf(everythingIsStage, doc, "child-1").movable).toBe(false);
    expect(capabilityOf(everythingIsStage, doc, "child-1").selectable).toBe("deep-only");
  });
});

// ─── P2 policies (WI-166 P2 / DR-114 §3-§4) ────────────────────────────────
// View / Camera / Insertion / Rail rows must reproduce the prior scattered
// `infiniteCanvas` / FORMAT_EDITOR_CONFIG behavior exactly, except the two
// approved rail changes (mixed loses "+", page-bounded rail loses the
// non-slide section / slide toggle / focus eye — DR-114 §4).

describe("ViewPolicy (P2-a)", () => {
  const doc = makeDoc([makeItem("page-1", "frame"), makeItem("page-2", "frame")]);

  it("infinite flavors: all frames visible (undefined), no page chrome, culling on", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      const { view } = editorModeFor(f);
      expect(view.visibleFrames(doc, "page-1")).toBeUndefined();
      expect(view.pageChrome).toBe(false);
      expect(view.viewportCulling).toBe(true);
    }
  });

  it("page-bounded flavors: only the active page renders, page chrome on, culling off", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      const { view } = editorModeFor(f);
      expect(view.visibleFrames(doc, "page-1")).toEqual(new Set(["page-1"]));
      expect(view.pageChrome).toBe(true);
      expect(view.viewportCulling).toBe(false);
    }
  });

  it("page-bounded with no active page renders nothing-filtered (undefined — the empty-deck matte edge)", () => {
    expect(editorModeFor("slide-deck").view.visibleFrames(doc, undefined)).toBeUndefined();
  });
});

describe("CameraPolicy (P2-a)", () => {
  it("infinite flavors: free pan/zoom/drag, 0.9 fit padding, no page fit", () => {
    const doc = makeDoc([makeItem("page-1", "frame")]);
    for (const f of ["mixed", "canvas-board"] as const) {
      const { camera } = editorModeFor(f);
      expect(camera.userZoom).toBe(true);
      expect(camera.dragPan).toBe(true);
      expect(camera.paddingFactor).toBe(0.9);
      expect(camera.fitBox(doc, "page-1", 1280, 720)).toBeUndefined();
    }
  });

  it("page-bounded flavors: wheel zoom stays, hand/Space drag does not, 0.95 fit padding", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      const { camera } = editorModeFor(f);
      expect(camera.userZoom).toBe(true);
      expect(camera.dragPan).toBe(false);
      expect(camera.paddingFactor).toBe(0.95);
    }
  });

  it("clampPan is identity on every flavor today (free pan — clamping is a future row)", () => {
    const proposed = { tx: -9999, ty: 12345, scale: 0.07 };
    for (const f of FLAVORS) {
      const { camera } = editorModeFor(f);
      expect(camera.clampPan({ tx: 0, ty: 0, scale: 1 }, proposed)).toEqual(proposed);
    }
  });
});

describe("InsertionPolicy (P2-c)", () => {
  const doc = makeDoc([makeItem("page-1", "frame")]);

  it("infinite flavors insert at the root (undefined container)", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      expect(editorModeFor(f).insertion.containerFor(doc, "page-1")).toBeUndefined();
    }
  });

  it("page-bounded flavors insert into the active page", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      expect(editorModeFor(f).insertion.containerFor(doc, "page-1")).toBe("page-1");
      expect(editorModeFor(f).insertion.containerFor(doc, undefined)).toBeUndefined();
    }
  });

  it("pasteCoord (WI-185 ⑫): free placement = cursor, page-bounded = source-position", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      expect(editorModeFor(f).insertion.pasteCoord).toBe("cursor");
    }
    for (const f of ["slide-deck", "doc-page"] as const) {
      expect(editorModeFor(f).insertion.pasteCoord).toBe("source-position");
    }
  });
});

describe("InsertionPolicy.addContainerFor (WI-180 — selection-aware explicit add)", () => {
  // page-1 holds a group frame and a text leaf; the group holds a leaf.
  const doc = makeDoc([
    makeItem("page-1", "frame", [
      makeItem("group-1", "frame", [makeItem("deep-text", "text")]),
      makeItem("text-1", "text"),
    ]),
  ]);

  it("infinite flavors: a selected frame captures the add; anything else → root", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      const { insertion } = editorModeFor(f);
      expect(insertion.addContainerFor(doc, undefined, "group-1")).toBe("group-1");
      expect(insertion.addContainerFor(doc, undefined, "page-1")).toBe("page-1");
      // Non-frame selection / no selection / stale id → design root.
      expect(insertion.addContainerFor(doc, undefined, "text-1")).toBeUndefined();
      expect(insertion.addContainerFor(doc, undefined, undefined)).toBeUndefined();
      expect(insertion.addContainerFor(doc, undefined, "gone")).toBeUndefined();
    }
  });

  it("page-bounded flavors: the ACTIVE PAGE always — sub-page frames are groups", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      const { insertion } = editorModeFor(f);
      // Even with a (group-)frame or leaf selected, the add lands on the page.
      expect(insertion.addContainerFor(doc, "page-1", "group-1")).toBe("page-1");
      expect(insertion.addContainerFor(doc, "page-1", "text-1")).toBe("page-1");
      expect(insertion.addContainerFor(doc, "page-1", "deep-text")).toBe("page-1");
      expect(insertion.addContainerFor(doc, "page-1", undefined)).toBe("page-1");
      // Empty deck edge — no active page → root fallback, same as containerFor.
      expect(insertion.addContainerFor(doc, undefined, "group-1")).toBeUndefined();
    }
  });
});

describe("RailPolicy (P2-b — DR-114 §4 tables, incl. the 2 approved behavior changes)", () => {
  it("infinite flavors: overview rail — sections/toggle/focus, NO page lifecycle (change ①: mixed loses '+')", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      expect(editorModeFor(f).rail).toEqual({
        visible: true,
        nonSlideSection: true,
        slideToggle: true,
        focusCycle: true,
        addPage: false,
        duplicatePage: false,
        deletePage: true,
        clickActivatesPage: false,
        // WI-189 — deck curation is set-shaped; set duplicate stays hidden
        // via the independent duplicatePage gate.
        multiSelect: true,
        // WI-189 — frame-attrs rows only; no page-lifecycle rows.
        tileMenuRows: new Set(["rename", "skipInShow"]),
      });
    }
  });

  it("page-bounded flavors: lifecycle rail — add/duplicate/activate, NO overview affordances (change ②)", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      expect(editorModeFor(f).rail).toEqual({
        visible: true,
        nonSlideSection: false,
        slideToggle: false,
        focusCycle: false,
        addPage: true,
        duplicatePage: true,
        deletePage: true,
        clickActivatesPage: true,
        // WI-184 ⑨ — rail multi-select (set duplicate/delete/reorder).
        multiSelect: true,
        // WI-184 ⑪ / WI-189 — full menu: frame-attrs + page-lifecycle rows.
        tileMenuRows: new Set(["rename", "skipInShow", "newPageAfter", "editBackground"]),
      });
    }
  });
});

describe("DeckPolicy (WI-194 / DR-127 — what the deck is made of)", () => {
  function makeAttrItem(
    id: string,
    kind: string,
    attrs: Record<string, unknown>,
    children: AgocraftItem[] = [],
  ): AgocraftItem {
    return { ...makeItem(id, kind, children), attrs };
  }
  // root → page-1 (frame, contains nested-1 frame + shape-1)
  //      → page-2 (frame, presentable:false — mixed-era deck exclusion)
  //      → shape-root (non-frame at root)
  const root = makeDoc([
    makeAttrItem("page-1", "frame", {}, [
      makeAttrItem("nested-1", "frame", {}),
      makeAttrItem("shape-1", "shape", {}),
    ]),
    makeAttrItem("page-2", "frame", { presentable: false }),
    makeAttrItem("shape-root", "shape", {}),
  ]).root;

  it("free-placement flavors: any-depth candidates minus presentable:false (WI-072 unchanged)", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      const { deck } = editorModeFor(f);
      expect(deck.collectCandidateIds(root)).toEqual(["page-1", "nested-1"]);
      // opted-out top-level frames keep their own present scene (link targets)
      expect(deck.collectNonStepSceneIds(root)).toEqual(["page-2"]);
      // a presentable nested frame owns its scene → parent tree skips it
      const nested = root.children[0]?.children[0];
      if (nested === undefined) throw new Error("fixture");
      expect(deck.childOwnsScene(nested)).toBe(true);
      // present cross-scene z-order context: above occludes (hidden),
      // below is soft background (blur)
      expect(deck.sceneVisibility("above")).toBe("hidden");
      expect(deck.sceneVisibility("below")).toBe("blur");
    }
  });

  it("page-bounded flavors: root-direct frames only, presentable IGNORED (structure is the meaning)", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      const { deck } = editorModeFor(f);
      // nested-1 is a group, not a slide; page-2's stale mixed-era stamp
      // cannot hide a root page (no recovery UI exists on this rail).
      expect(deck.collectCandidateIds(root)).toEqual(["page-1", "page-2"]);
      expect(deck.collectNonStepSceneIds(root)).toEqual([]);
      // nested frames never own a scene → they render INLINE in their
      // page's scene (skipping them would punch a hole in the slide)
      const nested = root.children[0]?.children[0];
      if (nested === undefined) throw new Error("fixture");
      expect(deck.childOwnsScene(nested)).toBe(false);
      // self-contained full-bleed slides: no z-order context — every
      // non-active scene is hidden (no blur) so the active slide shows cleanly
      expect(deck.sceneVisibility("above")).toBe("hidden");
      expect(deck.sceneVisibility("below")).toBe("hidden");
    }
  });
});

describe("HitPolicy (P3 — registry-level composition; resolution details in pieces/hit-resolution.test.ts)", () => {
  // root → page-1 → child-1 (page-direct) → grand-1 (deep)
  const hitDoc = makeDoc([
    makeItem("page-1", "frame", [makeItem("child-1", "frame", [makeItem("grand-1", "frame")])]),
  ]);
  const moveCtx = {
    currentId: undefined,
    activePageId: "page-1",
    climbToMovable: (id: string) => id,
    admit: () => true,
  };

  it("infinite flavors: drag on an unselected deep child moves THAT child (무회귀)", () => {
    for (const f of ["mixed", "canvas-board"] as const) {
      expect(editorModeFor(f).hit.moveTarget("grand-1", hitDoc, moveCtx)).toBe("grand-1");
    }
  });

  it("page-bounded flavors: drag on an unselected deep child moves its PAGE-DIRECT ancestor (행동 변경 ③)", () => {
    for (const f of ["slide-deck", "doc-page"] as const) {
      expect(editorModeFor(f).hit.moveTarget("grand-1", hitDoc, moveCtx)).toBe("child-1");
    }
  });

  it("select and move resolve identically on page-bounded flavors (select = move = parent-first)", () => {
    const hit = editorModeFor("slide-deck").hit;
    const selected = hit.selectTarget("grand-1", hitDoc, {
      intent: "plain",
      currentId: undefined,
      activePageId: "page-1",
    });
    expect(selected).toBe("child-1");
    expect(hit.moveTarget("grand-1", hitDoc, moveCtx)).toBe(selected);
  });
});

describe("InputPolicy (P4 — FSM gate tables; hook-side injection in interactions/interaction-mode.test.tsx)", () => {
  // P4 acceptance = zero behavior change: every flavor's tables must be a
  // 1:1 transcription of the pre-P4 hardcoded hook bodies.
  it("every flavor composes the standard gate tables (no flavor variance today)", () => {
    for (const f of FLAVORS) {
      const { gates } = editorModeFor(f).input;
      expect(gates.tooltips).toEqual(new Set(["idle", "hand"]));
      expect(gates.frameSelection).toEqual(new Set(["idle"]));
      expect(gates.editAffordances).toEqual(new Set(["idle"]));
      expect(gates.selectionChrome).toEqual(
        new Set(["idle", "frame-manipulating", "text-editing"]),
      );
      expect(gates.frameDragBindings).toEqual(
        new Set(["idle", "rubber-band", "frame-manipulating", "text-editing"]),
      );
    }
  });

  it("frameDragBindings keeps the self-claimed gesture modes admitted (closure-orphan guard)", () => {
    // These modes are entered BY the drag bindings' own FSM claims —
    // dropping any of them from the admit set would unregister the binding
    // mid-gesture and orphan its in-flight pointermove/pointerup closure.
    for (const f of FLAVORS) {
      const set = editorModeFor(f).input.gates.frameDragBindings;
      for (const m of ["rubber-band", "frame-manipulating", "text-editing"] as const) {
        expect(set.has(m)).toBe(true);
      }
    }
  });

  it("idle is admitted by every gate on every flavor (the no-provider fallback's invariant)", () => {
    // interaction-mode.tsx returns `true` for all gates when rendered
    // without a provider, on the grounds that the mode is pinned `idle`
    // there. That shortcut is only sound while idle passes every gate.
    for (const f of FLAVORS) {
      for (const set of Object.values(editorModeFor(f).input.gates)) {
        expect(set.has("idle")).toBe(true);
      }
    }
  });
});
