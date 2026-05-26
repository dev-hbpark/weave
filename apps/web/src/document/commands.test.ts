// Phase 2 + Phase 4b — weave.* command behavior.
// Direct commands (add/remove/reset) forward to targets.X.
// Patch-emitting commands (updateItem/updateShape/removeShape/updateBehavior)
// compute Patches from ctx.document and do NOT touch targets.X.

import type { Document as AgocraftDocument, CommandContext } from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import { toAgocraftDocument } from "./agocraft-mirror.js";
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
    const result = cmd.run(makeCtx(), { itemId: "slide-1" });
    expect(targets.removeItem).toHaveBeenCalledWith("slide-1");
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    expect(patch).toMatchObject({ type: "item.children", removed: expect.any(Array) });
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
