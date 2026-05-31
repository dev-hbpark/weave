// Phase 2 + Phase 4b — weave.* command behavior.
// Direct commands (add/remove/reset) forward to targets.X.
// Patch-emitting commands (updateItem/updateShape/removeShape/updateBehavior)
// compute Patches from ctx.document and do NOT touch targets.X.

import type {
  Document as AgocraftDocument,
  Item as AgocraftItem,
  CommandContext,
  CommandResult,
  Token,
} from "@agocraft/core";
import {
  CapabilityRegistryToken,
  createCapabilityRegistry,
  createUuidV7Generator,
  defaultClock,
  defaultRandom,
  FILL_UNIT_KIND,
  IdGeneratorToken,
  itemId as makeItemId,
} from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import {
  absoluteFrameTransform,
  addChild,
  applyChangeToDocument,
  computeReparentFrameRatio,
  toAgocraftDocument,
} from "./agocraft-mirror.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "./commands.js";
import type { CameraTargetBehavior, Item, Document as WeaveDocument } from "./types.js";
import { FULL_FRAME } from "./types.js";
import { registerZOrderAdapters } from "./zorder/register.js";

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
  it("weave.item.add emits a self-contained item.create patch (WI-024)", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
    if (cmd === undefined) throw new Error("command not found");
    const ctx = makeCtx();
    const rootId = String(ctx.document.root.id);
    // AUDIT-005 — was the legacy `"slide"` kind (removed in WI-032 Phase 3).
    // The add path now seeds via the DomainKind registry, which fails fast on
    // an unknown kind; use a current kind. The assertions are kind-agnostic.
    const result = cmd.run(ctx, { kind: "frame" });
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.create")
      throw new Error("expected item.create");
    expect(String(patch.parentId)).toBe(rootId);
    expect(String(patch.item.id)).toBe(result.value);
  });

  it("weave.item.remove emits a self-contained item.remove patch for a root item (WI-024)", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.remove");
    if (cmd === undefined) throw new Error("command not found");
    const ctx = makeCtx();
    const rootId = String(ctx.document.root.id);
    const result = cmd.run(ctx, { itemId: "slide-1" });
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.remove")
      throw new Error("expected item.remove");
    expect(String(patch.parentId)).toBe(rootId);
    expect(String(patch.item.id)).toBe("slide-1");
  });

  // Regression — nested items were silently failing to delete because the
  // command built the removal patch against the caller's `containerId`
  // (defaulting to root). Fix: derive the actual parent from the itemId.
  it("weave.item.remove derives the actual parent for a nested item", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.remove");
    if (cmd === undefined) throw new Error("command not found");
    const ctx = makeNestedCtx();
    const result = cmd.run(ctx, { itemId: "child-1" });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error?.code ?? "?"}`);
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    // The patch must target the *parent frame*, not the root.
    if (patch === undefined || patch.type !== "item.remove")
      throw new Error("expected item.remove");
    expect(String(patch.parentId)).toBe("parent-1");
    expect(String(patch.item.id)).toBe("child-1");
  });

  it("weave.item.remove ignores a wrong containerId hint and still derives the right parent", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.remove");
    if (cmd === undefined) throw new Error("command not found");
    const ctx = makeNestedCtx();
    const rootId = String(ctx.document.root.id);
    const result = cmd.run(ctx, { itemId: "child-1", containerId: rootId });
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    expect(patch).toMatchObject({ parentId: makeItemId("parent-1") });
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

// ── WI-055 — weave.shape.setCornerRadius ────────────────────────────────────
function makeShapeCtx(): CommandContext {
  const rectItem = {
    id: "rect-1",
    kind: "shape",
    attrs: {
      frame: FULL_FRAME,
      shape: "rectangle",
      fill: { type: "solid", color: "#cbd5f5" },
      stroke: null,
      shadow: null,
      opacity: 1,
      subAttrs: { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } },
    },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
  const ellipseItem = {
    id: "ellipse-1",
    kind: "shape",
    attrs: {
      frame: FULL_FRAME,
      shape: "ellipse",
      fill: { type: "solid", color: "#cbd5f5" },
      stroke: null,
      shadow: null,
      opacity: 1,
      subAttrs: { shape: "ellipse" },
    },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
  const weave: WeaveDocument = {
    id: "doc-shape",
    title: "Shapes",
    items: [rectItem, ellipseItem],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  // DR-028 — `weave.shape.setFill` now emits a `decoration.fill` UNIT patch via
  // the agocraft kit, which resolves an IdGenerator for the new unit's id. The
  // fixture must therefore supply one (the old attrs-Patch path needed nothing).
  const idGen = createUuidV7Generator(defaultClock, defaultRandom);
  return {
    document: toAgocraftDocument(weave),
    resolve: ((token: Token<unknown>) =>
      token === IdGeneratorToken ? idGen : null) as CommandContext["resolve"],
    skipRelations: false,
  };
}

describe("weave.shape.setCornerRadius (WI-055)", () => {
  function cmd() {
    const c = buildWeaveCommands(spyTargets()).find(
      (x) => x.name === "weave.shape.setCornerRadius",
    );
    if (c === undefined) throw new Error("command not found");
    return c;
  }

  it("uniform radius sets all four corners in a complete subAttrs", () => {
    const result = cmd().run(makeShapeCtx(), { itemId: "rect-1", radius: 12 });
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect((patch.after as { subAttrs: unknown }).subAttrs).toEqual({
      shape: "rectangle",
      cornerRadii: { tl: 12, tr: 12, br: 12, bl: 12 },
    });
  });

  it("per-corner radii merges only the supplied corners", () => {
    const result = cmd().run(makeShapeCtx(), { itemId: "rect-1", radii: { tl: 24 } });
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect((patch.after as { subAttrs: { cornerRadii: unknown } }).subAttrs.cornerRadii).toEqual({
      tl: 24,
      tr: 0,
      br: 0,
      bl: 0,
    });
  });

  it("clamps negative radius to 0", () => {
    const result = cmd().run(makeShapeCtx(), { itemId: "rect-1", radius: -5 });
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect(
      (patch.after as { subAttrs: { cornerRadii: { tl: number } } }).subAttrs.cornerRadii.tl,
    ).toBe(0);
  });

  it("fails with not-a-rectangle for a non-rectangle shape", () => {
    const result = cmd().run(makeShapeCtx(), { itemId: "ellipse-1", radius: 10 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not-a-rectangle");
  });

  it("fails with invalid-input when both radius and radii are sent", () => {
    const result = cmd().run(makeShapeCtx(), { itemId: "rect-1", radius: 8, radii: { tl: 4 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid-input");
  });

  it("fails with invalid-input when neither radius nor radii is sent", () => {
    const result = cmd().run(makeShapeCtx(), { itemId: "rect-1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid-input");
  });

  it("fails with item-not-found for a missing item", () => {
    const result = cmd().run(makeShapeCtx(), { itemId: "ghost", radius: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("item-not-found");
  });
});

// ── WI-056 — weave.shape.setFill ────────────────────────────────────────────
describe("weave.shape.setFill (WI-056)", () => {
  function cmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.shape.setFill");
    if (c === undefined) throw new Error("command not found");
    return c;
  }

  // DR-028 — fill is the `decoration.fill` UNIT, not `attrs.fill`. setFill emits
  // a unit.create (replacing the seeded fill unit) carrying the PaintSpec.
  function createdFillPaint(result: CommandResult<unknown>): unknown {
    if (!result.ok) throw new Error("unexpected fail");
    const create = result.patches.find(
      (p) => (p as { type?: string }).type === "unit.create",
    ) as { unit?: { kind?: string; attrs?: unknown } } | undefined;
    if (create === undefined) throw new Error("expected a unit.create patch");
    expect(create.unit?.kind).toBe(FILL_UNIT_KIND);
    return create.unit?.attrs;
  }

  it("sets a linear-gradient fill as a decoration.fill unit", () => {
    const fill = {
      type: "linear-gradient",
      angle: 90,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#0000ff" },
      ],
    };
    expect(createdFillPaint(cmd().run(makeShapeCtx(), { itemId: "rect-1", fill }))).toEqual(fill);
  });

  it("sets a radial-gradient fill", () => {
    const fill = {
      type: "radial-gradient",
      cx: 0.5,
      cy: 0.5,
      stops: [
        { offset: 0, color: "#ffffff" },
        { offset: 1, color: "#000000" },
      ],
    };
    expect(createdFillPaint(cmd().run(makeShapeCtx(), { itemId: "rect-1", fill }))).toEqual(fill);
  });

  it("sets a solid fill", () => {
    const paint = createdFillPaint(
      cmd().run(makeShapeCtx(), { itemId: "rect-1", fill: { type: "solid", color: "#00ff00" } }),
    ) as { color: string };
    expect(paint.color).toBe("#00ff00");
  });

  it("rejects a gradient with fewer than 2 stops", () => {
    const result = cmd().run(makeShapeCtx(), {
      itemId: "rect-1",
      fill: { type: "linear-gradient", angle: 0, stops: [{ offset: 0, color: "#f00" }] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid-input");
  });

  it("rejects an unknown fill type", () => {
    const result = cmd().run(makeShapeCtx(), {
      itemId: "rect-1",
      fill: { type: "plaid" } as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid-input");
  });

  it("fails with item-not-found for a missing item", () => {
    const result = cmd().run(makeShapeCtx(), {
      itemId: "ghost",
      fill: { type: "solid", color: "#000000" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("item-not-found");
  });

  it("fails with not-a-shape for a non-shape item", () => {
    // makeCtx seeds a "slide" item, not a shape.
    const result = cmd().run(makeCtx(), {
      itemId: "slide-1",
      fill: { type: "solid", color: "#000000" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not-a-shape");
  });
});

// ── WI-030 — weave.preset.insertSlide ───────────────────────────────────────
//
// Verifies the core feasibility claim (FR-003 §F1): a multi-item preset
// resolves to ONE staged AgocraftItem whose `children` carry the full
// layout, plus ONE `item.children` patch on the root → a single history
// entry. `Cmd+Z` reverting the entire subtree is the natural consequence.

describe("weave.preset.insertSlide (WI-030 Phase 1)", () => {
  it("emits one self-contained item.create carrying the populated slide subtree", () => {
    const targets = spyTargets();
    const cmds = buildWeaveCommands(targets);
    const cmd = cmds.find((c) => c.name === "weave.preset.insertSlide");
    if (cmd === undefined) throw new Error("command not found");

    const result = cmd.run(makeCtx(), { presetId: "cover.bold" });
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);

    // Exactly one patch — single history entry contract.
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.create") {
      throw new Error("expected item.create");
    }
    expect(String(patch.item.id)).toBe(result.value);
    // WI-032 Phase 4 — root kind is `frame` (the canvas container); the patch
    // carries the full subtree (FR-003 §F1) so no PendingCreations is needed.
    expect(patch.item.kind).toBe("frame");
    // cover.bold = accent-bar (shape) + title + subtitle + meta (3 texts).
    expect(patch.item.children).toHaveLength(4);
    const kinds = patch.item.children.map((c) => c.kind);
    expect(kinds).toContain("shape");
    expect(kinds.filter((k) => k === "text")).toHaveLength(3);
  });

  it("fails with preset-not-found for an unknown preset id", () => {
    const targets = spyTargets();
    const cmds = buildWeaveCommands(targets);
    const cmd = cmds.find((c) => c.name === "weave.preset.insertSlide");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { presetId: "does.not.exist" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("preset-not-found");
  });

  it("resolves to a unique stable id per child (no collisions within one preset)", () => {
    const targets = spyTargets();
    const cmds = buildWeaveCommands(targets);
    const cmd = cmds.find((c) => c.name === "weave.preset.insertSlide");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makeCtx(), { presetId: "cover.hero" });
    if (!result.ok) throw new Error("expected ok");
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.create")
      throw new Error("expected item.create");
    const ids = patch.item.children.map((c) => String(c.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(String(patch.item.id));
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
    // WI-022 S1 — the z-order commands delegate to `agocraft.zOrder.*`, which
    // resolve the ZOrderCapability adapter from this registry (production wires
    // `editor.capabilities`). Register the design-frame adapter so the
    // delegation dispatches to a real splice.
    const capabilities = createCapabilityRegistry();
    registerZOrderAdapters({ capabilityRegistry: capabilities, getDocument: () => doc });
    return {
      document: doc,
      resolve: (<T>(token: Token<T>): T => {
        if (token === (CapabilityRegistryToken as unknown as Token<T>)) {
          return capabilities as unknown as T;
        }
        return null as never;
      }) as CommandContext["resolve"],
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

// ─── WI-050 — weave.frame.removeKeepingChildren (dissolve frame) ───────────

describe("weave.frame.removeKeepingChildren (WI-050)", () => {
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

  /** Doc layout:
   *   root
   *   ├─ p1 (frame, 0,0,0.5,0.5)
   *   │   ├─ c1 (frame, 0.1,0.1,0.3,0.3)
   *   │   └─ c2 (frame, 0.5,0.5,0.3,0.3)
   *   └─ p2 (frame, 0.5,0.5,0.5,0.5)
   */
  function makeDissolveCtx(): { ctx: CommandContext; rootId: string } {
    const weave: WeaveDocument = {
      id: "doc-dis",
      title: "Dissolve",
      items: [
        frameWith("p1", { x: 0, y: 0, width: 0.5, height: 0.5 }),
        frameWith("p2", { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }),
      ],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    let doc = toAgocraftDocument(weave);
    doc = addChild(doc, nestedFrame("c1", { x: 0.1, y: 0.1, width: 0.3, height: 0.3 }), "p1");
    doc = addChild(doc, nestedFrame("c2", { x: 0.5, y: 0.5, width: 0.3, height: 0.3 }), "p1");
    return {
      ctx: { document: doc, resolve: () => null as never, skipRelations: false },
      rootId: String(doc.root.id),
    };
  }

  function runDissolve(ctx: CommandContext, frameId: string) {
    const cmds = buildWeaveCommands(spyTargets());
    const cmd = cmds.find((c) => c.name === "weave.frame.removeKeepingChildren");
    if (cmd === undefined) throw new Error("weave.frame.removeKeepingChildren not found");
    return { result: cmd.run(ctx, { frameId } as never) };
  }

  // Manual inverses (mirror agocraft `invertPatch`) so the test can prove the
  // single-transaction undo restores the frame WITH its children and does NOT
  // duplicate them at the root. WI-024 — remove's inverse is `item.create`.
  function invert(p: import("@agocraft/core").Patch): import("@agocraft/core").Patch {
    if (p.type === "item.remove") {
      return { type: "item.create", parentId: p.parentId, position: p.position, item: p.item };
    }
    if (p.type === "item.reparent") {
      return {
        type: "item.reparent",
        entries: p.entries.map((e) => ({
          itemId: e.itemId,
          oldParentId: e.newParentId,
          oldIndex: e.newIndex,
          oldFrameRatio: e.newFrameRatio,
          newParentId: e.oldParentId,
          newIndex: e.oldIndex,
          newFrameRatio: e.oldFrameRatio,
        })),
      };
    }
    throw new Error(`invert: unexpected patch ${p.type}`);
  }

  it("emits item.reparent (children → root) then item.remove carrying the EMPTY frame", () => {
    const { ctx, rootId } = makeDissolveCtx();
    const { result } = runDissolve(ctx, "p1");
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
    expect(result.patches).toHaveLength(2);

    const [reparent, remove] = result.patches;
    if (reparent === undefined || reparent.type !== "item.reparent") {
      throw new Error("patch[0] must be item.reparent");
    }
    expect(reparent.entries.map((e) => String(e.itemId))).toEqual(["c1", "c2"]);
    for (const e of reparent.entries) {
      expect(String(e.oldParentId)).toBe("p1");
      expect(String(e.newParentId)).toBe(rootId);
    }
    expect(reparent.entries[0]!.newIndex).toBe(2);
    expect(reparent.entries[1]!.newIndex).toBe(3);

    if (remove === undefined || remove.type !== "item.remove") {
      throw new Error("patch[1] must be item.remove");
    }
    expect(String(remove.parentId)).toBe(rootId);
    expect(String(remove.item.id)).toBe("p1");
    // The carried frame must be EMPTY — otherwise undo (item.create) would
    // resurrect the children twice (once via re-create, once via reparent⁻¹).
    expect(remove.item.children).toHaveLength(0);
  });

  it("forward application: children land at root, frame is gone", () => {
    const { ctx } = makeDissolveCtx();
    const { result } = runDissolve(ctx, "p1");
    if (!result.ok) throw new Error("expected ok");
    let doc = ctx.document;
    for (const p of result.patches) doc = applyChangeToDocument(doc, p as never);

    expect(findItemDeepById(doc, "p1")).toBeUndefined();
    // root started [p1, p2]; reparent appends c1, c2; remove drops p1.
    expect(doc.root.children.map((c) => String(c.id))).toEqual(["p2", "c1", "c2"]);
    expect(findItemDeepById(doc, "c1")).toBeDefined();
    expect(findItemDeepById(doc, "c2")).toBeDefined();
  });

  it("undo round-trip restores the frame WITH its children and does NOT duplicate them", () => {
    const { ctx } = makeDissolveCtx();
    const { result } = runDissolve(ctx, "p1");
    if (!result.ok) throw new Error("expected ok");

    // Forward.
    let doc = ctx.document;
    for (const p of result.patches) doc = applyChangeToDocument(doc, p as never);

    // Undo: invert each patch and apply in REVERSE order (how history replays
    // a transaction). remove⁻¹ (item.create) re-adds the empty frame;
    // reparent⁻¹ re-homes the children.
    const inverses = result.patches.map(invert).reverse();
    for (const p of inverses) doc = applyChangeToDocument(doc, p as never);

    // p1 is back at root with both children; c1/c2 do NOT also linger at root.
    const rootKids = doc.root.children.map((c) => String(c.id));
    expect(rootKids).toContain("p1");
    expect(rootKids).not.toContain("c1");
    expect(rootKids).not.toContain("c2");
    const p1 = findItemDeepById(doc, "p1");
    if (p1 === undefined) throw new Error("p1 not restored");
    expect(p1.children.map((c) => String(c.id))).toEqual(["c1", "c2"]);
  });

  it("empty frame: only the remove patch, no reparent patch", () => {
    const { ctx } = makeDissolveCtx();
    const { result } = runDissolve(ctx, "p2"); // p2 has no children
    if (!result.ok) throw new Error("expected ok");
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0]!.type).toBe("item.remove");
  });

  it("guards: dissolving the root fails; an unknown id fails", () => {
    const { ctx, rootId } = makeDissolveCtx();
    const root = runDissolve(ctx, rootId).result;
    expect(root.ok).toBe(false);
    if (root.ok) throw new Error("expected fail");
    expect(root.error.code).toBe("invalid-target");

    const missing = runDissolve(ctx, "nope").result;
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error("expected fail");
    expect(missing.error.code).toBe("item-not-found");
  });
});

describe("weave.item.update — units (WI-063)", () => {
  function updateCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.item.update");
    if (c === undefined) throw new Error("command not found");
    return c;
  }
  function shapeCtx(): CommandContext {
    const shape = {
      id: "sh-1",
      kind: "shape",
      attrs: {
        frame: { x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0 },
        shape: "rectangle",
        subAttrs: { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } },
      },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const weave: WeaveDocument = {
      id: "d",
      title: "",
      items: [shape],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    return { document: toAgocraftDocument(weave), resolve: () => null as never, skipRelations: false };
  }
  // NOTE: the `units` path delegates to the vendored setDecoration command, which
  // resolves a unit-id generator from the editor container at runtime. The bare
  // unit-test CommandContext (resolve: () => null) can't host it — the same reason
  // the WI-056 setFill suite can't run here — so the decoration emit is verified
  // in the live app (console: `weave.item.setDecoration` → ok), not in this harness.
  // Here we cover the parts that DON'T hit setDecoration: the attrs path still
  // works after the computeAttrsPatches refactor, and the empty-input guard.

  it("attrs-only update still emits an item.attrs patch (refactor regression)", () => {
    const res = updateCmd().run(shapeCtx(), { itemId: "sh-1", attrs: { opacity: 0.5 } });
    if (!res.ok) throw new Error("unexpected fail");
    const p = res.patches.find((q) => q.type === "item.attrs");
    expect(p).toBeDefined();
    expect((p as unknown as { after: { opacity: number } }).after.opacity).toBe(0.5);
  });

  it("rejects when neither attrs, patch, nor units are provided", () => {
    const res = updateCmd().run(shapeCtx(), { itemId: "sh-1" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.error.code).toBe("invalid-input");
  });
});

describe("weave.item.add — creation units (WI-063)", () => {
  function addCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.item.add");
    if (c === undefined) throw new Error("command not found");
    return c;
  }
  function createdUnits(
    res: ReturnType<ReturnType<typeof addCmd>["run"]>,
  ): Array<{ kind: string; attrs: Record<string, unknown> }> {
    if (!res.ok) throw new Error("add failed");
    const create = res.patches.find((p) => p.type === "item.create");
    if (create === undefined) throw new Error("no item.create patch");
    return (create as unknown as { item: { units: Array<{ kind: string; attrs: Record<string, unknown> }> } })
      .item.units;
  }

  it("attaches fill + shadow at creation in one call (seed fill replaced, not duplicated)", () => {
    const gradient = {
      type: "linear-gradient",
      angle: 90,
      stops: [
        { offset: 0, color: "#000000" },
        { offset: 1, color: "#ffffff" },
      ],
    };
    const shadow = { x: 0, y: 8, blur: 24, spread: 0, color: "#00000088" };
    const res = addCmd().run(makeCtx(), {
      kind: "shape",
      attrsOverride: { shape: "rectangle", subAttrs: { shape: "rectangle" } },
      units: [
        { kind: "decoration.fill", attrs: gradient },
        { kind: "decoration.shadow", attrs: shadow },
      ],
    });
    const units = createdUnits(res);
    const fills = units.filter((u) => u.kind === "decoration.fill");
    expect(fills).toHaveLength(1); // the seeded default fill was replaced, not duplicated
    expect(fills[0]!.attrs).toEqual(gradient);
    const shadows = units.filter((u) => u.kind === "decoration.shadow");
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.attrs).toEqual(shadow);
  });

  it("keeps the seeded default fill when no units are provided", () => {
    const res = addCmd().run(makeCtx(), { kind: "shape" });
    expect(createdUnits(res).filter((u) => u.kind === "decoration.fill")).toHaveLength(1);
  });
});

describe("weave.item.add — shape subAttrs normalization (WI-062)", () => {
  function addCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.item.add");
    if (c === undefined) throw new Error("command not found");
    return c;
  }
  // The add command emits an `item.create` patch carrying the serialized item.
  function createdAttrs(res: ReturnType<ReturnType<typeof addCmd>["run"]>): Record<string, unknown> {
    if (!res.ok) throw new Error("add failed");
    const create = res.patches.find((p) => p.type === "item.create");
    if (create === undefined) throw new Error("no item.create patch");
    return (create as unknown as { item: { attrs: Record<string, unknown> } }).item.attrs;
  }
  const sub = (a: Record<string, unknown>) => a.subAttrs as Record<string, unknown>;

  it("fills missing cornerRadii when a partial rectangle subAttrs is sent (crash repro)", () => {
    // Exactly the shape that crashed shapeToSvgGeometry: rectangle, no cornerRadii.
    const res = addCmd().run(makeCtx(), {
      kind: "shape",
      attrsOverride: { shape: "rectangle", subAttrs: { shape: "rectangle" } },
    });
    const attrs = createdAttrs(res);
    expect(sub(attrs).shape).toBe("rectangle");
    expect(sub(attrs).cornerRadii).toEqual({ tl: 0, tr: 0, br: 0, bl: 0 });
  });

  it("deep-merges a partial cornerRadii so the other corners keep their default", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "shape",
      attrsOverride: { shape: "rectangle", subAttrs: { shape: "rectangle", cornerRadii: { tl: 12 } } },
    });
    expect(sub(createdAttrs(res)).cornerRadii).toEqual({ tl: 12, tr: 0, br: 0, bl: 0 });
  });

  it("fills geometry for a non-rectangle kind (star) from defaults", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "shape",
      attrsOverride: { shape: "star", subAttrs: { shape: "star" } },
    });
    const s = sub(createdAttrs(res));
    expect(s.shape).toBe("star");
    expect(typeof s.points).toBe("number");
    expect(typeof s.innerRatio).toBe("number");
  });

  it("falls back to rectangle for an unknown shape string", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "shape",
      attrsOverride: { shape: "blob", subAttrs: { shape: "blob" } },
    });
    const s = sub(createdAttrs(res));
    expect(s.shape).toBe("rectangle");
    expect(s.cornerRadii).toBeDefined();
  });

  it("syncs the top-level attrs.shape to subAttrs.shape", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "shape",
      attrsOverride: { subAttrs: { shape: "ellipse" } },
    });
    const attrs = createdAttrs(res);
    expect(attrs.shape).toBe("ellipse");
    expect(sub(attrs).shape).toBe("ellipse");
  });
});

describe("weave.items.update (WI-061)", () => {
  function updateCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.items.update");
    if (c === undefined) throw new Error("command not found");
    return c;
  }
  function frameItem(id: string, x: number, extra?: Record<string, unknown>): Item {
    return {
      id,
      kind: "shape",
      attrs: { frame: { x, y: 0, width: 0.2, height: 0.2, rotation: 0 }, opacity: 1, ...extra },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
  }
  function ctxWith(items: ReadonlyArray<Item>): CommandContext {
    const weave: WeaveDocument = {
      id: "doc-items-update",
      title: "U",
      items: [...items],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    return { document: toAgocraftDocument(weave), resolve: () => null as never, skipRelations: false };
  }

  it("applies the same attrs to every id as ONE batch of item.attrs patches", () => {
    const ctx = ctxWith([frameItem("a", 0.1), frameItem("b", 0.5), frameItem("c", 0.3)]);
    const res = updateCmd().run(ctx, { itemIds: ["a", "b", "c"], attrs: { opacity: 0.5 } });
    if (!res.ok) throw new Error("unexpected fail");
    const attrsPatches = res.patches.filter((p) => p.type === "item.attrs");
    expect(attrsPatches).toHaveLength(3);
    // Every emitted patch carries the merged opacity AND preserves the frame.
    for (const p of attrsPatches) {
      const after = (p as unknown as { after: { opacity: number; frame: unknown } }).after;
      expect(after.opacity).toBe(0.5);
      expect(after.frame).toBeDefined(); // shallow-merge kept the existing frame
    }
  });

  it("rejects an empty itemIds list", () => {
    const ctx = ctxWith([frameItem("a", 0.1)]);
    const res = updateCmd().run(ctx, { itemIds: [], attrs: { opacity: 0.5 } });
    expect(res.ok).toBe(false);
  });

  it("fails if any id is missing", () => {
    const ctx = ctxWith([frameItem("a", 0.1)]);
    const res = updateCmd().run(ctx, { itemIds: ["a", "ghost"], attrs: { opacity: 0.5 } });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.error.code).toBe("item-not-found");
  });
});

// WI-064 — align/distribute is now the `op` of weave.items.update (the former
// weave.items.align was folded in). These exercise that op path.
describe("weave.items.update op = align/distribute (WI-059/064)", () => {
  function alignCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.items.update");
    if (c === undefined) throw new Error("command not found");
    return c;
  }
  function frameItem(id: string, x: number, y: number, w: number, h: number): Item {
    return {
      id,
      kind: "frame",
      attrs: { frame: { x, y, width: w, height: h, rotation: 0 } },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
  }
  function ctxWith(items: ReadonlyArray<Item>): CommandContext {
    const weave: WeaveDocument = {
      id: "doc-align",
      title: "Align",
      items: [...items],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    return { document: toAgocraftDocument(weave), resolve: () => null as never, skipRelations: false };
  }
  // Extract { itemId → after.frame.x } for the emitted item.attrs patches.
  function movedX(patches: ReadonlyArray<{ type: string }>): Map<string, number> {
    return new Map(
      patches
        .filter((p) => p.type === "item.attrs")
        .map((p) => {
          const q = p as unknown as { itemId: unknown; after: { frame: { x: number } } };
          return [String(q.itemId), q.after.frame.x] as const;
        }),
    );
  }

  it("align-left snaps every sibling's x to the selection min (already-aligned items emit no patch)", () => {
    const ctx = ctxWith([
      frameItem("a", 0.1, 0, 0.2, 0.2),
      frameItem("b", 0.5, 0, 0.2, 0.2),
      frameItem("c", 0.3, 0, 0.2, 0.2),
    ]);
    const res = alignCmd().run(ctx, { itemIds: ["a", "b", "c"], op: "align-left" });
    if (!res.ok) throw new Error("unexpected fail");
    const xs = movedX(res.patches);
    expect(xs.get("b")).toBeCloseTo(0.1);
    expect(xs.get("c")).toBeCloseTo(0.1);
    expect(xs.has("a")).toBe(false); // a was already the min → zero-delta, no patch
  });

  it("distribute-horizontal equalizes gaps between three siblings", () => {
    const ctx = ctxWith([
      frameItem("a", 0.0, 0, 0.1, 0.2),
      frameItem("b", 0.15, 0, 0.1, 0.2),
      frameItem("c", 0.8, 0, 0.1, 0.2),
    ]);
    const res = alignCmd().run(ctx, { itemIds: ["a", "b", "c"], op: "distribute-horizontal" });
    if (!res.ok) throw new Error("unexpected fail");
    // span 0.0..0.9 (=0.9), total width 0.3, two gaps → each gap 0.3; b sits at 0.0+0.1+0.3=0.4.
    expect(movedX(res.patches).get("b")).toBeCloseTo(0.4);
  });

  it("rejects fewer than 2 itemIds", () => {
    const ctx = ctxWith([frameItem("a", 0.1, 0, 0.2, 0.2)]);
    const res = alignCmd().run(ctx, { itemIds: ["a"], op: "align-left" });
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown op", () => {
    const ctx = ctxWith([frameItem("a", 0.1, 0, 0.2, 0.2), frameItem("b", 0.5, 0, 0.2, 0.2)]);
    const res = alignCmd().run(ctx, {
      itemIds: ["a", "b"],
      op: "align-diagonal" as never,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a cross-parent selection (v1 same-parent invariant)", () => {
    // parent-1 (root) contains child-1; sibling-2 sits at root → different parents.
    const parent: Item = {
      id: "parent-1",
      kind: "frame",
      attrs: { frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 } },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const sibling: Item = frameItem("sibling-2", 0.6, 0, 0.2, 0.2);
    const weave: WeaveDocument = {
      id: "doc-xparent",
      title: "X",
      items: [parent, sibling],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    const root = toAgocraftDocument(weave);
    const childAgocraft = {
      id: makeItemId("child-1"),
      kind: "frame",
      attrs: { frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 } } as unknown as AgocraftItem["attrs"],
      units: [],
      children: [] as ReadonlyArray<AgocraftItem>,
      meta: { createdAt: META_DATE, updatedAt: META_DATE, schemaVersion: 9 },
    } as unknown as AgocraftItem;
    const doc = addChild(root, childAgocraft, "parent-1");
    const ctx: CommandContext = { document: doc, resolve: () => null as never, skipRelations: false };
    const res = alignCmd().run(ctx, { itemIds: ["child-1", "sibling-2"], op: "align-left" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.error.code).toBe("cross-parent-selection");
  });
});

describe("weave.items.lifecycle (WI-064)", () => {
  function lifecycleCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.items.lifecycle");
    if (c === undefined) throw new Error("command not found");
    return c;
  }

  it("op:'remove' deletes the items (delegates to the remove kit command)", () => {
    // makeCtx has root children slide-1 + canvas-1.
    const res = lifecycleCmd().run(makeCtx(), { itemIds: ["slide-1"], op: "remove" });
    if (!res.ok) throw new Error("unexpected fail");
    expect(res.patches.length).toBeGreaterThan(0);
    expect(res.patches.some((p) => p.type === "item.remove" || p.type === "item.children")).toBe(true);
  });

  it("rejects an unknown op", () => {
    const res = lifecycleCmd().run(makeCtx(), {
      itemIds: ["slide-1"],
      op: "vaporize" as never,
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.error.code).toBe("invalid-input");
  });

  it("rejects an empty itemIds list", () => {
    const res = lifecycleCmd().run(makeCtx(), { itemIds: [], op: "remove" });
    expect(res.ok).toBe(false);
  });
});

/** Local deep find used by the WI-050 tests (the production helper lives in
 *  agocraft-mirror but isn't exported under this name). */
function findItemDeepById(doc: AgocraftDocument, id: string): AgocraftItem | undefined {
  const walk = (item: AgocraftItem): AgocraftItem | undefined => {
    if (String(item.id) === id) return item;
    for (const c of item.children) {
      const hit = walk(c);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const c of doc.root.children) {
    const hit = walk(c);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
