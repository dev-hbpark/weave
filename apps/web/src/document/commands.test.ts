// Phase 2 + Phase 4b — weave.* command behavior.
// Direct commands (add/remove/reset) forward to targets.X.
// Patch-emitting commands (updateItem/updateShape/removeShape/updateBehavior)
// compute Patches from ctx.document and do NOT touch targets.X.

import type { CommandContext, Document as AgocraftDocument } from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import { toAgocraftDocument } from "./agocraft-mirror.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "./commands.js";
import { FULL_FRAME } from "./types.js";
import type {
  CameraTargetBehavior,
  Document as WeaveDocument,
  Item,
} from "./types.js";

function spyTargets() {
  const targets: WeaveCommandTargets = {
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    updateBehavior: vi.fn(),
    updateShape: vi.fn(),
    removeShape: vi.fn(),
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
  const slideItem: Item = {
    id: "slide-1",
    kind: "slide",
    attrs: { frame: FULL_FRAME, title: "Hello", bullets: ["a"] },
    behaviors: [cam],
    createdAt: META_DATE,
  };
  const canvasItem: Item = {
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
  };
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

  it("weave.shape.update returns an item.attrs Patch with the next shapes array", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.shape.update");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), {
      itemId: "canvas-1",
      shapeId: "s-1",
      patch: { x: 42 },
    });
    expect(targets.updateShape).not.toHaveBeenCalled();
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    const after = patch.after as { readonly shapes: ReadonlyArray<{ readonly x: number }> };
    expect(after.shapes[0]?.x).toBe(42);
  });

  it("weave.shape.remove drops the matching shape and returns an item.attrs Patch", () => {
    const targets = spyTargets();
    const cmd = buildWeaveCommands(targets).find((c) => c.name === "weave.shape.remove");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { itemId: "canvas-1", shapeId: "s-1" });
    expect(targets.removeShape).not.toHaveBeenCalled();
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    const after = patch.after as { readonly shapes: ReadonlyArray<unknown> };
    expect(after.shapes).toHaveLength(0);
  });

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
