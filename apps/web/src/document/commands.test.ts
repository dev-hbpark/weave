// Phase 2 + Phase 4b — weave.* command behavior.
// Direct commands (add/remove/reset) forward to targets.X.
// Patch-emitting commands (updateItem/updateShape/removeShape/updateBehavior)
// compute Patches from ctx.document and do NOT touch targets.X.

import type {
  Document as AgocraftDocument,
  Item as AgocraftItem,
  CommandContext,
} from "@agocraft/core";
import { itemId as makeItemId } from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import {
  absoluteFrameTransform,
  addChild,
  applyChangeToDocument,
  computeReparentFrameRatio,
  toAgocraftDocument,
} from "./agocraft-mirror.js";
import {
  buildWeaveCommands,
  createPendingCreations,
  type WeaveCommandTargets,
} from "./commands.js";
import type { CameraTargetBehavior, Item, Document as WeaveDocument } from "./types.js";
import { FULL_FRAME } from "./types.js";

function spyTargets() {
  // WI-032 Phase 3b — `updateShape` / `removeShape` removed alongside the
  // legacy `canvas-design` kind.
  const targets: WeaveCommandTargets = {
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    updateBehavior: vi.fn(),
    reset: vi.fn(),
  };
  return targets;
}

const META_DATE = "2026-05-22T00:00:00Z";

function makeCtx(): CommandContext {
  const cam: CameraTargetBehavior = {
    kind: "camera-target",
    id: "cam-1",
    position: { x: 0, y: 0 },
    scale: 1,
    order: 0,
  };
  // WI-032 Phase 3 — these tests predate the frame-only paradigm and still
  // exercise legacy slide / canvas-design Item shapes. The `unknown` cast
  // keeps the test data intact (so we observe legacy behavior through the
  // reducer / migration) without polluting the post-Phase-3 DomainKind
  // union.
  const slideItem = {
    id: "slide-1",
    kind: "slide",
    attrs: { frame: FULL_FRAME, title: "Hello", bullets: ["a"] },
    behaviors: [cam],
    createdAt: META_DATE,
  } as unknown as Item;
  const canvasItem = {
    id: "canvas-1",
    kind: "canvas-design",
    attrs: {
      frame: FULL_FRAME,
      summary: "",
      shapes: [
        { id: "s-1", x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0, hue: "var(--a)" },
      ],
    },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
  const weave: WeaveDocument = {
    id: "doc-1",
    title: "Test",
    items: [slideItem, canvasItem],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  const doc: AgocraftDocument = toAgocraftDocument(weave);
  return {
    document: doc,
    resolve: () => null as never,
    skipRelations: false,
  };
}

// Nested-tree fixture — a top-level frame with one nested child frame.
// Used by the "delete a nested item" regression tests below. Kept as a
// separate helper so the legacy `makeCtx` shape (rooted at slide /
// canvas-design Items) stays untouched.
function makeNestedCtx(): CommandContext {
  const cam: CameraTargetBehavior = {
    kind: "camera-target",
    id: "cam-n",
    position: { x: 0, y: 0 },
    scale: 1,
    order: 0,
  };
  const child: Item = {
    id: "child-1",
    kind: "frame",
    attrs: { frame: FULL_FRAME },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
  const parent: Item = {
    id: "parent-1",
    kind: "frame",
    attrs: { frame: FULL_FRAME },
    behaviors: [cam],
    createdAt: META_DATE,
  } as unknown as Item;
  const weave: WeaveDocument = {
    id: "doc-nested",
    title: "Nested",
    items: [parent],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  // Build the doc with `parent` at root and then add `child` underneath
  // it using the same `addChild` helper the host uses, so the structure
  // matches what `findParentAndIndex` sees in production.
  const root = toAgocraftDocument(weave);
  const childAgocraft = {
    id: makeItemId("child-1"),
    kind: "frame",
    attrs: child.attrs as unknown as AgocraftItem["attrs"],
    units: [],
    children: [] as ReadonlyArray<AgocraftItem>,
    meta: { createdAt: META_DATE, updatedAt: META_DATE, schemaVersion: 9 },
  } as unknown as AgocraftItem;
  const doc: AgocraftDocument = addChild(root, childAgocraft, "parent-1");
  return {
    document: doc,
    resolve: () => null as never,
    skipRelations: false,
  };
}

describe("buildWeaveCommands — direct (Phase 2)", () => {
  it("weave.item.add calls targets.addItem and returns empty patches", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.item.add");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { kind: "slide" });
    expect(targets.addItem).toHaveBeenCalledWith("slide");
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toEqual([]);
  });

  it("weave.item.remove calls targets.removeItem and emits an item.children removal patch", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.item.remove");
    if (cmd === undefined) throw new Error("command not found");
    const ctx = makeCtx();
    const rootId = String(ctx.document.root.id);
    const result = cmd.run(ctx, { itemId: "slide-1" });
    expect(targets.removeItem).toHaveBeenCalledWith("slide-1");
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    expect(patch).toMatchObject({
      type: "item.children",
      itemId: makeItemId(rootId),
      removed: [makeItemId("slide-1")],
    });
  });

  // Regression — WI-XXX: nested items were silently failing to delete
  // because the command always built the removal patch against the
  // caller's `containerId` (defaulting to root). The patch then targeted
  // root.children and the reducer's deep walk could find no `itemId` to
  // strip there. Fix: derive the actual parent from the itemId.
  it("weave.item.remove derives the actual parent for a nested item", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.item.remove");
    if (cmd === undefined) throw new Error("command not found");
    const ctx = makeNestedCtx();
    const result = cmd.run(ctx, { itemId: "child-1" });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error?.code ?? "?"}`);
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    // The patch must target the *parent frame*, not the root.
    expect(patch).toMatchObject({
      type: "item.children",
      itemId: makeItemId("parent-1"),
      removed: [makeItemId("child-1")],
    });
  });

  it("weave.item.remove ignores a wrong containerId hint and still derives the right parent", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.item.remove");
    if (cmd === undefined) throw new Error("command not found");
    const ctx = makeNestedCtx();
    const rootId = String(ctx.document.root.id);
    // Caller passes the wrong containerId (root) — the command must
    // still emit a patch against the actual parent.
    const result = cmd.run(ctx, { itemId: "child-1", containerId: rootId });
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    expect(patch).toMatchObject({ itemId: makeItemId("parent-1") });
  });

  it("weave.item.remove fails when the itemId is not in the doc", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.item.remove");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { itemId: "does-not-exist" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("item-not-found");
    }
  });

  it("weave.doc.reset calls targets.reset and emits no patches", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.doc.reset");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), undefined);
    expect(targets.reset).toHaveBeenCalledOnce();
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toEqual([]);
  });
});

describe("buildWeaveCommands — patch-emitting (Phase 4b)", () => {
  it("weave.item.update returns an item.attrs Patch with before/after — no targets call", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.item.update");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), {
      itemId: "slide-1",
      patch: (it: Item) => ({ ...it, attrs: { ...it.attrs, title: "Updated" } as never }),
    });
    expect(targets.updateItem).not.toHaveBeenCalled();
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect(patch.before).toEqual({ frame: FULL_FRAME, title: "Hello", bullets: ["a"] });
    expect(patch.after).toEqual({ frame: FULL_FRAME, title: "Updated", bullets: ["a"] });
  });

  // WI-032 Phase 3 — `weave.shape.update` and `weave.shape.remove` were
  // removed alongside the legacy `canvas-design` kind. Their replacement
  // is the generic `weave.item.update` against a `shape` primitive Item.

  it("weave.behavior.update returns a unit.attrs Patch with path=['behavior']", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.behavior.update");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), {
      itemId: "slide-1",
      behaviorId: "cam-1",
      patch: (b: CameraTargetBehavior) => ({ ...b, label: "Renamed" }),
    });
    expect(targets.updateBehavior).not.toHaveBeenCalled();
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "unit.attrs") throw new Error("expected unit.attrs");
    expect(patch.path).toEqual(["behavior"]);
    expect((patch.after as CameraTargetBehavior).label).toBe("Renamed");
  });

  it("returns a fail() result when the target item or unit is missing", () => {
    const targets = spyTargets();
    const cmds = buildWeaveCommands(targets);
    const itemUpdate = cmds.find((c) => c.name === "weave.item.update");
    if (itemUpdate === undefined) throw new Error("command not found");
    const result = itemUpdate.run(makeCtx(), {
      itemId: "ghost",
      patch: (it: Item) => it,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("item-not-found");
  });
});

// ── WI-030 — weave.preset.insertSlide ───────────────────────────────────────
//
// Verifies the core feasibility claim (FR-003 §F1): a multi-item preset
// resolves to ONE staged AgocraftItem whose `children` carry the full
// layout, plus ONE `item.children` patch on the root → a single history
// entry. `Cmd+Z` reverting the entire subtree is the natural consequence.

describe("weave.preset.insertSlide (WI-030 Phase 1)", () => {
  it("stages a slide with populated children and emits one item.children patch", () => {
    const targets = spyTargets();
    const pending = createPendingCreations();
    const cmds = buildWeaveCommands(targets, pending);
    const cmd = cmds.find((c) => c.name === "weave.preset.insertSlide");
    if (cmd === undefined) throw new Error("command not found");

    const result = cmd.run(makeCtx(), { presetId: "cover.bold" });
    expect(targets.addItem).not.toHaveBeenCalled();
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);

    // Exactly one patch — single history entry contract.
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.children") {
      throw new Error("expected item.children");
    }
    expect(patch.added).toHaveLength(1);
    expect(patch.removed).toHaveLength(0);
    const stagedId = patch.added[0];
    if (stagedId === undefined) throw new Error("missing staged id");
    expect(String(stagedId)).toBe(result.value);

    // Staged root carries the children — FR-003 §F1. WI-032 Phase 4 — root
    // kind is now `frame` (the canvas container of the new paradigm); the
    // preset name "insertSlide" is preserved as the command's identifier
    // but the emitted Item is a frame.
    const stagedSlide = pending.lookup(String(stagedId));
    if (stagedSlide === undefined) throw new Error("root not staged");
    expect(stagedSlide.kind).toBe("frame");
    expect(stagedSlide.children.length).toBeGreaterThan(1);
    // cover.bold = accent-bar (shape) + title + subtitle + meta (3 texts).
    expect(stagedSlide.children).toHaveLength(4);
    const kinds = stagedSlide.children.map((c) => c.kind);
    expect(kinds).toContain("shape");
    expect(kinds.filter((k) => k === "text")).toHaveLength(3);
  });

  it("uses the host fallback when no pending side-channel is wired", () => {
    const targets = spyTargets();
    const cmds = buildWeaveCommands(targets);
    const cmd = cmds.find((c) => c.name === "weave.preset.insertSlide");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { presetId: "cover.bold" });
    if (!result.ok) throw new Error("expected ok");
    // WI-032 Phase 3 — fallback now seeds a `frame` (the new canvas
    // container) instead of a legacy `slide`.
    expect(targets.addItem).toHaveBeenCalledWith("frame");
    expect(result.patches).toEqual([]);
  });

  it("fails with preset-not-found for an unknown preset id", () => {
    const targets = spyTargets();
    const pending = createPendingCreations();
    const cmds = buildWeaveCommands(targets, pending);
    const cmd = cmds.find((c) => c.name === "weave.preset.insertSlide");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { presetId: "does.not.exist" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("preset-not-found");
  });

  it("resolves to a unique stable id per child (no collisions within one preset)", () => {
    const targets = spyTargets();
    const pending = createPendingCreations();
    const cmds = buildWeaveCommands(targets, pending);
    const cmd = cmds.find((c) => c.name === "weave.preset.insertSlide");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { presetId: "cover.hero" });
    if (!result.ok) throw new Error("expected ok");
    const slide = pending.lookup(String(result.value));
    if (slide === undefined) throw new Error("slide not staged");
    const ids = slide.children.map((c) => String(c.id));
    expect(new Set(ids).size).toBe(ids.length);
    // The slide's own id should also be distinct from any child id.
    expect(ids).not.toContain(String(slide.id));
  });
});

// ── WI-038 — Per-item z-order commands ─────────────────────────────────────
//
// Verifies the four commands emit a single `item.children.reorder` patch
// against the selected item's direct parent — so the same dispatch works
// both for top-level frames (parent = root) and primitives nested inside
// a frame (parent = that frame). Tests cover the four moves on each level
// plus the no-op boundary cases.

describe("z-order commands (WI-038)", () => {
  function flatFrame(id: string): Item {
    return {
      id,
      kind: "frame",
      attrs: { frame: FULL_FRAME },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
  }
  function nestedAgoItem(id: string, kind: string): AgocraftItem {
    return {
      id: makeItemId(id),
      kind,
      attrs: { frame: FULL_FRAME },
      units: [],
      children: [],
      meta: {
        createdAt: META_DATE,
        updatedAt: META_DATE,
        schemaVersion: 9,
      } as AgocraftItem["meta"],
    };
  }

  function makeZOrderCtx(): CommandContext {
    // Doc: root has 3 frames [a, b, c]. Frame `b` then gains 2 nested
    // children [b-1, b-2] via the agocraft-level `addChild` helper —
    // weave's flat Item type doesn't carry `children`, so we attach the
    // nested subtree after the flat seed.
    const weave: WeaveDocument = {
      id: "doc-z",
      title: "Z",
      items: [flatFrame("a"), flatFrame("b"), flatFrame("c")],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    let doc = toAgocraftDocument(weave);
    doc = addChild(doc, nestedAgoItem("b-1", "shape"), "b");
    doc = addChild(doc, nestedAgoItem("b-2", "shape"), "b");
    return {
      document: doc,
      resolve: () => null as never,
      skipRelations: false,
    };
  }

  function runZ(
    name: string,
    itemId: string,
  ): {
    after?: ReadonlyArray<string>;
    before?: ReadonlyArray<string>;
    patches: number;
  } {
    const cmds = buildWeaveCommands(spyTargets());
    const cmd = cmds.find((c) => c.name === name);
    if (cmd === undefined) throw new Error(`command not found: ${name}`);
    const result = cmd.run(makeZOrderCtx(), { itemId });
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
    if (result.patches.length === 0) return { patches: 0 };
    const patch = result.patches[0]!;
    if (patch.type !== "item.children.reorder") {
      throw new Error(`expected item.children.reorder, got ${patch.type}`);
    }
    return {
      patches: result.patches.length,
      before: patch.before.map(String),
      after: patch.after.map(String),
    };
  }

  it("bringForward at root: [a,b,c] / b → [a,c,b]", () => {
    expect(runZ("weave.item.bringForward", "b").after).toEqual(["a", "c", "b"]);
  });
  it("sendBackward at root: [a,b,c] / b → [b,a,c]", () => {
    expect(runZ("weave.item.sendBackward", "b").after).toEqual(["b", "a", "c"]);
  });
  it("bringToFront at root: [a,b,c] / a → [b,c,a]", () => {
    expect(runZ("weave.item.bringToFront", "a").after).toEqual(["b", "c", "a"]);
  });
  it("sendToBack at root: [a,b,c] / c → [c,a,b]", () => {
    expect(runZ("weave.item.sendToBack", "c").after).toEqual(["c", "a", "b"]);
  });

  it("bringForward no-op at front: c is already the topmost → empty patches", () => {
    expect(runZ("weave.item.bringForward", "c").patches).toBe(0);
  });
  it("sendBackward no-op at back: a is already the bottommost → empty patches", () => {
    expect(runZ("weave.item.sendBackward", "a").patches).toBe(0);
  });
  it("bringToFront no-op when already at front", () => {
    expect(runZ("weave.item.bringToFront", "c").patches).toBe(0);
  });
  it("sendToBack no-op when already at back", () => {
    expect(runZ("weave.item.sendToBack", "a").patches).toBe(0);
  });

  it("nested: bringForward on b-1 reorders inside frame b, not root", () => {
    const result = runZ("weave.item.bringForward", "b-1");
    expect(result.before).toEqual(["b-1", "b-2"]);
    expect(result.after).toEqual(["b-2", "b-1"]);
  });

  it("nested: sendToBack on b-2 reorders inside frame b", () => {
    const result = runZ("weave.item.sendToBack", "b-2");
    expect(result.after).toEqual(["b-2", "b-1"]);
  });

  it("fails with item-not-found when the target is missing", () => {
    const cmds = buildWeaveCommands(spyTargets());
    const cmd = cmds.find((c) => c.name === "weave.item.bringToFront");
    if (cmd === undefined) throw new Error("not found");
    const result = cmd.run(makeZOrderCtx(), { itemId: "ghost" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("item-not-found");
  });

  it("emits the correct parent container itemId in the patch", () => {
    const cmds = buildWeaveCommands(spyTargets());
    const cmd = cmds.find((c) => c.name === "weave.item.bringForward");
    if (cmd === undefined) throw new Error("not found");
    const ctx = makeZOrderCtx();
    // Root-level reorder → container itemId equals doc.root.id
    const rootResult = cmd.run(ctx, { itemId: "a" });
    if (!rootResult.ok) throw new Error("expected ok");
    const rootPatch = rootResult.patches[0]!;
    if (rootPatch.type !== "item.children.reorder") throw new Error("wrong kind");
    expect(String(rootPatch.itemId)).toBe(String(ctx.document.root.id));
    // Nested reorder → container itemId equals frame b
    const nestedResult = cmd.run(ctx, { itemId: "b-1" });
    if (!nestedResult.ok) throw new Error("expected ok");
    const nestedPatch = nestedResult.patches[0]!;
    if (nestedPatch.type !== "item.children.reorder") throw new Error("wrong kind");
    expect(String(nestedPatch.itemId)).toBe("b");
  });
});

// ─── WI-039 — weave.item.reparent ─────────────────────────────────────────

describe("weave.item.reparent (WI-039)", () => {
  function frameWith(
    id: string,
    frame: { x: number; y: number; width: number; height: number },
  ): Item {
    return {
      id,
      kind: "frame",
      attrs: { frame },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
  }
  function nestedFrame(
    id: string,
    frame: { x: number; y: number; width: number; height: number; rotation?: number },
  ): AgocraftItem {
    return {
      id: makeItemId(id),
      kind: "frame",
      attrs: { frame },
      units: [],
      children: [],
      meta: {
        createdAt: META_DATE,
        updatedAt: META_DATE,
        schemaVersion: 9,
      } as AgocraftItem["meta"],
    };
  }

  /** Doc layout:
   *   root
   *   ├─ p1 (frame, full)
   *   │   └─ c1  (frame, x:0.1 y:0.1 w:0.2 h:0.2)
   *   └─ p2 (frame, x:0.5 y:0.5 w:0.5 h:0.5)
   */
  function makeReparentCtx(): CommandContext {
    const weave: WeaveDocument = {
      id: "doc-rp",
      title: "Reparent",
      items: [
        frameWith("p1", { x: 0, y: 0, width: 0.5, height: 1 }),
        frameWith("p2", { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }),
      ],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    let doc = toAgocraftDocument(weave);
    doc = addChild(doc, nestedFrame("c1", { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }), "p1");
    return {
      document: doc,
      resolve: () => null as never,
      skipRelations: false,
    };
  }

  function runReparent(
    ctx: CommandContext,
    entries: ReadonlyArray<{ itemId: string; newParentId: string }>,
  ): ReturnType<ReturnType<typeof buildWeaveCommands>[number]["run"]> {
    const cmds = buildWeaveCommands(spyTargets());
    const cmd = cmds.find((c) => c.name === "weave.item.reparent");
    if (cmd === undefined) throw new Error("weave.item.reparent not found");
    return cmd.run(ctx, { entries } as never);
  }

  it("single entry: child frame → other frame, single patch with newFrameRatio computed", () => {
    const ctx = makeReparentCtx();
    const result = runReparent(ctx, [{ itemId: "c1", newParentId: "p2" }]);
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0]!;
    if (patch.type !== "item.reparent") throw new Error("wrong patch type");
    expect(patch.entries).toHaveLength(1);
    const e = patch.entries[0]!;
    expect(String(e.itemId)).toBe("c1");
    expect(String(e.oldParentId)).toBe("p1");
    expect(e.oldIndex).toBe(0);
    expect(String(e.newParentId)).toBe("p2");
    expect(e.newIndex).toBe(0); // p2 had no children before

    // Old c1 inside p1 was at absolute (0*1+0.1*0.5, 0*1+0.1*1) = (0.05, 0.1)
    // size 0.2 * 0.5 wide, 0.2 * 1 tall → (0.1 wide, 0.2 tall).
    // p2 absolute box = (0.5, 0.5, 0.5, 0.5).
    // New ratio = (0.05 - 0.5)/0.5 = -0.9, (0.1 - 0.5)/0.5 = -0.8,
    //             w 0.1/0.5 = 0.2, h 0.2/0.5 = 0.4.
    expect(e.newFrameRatio.x).toBeCloseTo(-0.9, 5);
    expect(e.newFrameRatio.y).toBeCloseTo(-0.8, 5);
    expect(e.newFrameRatio.width).toBeCloseTo(0.2, 5);
    expect(e.newFrameRatio.height).toBeCloseTo(0.4, 5);
    // Old ratio = the item's current attrs.frame
    expect(e.oldFrameRatio).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
  });

  it("preserves a rotated item's angle when both parents are unrotated", () => {
    // Regression: reparent used to drop `frame.rotation`, so a rotated
    // item snapped back to 0° after moving frames. p1 and p2 are both
    // unrotated, so the item's own rotation must carry over verbatim.
    const ctx = makeReparentCtx();
    let doc = ctx.document;
    doc = addChild(
      doc,
      nestedFrame("cr", { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0.6 }),
      "p1",
    );
    const ctx2: CommandContext = { ...ctx, document: doc };
    const result = runReparent(ctx2, [{ itemId: "cr", newParentId: "p2" }]);
    if (!result.ok) throw new Error("expected ok");
    const patch = result.patches[0]!;
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = patch.entries.find((x) => String(x.itemId) === "cr")!;
    expect(e.newFrameRatio.rotation).toBeCloseTo(0.6, 5);
  });

  it("compensates rotation so the on-screen angle is fixed when the new parent is rotated", () => {
    // New parent p3 is rotated 0.5 rad; a child rotated 0.6 rad relative to
    // the (unrotated) old parent must become 0.6 - 0.5 = 0.1 rad own-rotation
    // so its absolute on-screen angle (0.6) is unchanged after the move.
    const ctx = makeReparentCtx();
    let doc = ctx.document;
    doc = addChild(
      doc,
      nestedFrame("cr", { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0.6 }),
      "p1",
    );
    doc = addChild(
      doc,
      nestedFrame("p3", { x: 0.6, y: 0.6, width: 0.3, height: 0.3, rotation: 0.5 }),
      String(doc.root.id),
    );
    const ctx2: CommandContext = { ...ctx, document: doc };
    const result = runReparent(ctx2, [{ itemId: "cr", newParentId: "p3" }]);
    if (!result.ok) throw new Error("expected ok");
    const patch = result.patches[0]!;
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = patch.entries.find((x) => String(x.itemId) === "cr")!;
    expect(e.newFrameRatio.rotation).toBeCloseTo(0.1, 5);
  });

  it("computeReparentFrameRatio preserves the visual center across a rotated, non-square ancestor", () => {
    // Design 200×100. Parent P = (0,0,0.5,1) → a 100×100 px box, rotated 90°.
    // Child C = (0,0,0.5,0.5) inside P → 50×50 px. P's 90° rotation swings C's
    // visual center to (75,25) px. Reparenting C → root must reproduce exactly
    // that center (not the axis-aligned (25,25) the old box math would give).
    const ctx = makeReparentCtx();
    const rootId = String(ctx.document.root.id);
    let doc = ctx.document;
    doc = addChild(
      doc,
      nestedFrame("Prot", { x: 0, y: 0, width: 0.5, height: 1, rotation: Math.PI / 2 }),
      rootId,
    );
    doc = addChild(doc, nestedFrame("Crot", { x: 0, y: 0, width: 0.5, height: 0.5 }), "Prot");
    const r = computeReparentFrameRatio(doc, "Crot", rootId, 200, 100);
    if (r === null) throw new Error("expected a ratio");
    // center (75,25) px → ratios of 200×100: cx 0.375, cy 0.25; size 0.25×0.5.
    expect(r.x).toBeCloseTo(0.25, 5); // 0.375 - 0.25/2
    expect(r.y).toBeCloseTo(0, 5); // 0.25 - 0.5/2
    expect(r.width).toBeCloseTo(0.25, 5);
    expect(r.height).toBeCloseTo(0.5, 5);
    expect(r.rotation).toBeCloseTo(Math.PI / 2, 5);
  });

  it("reparenting a rotated item carries its child SUBTREE without moving it on-screen", () => {
    // A (rotated 30°) holds child C. Reparenting A from root into p2 must leave
    // C's ABSOLUTE center + angle untouched — the subtree rides along, and the
    // rotation-aware new frame keeps A's visual box fixed, so C (a ratio of A)
    // is preserved without any per-child fix-up.
    const ctx = makeReparentCtx();
    const rootId = String(ctx.document.root.id);
    let doc = ctx.document;
    doc = addChild(
      doc,
      nestedFrame("A", { x: 0.5, y: 0.1, width: 0.3, height: 0.3, rotation: Math.PI / 6 }),
      rootId,
    );
    doc = addChild(doc, nestedFrame("C", { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }), "A");
    const W = 800;
    const H = 600;
    const beforeC = absoluteFrameTransform(doc, "C", W, H);
    if (beforeC === null) throw new Error("C not found");

    const cmds = buildWeaveCommands(spyTargets());
    const cmd = cmds.find((c) => c.name === "weave.item.reparent");
    if (cmd === undefined) throw new Error("reparent cmd missing");
    const result = cmd.run({ ...ctx, document: doc }, {
      entries: [{ itemId: "A", newParentId: "p2" }],
      designWidth: W,
      designHeight: H,
    } as never);
    if (!result.ok) throw new Error("expected ok");
    let next = doc;
    for (const p of result.patches) next = applyChangeToDocument(next, p as never);

    const afterC = absoluteFrameTransform(next, "C", W, H);
    if (afterC === null) throw new Error("C gone after reparent");
    expect(afterC.center.x).toBeCloseTo(beforeC.center.x, 3);
    expect(afterC.center.y).toBeCloseTo(beforeC.center.y, 3);
    expect(afterC.rotation).toBeCloseTo(beforeC.rotation, 6);
  });

  it("multi entry (2 items, same new parent): single patch with 2 entries", () => {
    const ctx = makeReparentCtx();
    // Add another root-level frame and a second nested c2 under p1.
    let doc = ctx.document;
    doc = addChild(doc, nestedFrame("c2", { x: 0.3, y: 0.3, width: 0.2, height: 0.2 }), "p1");
    const ctx2: CommandContext = { ...ctx, document: doc };
    const result = runReparent(ctx2, [
      { itemId: "c1", newParentId: "p2" },
      { itemId: "c2", newParentId: "p2" },
    ]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.patches).toHaveLength(1); // single history entry
    const patch = result.patches[0]!;
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    expect(patch.entries).toHaveLength(2);
    expect(patch.entries.map((e) => String(e.itemId))).toEqual(["c1", "c2"]);
  });

  it("root → frame: nested item under root reparents into a frame", () => {
    // Layout: root has [p1, p2], add c-loose directly under root.
    const ctx = makeReparentCtx();
    let doc = ctx.document;
    doc = addChild(
      doc,
      nestedFrame("c-loose", { x: 0.7, y: 0.7, width: 0.2, height: 0.2 }),
      String(doc.root.id),
    );
    const ctx2: CommandContext = { ...ctx, document: doc };
    const result = runReparent(ctx2, [{ itemId: "c-loose", newParentId: "p2" }]);
    if (!result.ok) throw new Error("expected ok");
    const patch = result.patches[0]!;
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = patch.entries[0]!;
    expect(String(e.oldParentId)).toBe(String(ctx2.document.root.id));
    expect(String(e.newParentId)).toBe("p2");
  });

  it("frame → root: nested c1 (under p1) reparents to the document root", () => {
    const ctx = makeReparentCtx();
    const rootId = String(ctx.document.root.id);
    const result = runReparent(ctx, [{ itemId: "c1", newParentId: rootId }]);
    if (!result.ok) throw new Error("expected ok");
    const patch = result.patches[0]!;
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = patch.entries[0]!;
    expect(String(e.oldParentId)).toBe("p1");
    expect(String(e.newParentId)).toBe(rootId);
    expect(e.newIndex).toBe(2); // root had [p1, p2] = length 2
  });

  it("cycle (self): newParentId equals itemId → fails with reparent-cycle", () => {
    const ctx = makeReparentCtx();
    const result = runReparent(ctx, [{ itemId: "p1", newParentId: "p1" }]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.error.code).toBe("reparent-cycle");
  });

  it("cycle (ancestor): newParent is a descendant of the item → fails", () => {
    // Move p1 INTO its own child c1 → cycle.
    const ctx = makeReparentCtx();
    const result = runReparent(ctx, [{ itemId: "p1", newParentId: "c1" }]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.error.code).toBe("reparent-cycle");
  });

  it("empty entries: ok with zero patches (no-op)", () => {
    const ctx = makeReparentCtx();
    const result = runReparent(ctx, []);
    if (!result.ok) throw new Error("expected ok");
    expect(result.patches).toHaveLength(0);
  });
});
