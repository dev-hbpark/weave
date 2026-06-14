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
  createAutoGridChildPolicy as makeGridChildPolicy,
  createAutoGridSpec as makeGridSpec,
  createCapabilityRegistry,
  createUuidV7Generator,
  defaultClock,
  defaultRandom,
  FILL_UNIT_KIND,
  IdGeneratorToken,
  itemId as makeItemId,
  trackFr as makeTrackFr,
} from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import { nn } from "../lib/nn.js";
import {
  absoluteFrameTransform,
  addChild,
  applyChangeToDocument,
  computeReparentFrameRatio,
  toAgocraftDocument,
} from "./agocraft-mirror.js";
import {
  buildWeaveCommands,
  checkAddedItemMinSize,
  MIN_ITEM_AREA_PX2,
  MIN_ITEM_SIDE_PX,
  SNAPSHOT_BOUNDARY_COMMANDS,
  type WeaveCommandTargets,
} from "./commands.js";
import type { CameraTargetBehavior, Item, Document as WeaveDocument } from "./types.js";
import { FULL_FRAME } from "./types.js";
import { registerZOrderAdapters } from "./zorder/register.js";

function spyTargets() {
  // WI-032 Phase 3b — `updateShape` / `removeShape` removed alongside the
  // legacy `canvas-design` kind.
  const targets: WeaveCommandTargets = {
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

  // WI-189 — undo-order regression. The kit records each removal `position`
  // against the PRE-mutation doc and history replays the inverses in reverse
  // patch order, so same-parent siblings removed in ascending index order
  // restored SWAPPED. The weave decorator sorts ids descending by
  // index-in-parent; this pins the emitted patch order (caught end-to-end by
  // the mixed rail set-delete e2e).
  it("weave.items.remove emits same-parent removals in descending position order (WI-189)", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.items.remove");
    if (cmd === undefined) throw new Error("command not found");
    // slide-1 sits at index 0, canvas-1 at index 1 — pass them ASCENDING.
    const result = cmd.run(makeCtx(), { itemIds: ["slide-1", "canvas-1"] });
    if (!result.ok) throw new Error("unexpected fail");
    expect(result.patches).toHaveLength(2);
    const [first, second] = result.patches;
    if (first?.type !== "item.remove" || second?.type !== "item.remove")
      throw new Error("expected item.remove patches");
    // Descending: the higher-index sibling's removal is recorded first, so
    // the reversed inverse replay re-inserts ascending (0 then 1).
    expect(String(first.item.id)).toBe("canvas-1");
    expect(first.position).toBe(1);
    expect(String(second.item.id)).toBe("slide-1");
    expect(second.position).toBe(0);
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

// WI-156 / DR-112 — delta-persistence completeness gate.
//
// The barrier-A invariant for delta save: every document mutation is captured by
// the patch stream, so `snapshot + replay(patches)` is a lossless substitute for
// a full re-serialize. This gate locks the two facts that make that true:
//   (1) a command can reach host state outside the patch stream ONLY via the
//       `reset` target — `WeaveCommandTargets` exposes nothing else — and the
//       commands that DO mutate emit real patches without touching that hook;
//   (2) `reset` is the one declared snapshot boundary (emits no patch by design).
// If a future command introduces a new bypass (a new host hook, or a mutating
// command that emits `[]`), one of these assertions fails — by design.
describe("delta-persistence completeness gate (WI-156)", () => {
  it("SNAPSHOT_BOUNDARY_COMMANDS is exactly {weave.doc.reset}", () => {
    // The single source the future delta sink reads to decide "drop the log,
    // take a fresh snapshot". Adding a new patch-less mutating command is a
    // conscious act that must update this set (and this assertion).
    expect([...SNAPSHOT_BOUNDARY_COMMANDS].sort()).toEqual(["weave.doc.reset"]);
  });

  it("WeaveCommandTargets exposes only `reset` — the sole non-patch host hook", () => {
    // Structural lock: the proxy/host can only satisfy `{ reset }`. Any new
    // bypass requires widening the interface (a deliberate, reviewable change).
    const targets = spyTargets();
    expect(Object.keys(targets)).toEqual(["reset"]);
  });

  it("mutating commands emit real patches and never touch the host `reset` hook", () => {
    // A representative spread across the patch variants: create / remove /
    // attrs / document.attrs / unit.create. Each must (a) return ≥1 patch and
    // (b) leave `targets.reset` untouched — i.e. the mutation lives entirely in
    // the patch stream, replayable without a side-channel.
    const exercises: ReadonlyArray<{ name: string; input: unknown }> = [
      { name: "weave.item.add", input: { kind: "frame" } },
      { name: "weave.item.remove", input: { itemId: "slide-1" } },
      {
        name: "weave.item.update",
        input: {
          itemId: "slide-1",
          patch: (it: Item) => ({ ...it, attrs: { ...it.attrs, title: "X" } as never }),
        },
      },
      { name: "weave.design.setBackground", input: { color: "#123456" } },
      { name: "weave.design.setPresentationOrder", input: { order: ["slide-1"] } },
    ];
    for (const ex of exercises) {
      const targets = spyTargets();
      const cmd = buildWeaveCommands(targets).find((c) => c.name === ex.name);
      if (cmd === undefined) throw new Error(`command not found: ${ex.name}`);
      const result = cmd.run(makeCtx(), ex.input as never);
      if (!result.ok) throw new Error(`${ex.name} failed: ${result.error?.code ?? "?"}`);
      // Mutating commands are NOT snapshot boundaries → they must carry a patch.
      expect(
        result.patches.length,
        `${ex.name} emitted no patch — a patch-stream loss`,
      ).toBeGreaterThan(0);
      // …and they must not reach the one non-patch host hook.
      expect(targets.reset, `${ex.name} touched targets.reset`).not.toHaveBeenCalled();
    }
  });

  it("the only command that emits no patch (reset) is a declared boundary", () => {
    // Inverse guard: scan the boundary set's sole member and confirm it really
    // is patch-less + host-hook-driven (so the set isn't lying), and that the
    // exercised mutating commands above are NOT in the set.
    const targets = spyTargets();
    const reset = buildWeaveCommands(targets).find((c) => c.name === "weave.doc.reset");
    if (reset === undefined) throw new Error("reset not found");
    const result = reset.run(makeCtx(), undefined);
    if (!result.ok) throw new Error("reset failed");
    expect(result.patches).toEqual([]);
    expect(SNAPSHOT_BOUNDARY_COMMANDS.has("weave.doc.reset")).toBe(true);
    expect(SNAPSHOT_BOUNDARY_COMMANDS.has("weave.item.add")).toBe(false);
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
    // WI-156 — the only host hook is `reset`; a patch-emitting command must
    // never touch it (the mutation lives entirely in the patch stream).
    expect(targets.reset).not.toHaveBeenCalled();
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
    expect(targets.reset).not.toHaveBeenCalled();
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

// ── WI-096 — weave.batch (atomic multi-command transaction) ──────────────────
describe("weave.batch (WI-096 / DR-065)", () => {
  function batchCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.batch");
    if (c === undefined) throw new Error("weave.batch not found");
    return c;
  }

  it("runs several ops as ONE result, concatenating their patches in order", () => {
    const result = batchCmd().run(makePartialEditCtx(), {
      ops: [
        { command: "weave.item.update", input: { itemId: "text-1", attrs: { text: "A" } } },
        {
          command: "weave.item.update",
          input: { itemId: "chart-1", attrs: { variant: { stacked: false } } },
        },
      ],
    });
    if (!result.ok) throw new Error(`unexpected fail: ${JSON.stringify(result)}`);
    // two item.attrs patches, one per op, in order
    const attrsPatches = result.patches.filter((p) => p.type === "item.attrs");
    expect(attrsPatches).toHaveLength(2);
    expect((attrsPatches[0] as { itemId: unknown }).itemId).toBe("text-1");
    expect((attrsPatches[1] as { itemId: unknown }).itemId).toBe("chart-1");
  });

  it("is ATOMIC — one failing op aborts the whole batch with no patches", () => {
    const result = batchCmd().run(makePartialEditCtx(), {
      ops: [
        { command: "weave.item.update", input: { itemId: "text-1", attrs: { text: "A" } } },
        { command: "weave.item.update", input: { itemId: "ghost", attrs: { text: "B" } } },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("item-not-found");
    expect(result.error.message).toContain("op 1");
  });

  it("a later op sees an earlier op's effect on the SAME existing item (evolving doc)", () => {
    // op0 sets color; op1 sets fontSize on the same text. With an evolving working
    // doc, op1's patch carries BOTH (color from op0 + fontSize), so the final
    // applied attrs are not lost.
    const result = batchCmd().run(makePartialEditCtx(), {
      ops: [
        { command: "weave.item.update", input: { itemId: "text-1", attrs: { color: "#e11" } } },
        { command: "weave.item.update", input: { itemId: "text-1", attrs: { fontSize: 40 } } },
      ],
    });
    if (!result.ok) throw new Error("unexpected fail");
    const last = result.patches.filter((p) => p.type === "item.attrs").at(-1) as {
      after: Record<string, unknown>;
    };
    expect(last.after.color).toBe("#e11");
    expect(last.after.fontSize).toBe(40);
  });

  it("normalizes a sanitized / hybrid op command spelling (underscores → dots)", () => {
    // openai-api models sometimes write the sanitized tool spelling — full
    // ("weave_item_update") or hybrid ("weave.item_update") — as the op command.
    // Canonical names never contain underscores, so the lookup recovers both.
    for (const spelling of ["weave_item_update", "weave.item_update"]) {
      const result = batchCmd().run(makePartialEditCtx(), {
        ops: [{ command: spelling, input: { itemId: "text-1", attrs: { text: "A" } } }],
      });
      if (!result.ok) throw new Error(`"${spelling}" failed: ${JSON.stringify(result)}`);
      expect(result.patches.filter((p) => p.type === "item.attrs")).toHaveLength(1);
    }
    // the disallowed-list also sees the normalized name — no nesting via spelling
    const nested = batchCmd().run(makePartialEditCtx(), {
      ops: [{ command: "weave_batch", input: { ops: [] } }],
    });
    expect(nested.ok).toBe(false);
    if (!nested.ok) expect(nested.error.code).toBe("command-not-batchable");
  });

  it("rejects an unknown command, nesting, and doc.reset", () => {
    const unknown = batchCmd().run(makePartialEditCtx(), {
      ops: [{ command: "weave.nope", input: {} }],
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("unknown-command");

    const nested = batchCmd().run(makePartialEditCtx(), {
      ops: [{ command: "weave.batch", input: { ops: [] } }],
    });
    expect(nested.ok).toBe(false);
    if (!nested.ok) expect(nested.error.code).toBe("command-not-batchable");

    const reset = batchCmd().run(makePartialEditCtx(), {
      ops: [{ command: "weave.doc.reset", input: {} }],
    });
    expect(reset.ok).toBe(false);
    if (!reset.ok) expect(reset.error.code).toBe("command-not-batchable");
  });

  it("rejects an empty / missing ops list", () => {
    const empty = batchCmd().run(makePartialEditCtx(), { ops: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("invalid-input");
  });
});

// ── WI-094 — weave.item.update partial-edit normalization (text + chart) ─────
function makePartialEditCtx(): CommandContext {
  const textItem = {
    id: "text-1",
    kind: "text",
    attrs: {
      frame: FULL_FRAME,
      text: "Q3 sales up",
      textRuns: [{ insert: "Q3 sales up" }],
      color: "var(--text-default)",
    },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
  const chartItem = {
    id: "chart-1",
    kind: "chart",
    attrs: {
      frame: FULL_FRAME,
      datasetId: "ds-1",
      chartType: "bar",
      encoding: { category: { field: "항목" }, value: [{ field: "값" }] },
      variant: { stacked: true, smooth: true },
      overrides: { datum: { A: { color: "#111" } }, series: { 값: { color: "#222" } } },
    },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
  const weave: WeaveDocument = {
    id: "doc-partial",
    title: "Partial",
    items: [textItem, chartItem],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  return {
    document: toAgocraftDocument(weave),
    resolve: (() => null) as CommandContext["resolve"],
    skipRelations: false,
  };
}

describe("weave.item.update — partial-edit normalization (WI-094)", () => {
  function updateAttrs(
    ctx: CommandContext,
    itemId: string,
    attrs: Record<string, unknown>,
  ): Record<string, unknown> {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.update");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(ctx, { itemId, attrs });
    if (!result.ok) throw new Error(`unexpected fail: ${JSON.stringify(result)}`);
    const patch = result.patches.find((p) => p.type === "item.attrs");
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    return patch.after as Record<string, unknown>;
  }

  it("text: setting `text` alone re-derives textRuns so the change shows (DR-057 canonical)", () => {
    const after = updateAttrs(makePartialEditCtx(), "text-1", { text: "New copy" });
    expect(after.text).toBe("New copy");
    expect(after.textRuns).toEqual([{ insert: "New copy" }]);
  });

  it("text: setting `textRuns` (부분편집) syncs the `text` mirror to the joined inserts", () => {
    const runs = [
      { insert: "Q3 " },
      { insert: "sales", attributes: { color: "#e11", fontWeight: "bold" } },
      { insert: " up" },
    ];
    const after = updateAttrs(makePartialEditCtx(), "text-1", { textRuns: runs });
    expect(after.textRuns).toEqual(runs);
    expect(after.text).toBe("Q3 sales up");
  });

  it("text: textRuns provided as null is coerced to a valid runs array (never persists null)", () => {
    // The agent's open attrs bag can send textRuns:null (e.g. clearing runs).
    // It must be normalized to a valid array so the renderer never deref-crashes.
    const after = updateAttrs(makePartialEditCtx(), "text-1", {
      textRuns: null as unknown as Record<string, unknown>,
    });
    expect(after.textRuns).toEqual([{ insert: "Q3 sales up" }]); // derived from current text
    expect(after.text).toBe("Q3 sales up");
  });

  it("text: textRuns:null with empty text → empty runs array (not null)", () => {
    const ctx = makePartialEditCtx();
    const cleared = updateAttrs(ctx, "text-1", { text: "" });
    expect(cleared.textRuns).toEqual([]);
    // and a direct null on an item — still an array, never null
    const after = updateAttrs(ctx, "text-1", {
      textRuns: null as unknown as Record<string, unknown>,
    });
    expect(Array.isArray(after.textRuns)).toBe(true);
  });

  it("text: the UI `patch` form is untouched (no re-derive) — provided is undefined", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.update");
    if (cmd === undefined) throw new Error("command not found");
    const result = cmd.run(makePartialEditCtx(), {
      itemId: "text-1",
      patch: (it: Item) => ({ ...it, attrs: { ...it.attrs, text: "X" } as never }),
    });
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches.find((p) => p.type === "item.attrs");
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    const after = patch.after as Record<string, unknown>;
    expect(after.text).toBe("X");
    // runs left as-is (the editor writes text + textRuns together itself)
    expect(after.textRuns).toEqual([{ insert: "Q3 sales up" }]);
  });

  it("chart: a partial `variant` deep-merges — sibling flags survive", () => {
    const after = updateAttrs(makePartialEditCtx(), "chart-1", { variant: { stacked: false } });
    expect(after.variant).toEqual({ stacked: false, smooth: true });
  });

  it("chart: a partial `overrides` emphasizes one datum without dropping the others", () => {
    const after = updateAttrs(makePartialEditCtx(), "chart-1", {
      overrides: { datum: { B: { color: "#e11" } } },
    });
    expect(after.overrides).toEqual({
      datum: { A: { color: "#111" }, B: { color: "#e11" } },
      series: { 값: { color: "#222" } },
    });
  });

  it("chart: a null value clears just that override key (deep)", () => {
    const after = updateAttrs(makePartialEditCtx(), "chart-1", {
      overrides: { datum: { A: null } },
    });
    expect(after.overrides).toEqual({ datum: {}, series: { 값: { color: "#222" } } });
  });

  it("chart: `palette` (array) and scalars still replace wholesale", () => {
    const after = updateAttrs(makePartialEditCtx(), "chart-1", {
      palette: ["#aaa", "#bbb"],
      chartType: "line",
    });
    expect(after.palette).toEqual(["#aaa", "#bbb"]);
    expect(after.chartType).toBe("line");
    // untouched nested maps stay intact
    expect(after.variant).toEqual({ stacked: true, smooth: true });
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
    const create = result.patches.find((p) => (p as { type?: string }).type === "unit.create") as
      | { unit?: { kind?: string; attrs?: unknown } }
      | undefined;
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
    const patch = nn(result.patches[0]);
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
    const rootPatch = nn(rootResult.patches[0]);
    if (rootPatch.type !== "item.children.reorder") throw new Error("wrong kind");
    expect(String(rootPatch.itemId)).toBe(String(ctx.document.root.id));
    // Nested reorder → container itemId equals frame b
    const nestedResult = cmd.run(ctx, { itemId: "b-1" });
    if (!nestedResult.ok) throw new Error("expected ok");
    const nestedPatch = nn(nestedResult.patches[0]);
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
    const patch = nn(result.patches[0]);
    if (patch.type !== "item.reparent") throw new Error("wrong patch type");
    expect(patch.entries).toHaveLength(1);
    const e = nn(patch.entries[0]);
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
    const patch = nn(result.patches[0]);
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = nn(patch.entries.find((x) => String(x.itemId) === "cr"));
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
    const patch = nn(result.patches[0]);
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = nn(patch.entries.find((x) => String(x.itemId) === "cr"));
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
    const patch = nn(result.patches[0]);
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
    const patch = nn(result.patches[0]);
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = nn(patch.entries[0]);
    expect(String(e.oldParentId)).toBe(String(ctx2.document.root.id));
    expect(String(e.newParentId)).toBe("p2");
  });

  it("frame → root: nested c1 (under p1) reparents to the document root", () => {
    const ctx = makeReparentCtx();
    const rootId = String(ctx.document.root.id);
    const result = runReparent(ctx, [{ itemId: "c1", newParentId: rootId }]);
    if (!result.ok) throw new Error("expected ok");
    const patch = nn(result.patches[0]);
    if (patch.type !== "item.reparent") throw new Error("wrong type");
    const e = nn(patch.entries[0]);
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
    expect(nn(reparent.entries[0]).newIndex).toBe(2);
    expect(nn(reparent.entries[1]).newIndex).toBe(3);

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
    expect(nn(result.patches[0]).type).toBe("item.remove");
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
    return {
      document: toAgocraftDocument(weave),
      resolve: () => null as never,
      skipRelations: false,
    };
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
    return (
      create as unknown as {
        item: { units: Array<{ kind: string; attrs: Record<string, unknown> }> };
      }
    ).item.units;
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
    expect(nn(fills[0]).attrs).toEqual(gradient);
    const shadows = units.filter((u) => u.kind === "decoration.shadow");
    expect(shadows).toHaveLength(1);
    expect(nn(shadows[0]).attrs).toEqual(shadow);
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
  function createdAttrs(
    res: ReturnType<ReturnType<typeof addCmd>["run"]>,
  ): Record<string, unknown> {
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
      attrsOverride: {
        shape: "rectangle",
        subAttrs: { shape: "rectangle", cornerRadii: { tl: 12 } },
      },
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
    return {
      document: toAgocraftDocument(weave),
      resolve: () => null as never,
      skipRelations: false,
    };
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
    return {
      document: toAgocraftDocument(weave),
      resolve: () => null as never,
      skipRelations: false,
    };
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
      attrs: {
        frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
      } as unknown as AgocraftItem["attrs"],
      units: [],
      children: [] as ReadonlyArray<AgocraftItem>,
      meta: { createdAt: META_DATE, updatedAt: META_DATE, schemaVersion: 9 },
    } as unknown as AgocraftItem;
    const doc = addChild(root, childAgocraft, "parent-1");
    const ctx: CommandContext = {
      document: doc,
      resolve: () => null as never,
      skipRelations: false,
    };
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
    expect(res.patches.some((p) => p.type === "item.remove" || p.type === "item.children")).toBe(
      true,
    );
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

// ─── WI-065 / DR-031 — shape ↔ line conversion commands ──────────────────────

function makeLineCtx(): CommandContext {
  const lineItem = {
    id: "line-1",
    kind: "line",
    attrs: {
      frame: FULL_FRAME,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0.1, y: 0.1 },
      ],
      smooth: true,
      heads: { start: "none", end: "none" },
    },
    behaviors: [],
    createdAt: META_DATE,
  } as unknown as Item;
  const weave: WeaveDocument = {
    id: "doc-line",
    title: "Line",
    items: [lineItem],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  const idGen = createUuidV7Generator(defaultClock, defaultRandom);
  return {
    document: toAgocraftDocument(weave),
    resolve: ((token: Token<unknown>) =>
      token === IdGeneratorToken ? idGen : null) as CommandContext["resolve"],
    skipRelations: false,
  };
}

describe("weave.shape.breakToLine + weave.line.closeToShape (WI-065 / DR-031)", () => {
  it("registers both conversion commands with input schemas", () => {
    const cmds = buildWeaveCommands(spyTargets());
    const brk = cmds.find((c) => c.name === "weave.shape.breakToLine");
    const close = cmds.find((c) => c.name === "weave.line.closeToShape");
    expect(brk).toBeDefined();
    expect(close).toBeDefined();
    expect(brk?.inputSchema).toBeDefined();
    expect(close?.inputSchema).toBeDefined();
  });

  it("breakToLine turns a rectangle into a fresh-id line (remove + create)", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.shape.breakToLine");
    const r = nn(cmd).run(makeShapeCtx(), { itemId: "rect-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patches.map((p) => p.type)).toEqual(["item.remove", "item.create"]);
    const create = r.patches[1] as Extract<(typeof r.patches)[number], { type: "item.create" }>;
    expect(create.item.kind).toBe("line");
    expect(create.item.id).not.toBe("rect-1");
    expect(r.value).toBe(create.item.id);
  });

  it("breakToLine rejects an out-of-range vertex index", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.shape.breakToLine");
    const r = nn(cmd).run(makeShapeCtx(), { itemId: "rect-1", vertexIndex: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("invalid-vertex-index");
  });

  it("closeToShape turns a free curve into a fresh-id closed poly shape", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.line.closeToShape");
    const r = nn(cmd).run(makeLineCtx(), { itemId: "line-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patches.map((p) => p.type)).toEqual(["item.remove", "item.create"]);
    const create = r.patches[1] as Extract<(typeof r.patches)[number], { type: "item.create" }>;
    expect(create.item.kind).toBe("shape");
    expect((create.item.attrs as { subAttrs: { closed: boolean } }).subAttrs.closed).toBe(true);
    expect(create.item.id).not.toBe("line-1");
  });
});

// WI-074 / DR-029 — image crop command (+ DR-029 D6 content rotation in cropRatio).
describe("buildWeaveCommands — weave.image.setCrop (WI-074)", () => {
  function makeImageCtx(): CommandContext {
    const weave: WeaveDocument = {
      id: "doc-img",
      title: "Img",
      items: [
        {
          id: "frame-1",
          kind: "frame",
          attrs: { frame: FULL_FRAME },
          behaviors: [],
          createdAt: META_DATE,
        } as unknown as Item,
      ],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    const image = {
      id: makeItemId("img-1"),
      kind: "image",
      attrs: { frame: FULL_FRAME, src: "x", alt: "", fit: "cover", borderRadius: 0 },
      units: [],
      children: [] as ReadonlyArray<AgocraftItem>,
      meta: { createdAt: META_DATE, updatedAt: META_DATE, schemaVersion: 9 },
    } as unknown as AgocraftItem;
    return {
      document: addChild(toAgocraftDocument(weave), image, "frame-1"),
      resolve: ((token: Token<unknown>) =>
        token === IdGeneratorToken
          ? createUuidV7Generator(defaultClock, defaultRandom)
          : null) as CommandContext["resolve"],
      skipRelations: false,
    };
  }
  const cropCmd = () => {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.image.setCrop");
    if (c === undefined) throw new Error("command not found");
    return c;
  };

  it("sets cropRatio via an item.attrs patch, preserving other attrs", () => {
    const result = cropCmd().run(makeImageCtx(), {
      itemId: "img-1",
      crop: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
    });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error?.code ?? "?"}`);
    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect((patch.after as { cropRatio: unknown }).cropRatio).toEqual({
      x: 0.2,
      y: 0.2,
      w: 0.6,
      h: 0.6,
    });
    expect((patch.after as { fit: string }).fit).toBe("cover");
  });

  it("carries rotation INSIDE cropRatio when provided (DR-029 D6)", () => {
    const result = cropCmd().run(makeImageCtx(), {
      itemId: "img-1",
      crop: { x: 0, y: 0, w: 1, h: 1 },
      rotation: 0.1745,
    });
    if (!result.ok) throw new Error("unexpected fail");
    const patch = result.patches[0];
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect((patch.after as { cropRatio: { rotation?: number } }).cropRatio.rotation).toBe(0.1745);
  });

  it("fails not-an-image on a frame target", () => {
    const result = cropCmd().run(makeImageCtx(), {
      itemId: "frame-1",
      crop: { x: 0, y: 0, w: 1, h: 1 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not-an-image");
  });

  it("fails item-not-found for an unknown id", () => {
    const result = cropCmd().run(makeImageCtx(), {
      itemId: "nope",
      crop: { x: 0, y: 0, w: 1, h: 1 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("item-not-found");
  });

  it("rejects out-of-range crop and non-finite rotation with invalid-input", () => {
    const cmd = cropCmd();
    const overflow = cmd.run(makeImageCtx(), {
      itemId: "img-1",
      crop: { x: 0.6, y: 0, w: 0.6, h: 1 },
    });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.error.code).toBe("invalid-input");

    const zeroW = cmd.run(makeImageCtx(), { itemId: "img-1", crop: { x: 0, y: 0, w: 0, h: 1 } });
    expect(zeroW.ok).toBe(false);

    const badRot = cmd.run(makeImageCtx(), {
      itemId: "img-1",
      crop: { x: 0, y: 0, w: 1, h: 1 },
      rotation: Number.POSITIVE_INFINITY,
    });
    expect(badRot.ok).toBe(false);
    if (!badRot.ok) expect(badRot.error.code).toBe("invalid-input");
  });

  // ── WI-074 / DR-029 D7 — weave.item.flip (generic, transform.flip unit) ──
  const flipCmd = () => {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.item.flip");
    if (c === undefined) throw new Error("command not found");
    return c;
  };
  const createdFlipUnit = (
    result: CommandResult<unknown>,
  ): { flipH?: boolean; flipV?: boolean } => {
    if (!result.ok) throw new Error("unexpected fail");
    const create = result.patches.find((p) => (p as { type?: string }).type === "unit.create") as
      | { unit?: { kind?: string; attrs?: { flipH?: boolean; flipV?: boolean } } }
      | undefined;
    if (create === undefined) throw new Error("expected a unit.create patch");
    expect(create.unit?.kind).toBe("transform.flip");
    return create.unit?.attrs ?? {};
  };
  // image item carrying an existing crop window (to assert flip preserves it).
  function makeCroppedImageCtx(): CommandContext {
    const weave: WeaveDocument = {
      id: "doc-img2",
      title: "Img2",
      items: [
        {
          id: "frame-1",
          kind: "frame",
          attrs: { frame: FULL_FRAME },
          behaviors: [],
          createdAt: META_DATE,
        } as unknown as Item,
      ],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    const image = {
      id: makeItemId("img-1"),
      kind: "image",
      attrs: {
        frame: FULL_FRAME,
        src: "x",
        alt: "",
        fit: "cover",
        borderRadius: 0,
        cropRatio: { x: 0.2, y: 0.1, w: 0.5, h: 0.6 },
      },
      units: [],
      children: [] as ReadonlyArray<AgocraftItem>,
      meta: { createdAt: META_DATE, updatedAt: META_DATE, schemaVersion: 9 },
    } as unknown as AgocraftItem;
    return {
      document: addChild(toAgocraftDocument(weave), image, "frame-1"),
      resolve: ((token: Token<unknown>) =>
        token === IdGeneratorToken
          ? createUuidV7Generator(defaultClock, defaultRandom)
          : null) as CommandContext["resolve"],
      skipRelations: false,
    };
  }

  it("toggles a horizontal flip as a transform.flip unit on an image", () => {
    const attrs = createdFlipUnit(
      flipCmd().run(makeImageCtx(), { itemId: "img-1", axis: "horizontal" }),
    );
    expect(attrs).toEqual({ flipH: true, flipV: false });
  });

  it("does NOT touch cropRatio when flipping a cropped image (visible region preserved)", () => {
    const result = flipCmd().run(makeCroppedImageCtx(), { itemId: "img-1", axis: "vertical" });
    if (!result.ok) throw new Error("unexpected fail");
    // Flip is a separate unit — no item.attrs (cropRatio) patch at all.
    expect(result.patches.some((p) => (p as { type?: string }).type === "item.attrs")).toBe(false);
    expect(createdFlipUnit(result)).toEqual({ flipH: false, flipV: true });
  });

  it("allows a frame (display-only flip) and reports item-not-found for unknown ids", () => {
    // `frame` is allow-listed (display-only flip) → succeeds.
    const f = flipCmd().run(makeImageCtx(), { itemId: "frame-1", axis: "horizontal" });
    expect(f.ok).toBe(true);
    // (qr/text rejection — `flip-not-supported` — is exercised in e2e.)
    const b = flipCmd().run(makeImageCtx(), { itemId: "ghost", axis: "horizontal" });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe("item-not-found");
  });
});

describe("weave.item.add — usable-frame guard (DR-078)", () => {
  function addCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.item.add");
    if (c === undefined) throw new Error("command not found");
    return c;
  }
  function frameOf(res: ReturnType<ReturnType<typeof addCmd>["run"]>): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (!res.ok) throw new Error("add failed");
    const create = res.patches.find((p) => p.type === "item.create");
    if (create === undefined) throw new Error("no item.create patch");
    return (
      create as unknown as {
        item: { attrs: { frame: { x: number; y: number; width: number; height: number } } };
      }
    ).item.attrs.frame;
  }

  it("restores a zero WIDTH on a text → never zero-area / unselectable, keeps the given position", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "text",
      frame: { x: 0.1, y: 0.2, width: 0, height: 0.3, rotation: 0 },
    });
    const f = frameOf(res);
    expect(f.width).toBeGreaterThan(0);
    expect(f.x).toBe(0.1); // valid position preserved
    expect(f.y).toBe(0.2);
  });

  it("leaves a finite text HEIGHT (auto-fit) even at 0, but still fixes width", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "text",
      frame: { x: 0, y: 0, width: 0.5, height: 0, rotation: 0 },
    });
    const f = frameOf(res);
    expect(f.width).toBe(0.5);
    expect(f.height).toBe(0); // text auto-fits its height — left as the caller set it
  });

  it("restores a zero HEIGHT on a non-text item (image cannot auto-fit)", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "image",
      frame: { x: 0, y: 0, width: 0.5, height: 0, rotation: 0 },
    });
    const f = frameOf(res);
    expect(f.height).toBeGreaterThan(0);
    expect(f.width).toBe(0.5);
  });

  it("passes a valid frame through unchanged", () => {
    const res = addCmd().run(makeCtx(), {
      kind: "text",
      frame: { x: 0.1, y: 0.2, width: 0.5, height: 0.3, rotation: 0 },
    });
    expect(frameOf(res)).toMatchObject({ x: 0.1, y: 0.2, width: 0.5, height: 0.3 });
  });

  it("an omitted frame keeps the non-degenerate seed (selectable)", () => {
    const f = frameOf(addCmd().run(makeCtx(), { kind: "image" }));
    expect(f.width).toBeGreaterThan(0);
    expect(f.height).toBeGreaterThan(0);
  });
});

describe("px ↔ ratio unit-confusion guard (DR-082 / WI-127)", () => {
  function addCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.item.add");
    if (c === undefined) throw new Error("command not found");
    return c;
  }
  function attrsOf(res: ReturnType<ReturnType<typeof addCmd>["run"]>): Record<string, unknown> {
    if (!res.ok) throw new Error("add failed");
    const create = res.patches.find((p) => p.type === "item.create");
    if (create === undefined) throw new Error("no item.create patch");
    return (create as unknown as { item: { attrs: Record<string, unknown> } }).item.attrs;
  }

  // ── A. fontSizeSpec ──────────────────────────────────────────────────────
  it("add: a px size mis-tagged as a ratio (value 24) is re-tagged as px", () => {
    const a = attrsOf(
      addCmd().run(makeCtx(), {
        kind: "text",
        frame: { x: 0, y: 0, width: 0.5, height: 0.1, rotation: 0 },
        attrsOverride: { fontSizeSpec: { kind: "ratio", value: 24 } },
      }),
    );
    expect(a.fontSizeSpec).toEqual({ kind: "px", value: 24 });
  });

  it("add: a genuine ratio fontSize (0.06) passes through unchanged", () => {
    const a = attrsOf(
      addCmd().run(makeCtx(), {
        kind: "text",
        frame: { x: 0, y: 0, width: 0.5, height: 0.1, rotation: 0 },
        attrsOverride: { fontSizeSpec: { kind: "ratio", value: 0.06 } },
      }),
    );
    expect(a.fontSizeSpec).toEqual({ kind: "ratio", value: 0.06 });
  });

  it("add: an explicit px fontSize is left alone", () => {
    const a = attrsOf(
      addCmd().run(makeCtx(), {
        kind: "text",
        frame: { x: 0, y: 0, width: 0.5, height: 0.1, rotation: 0 },
        attrsOverride: { fontSizeSpec: { kind: "px", value: 24 } },
      }),
    );
    expect(a.fontSizeSpec).toEqual({ kind: "px", value: 24 });
  });

  it("update: a px size mis-tagged as a ratio is re-tagged as px (item.update)", () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.update");
    if (cmd === undefined) throw new Error("command not found");
    const res = cmd.run(makePartialEditCtx(), {
      itemId: "text-1",
      attrs: { fontSizeSpec: { kind: "ratio", value: 48 } },
    });
    if (!res.ok) throw new Error("update failed");
    const patch = res.patches.find((p) => p.type === "item.attrs");
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect((patch.after as Record<string, unknown>).fontSizeSpec).toEqual({
      kind: "px",
      value: 48,
    });
  });

  it("update: the UI `patch` form PRESERVES a >1 ratio (small-parent toggle, not re-tagged)", () => {
    // The px/% toggle goes through `patch`; a font taller than a small nested
    // parent legitimately yields ratio > 1. It must NOT be coerced to px (that
    // snapped the unit back and flickered px↔% mid-drag — the reported bug).
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.update");
    if (cmd === undefined) throw new Error("command not found");
    const res = cmd.run(makePartialEditCtx(), {
      itemId: "text-1",
      patch: (it: Item) => ({
        ...it,
        attrs: {
          ...(it.attrs as unknown as Record<string, unknown>),
          fontSizeSpec: { kind: "ratio", value: 1.2 },
        } as unknown as Item["attrs"],
      }),
    });
    if (!res.ok) throw new Error("update failed");
    const patch = res.patches.find((p) => p.type === "item.attrs");
    if (patch === undefined || patch.type !== "item.attrs") throw new Error("expected item.attrs");
    expect((patch.after as Record<string, unknown>).fontSizeSpec).toEqual({
      kind: "ratio",
      value: 1.2,
    });
  });

  // ── B. frame side oversize ───────────────────────────────────────────────
  it("add: a frame width of 24 (2400% of parent) is restored to a sane seed side", () => {
    const f = frameOf(
      addCmd().run(makeCtx(), {
        kind: "image",
        frame: { x: 0.1, y: 0.1, width: 24, height: 0.4, rotation: 0 },
      }),
    );
    expect(f.width).toBeLessThanOrEqual(3);
    expect(f.width).toBeGreaterThan(0);
    expect(f.x).toBe(0.1); // position preserved
    expect(f.height).toBe(0.4); // valid side untouched
  });

  it("add: modest overflow (width 1.05, intentional bleed) passes through", () => {
    const f = frameOf(
      addCmd().run(makeCtx(), {
        kind: "image",
        frame: { x: 0, y: 0, width: 1.05, height: 0.4, rotation: 0 },
      }),
    );
    expect(f.width).toBe(1.05);
  });

  function frameOf(res: ReturnType<ReturnType<typeof addCmd>["run"]>): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (!res.ok) throw new Error("add failed");
    const create = res.patches.find((p) => p.type === "item.create");
    if (create === undefined) throw new Error("no item.create patch");
    return (
      create as unknown as {
        item: { attrs: { frame: { x: number; y: number; width: number; height: number } } };
      }
    ).item.attrs.frame;
  }
});

// WI-147 — agent-only min-size guard. The predicate is pure; the command rejects
// an agent-flagged add below the legibility floor and leaves manual adds alone.
describe("checkAddedItemMinSize (WI-147 predicate)", () => {
  it("accepts a box clearing both long-side AND area floors", () => {
    expect(checkAddedItemMinSize("frame", 100, 60).ok).toBe(true);
    expect(checkAddedItemMinSize("shape", MIN_ITEM_SIDE_PX, MIN_ITEM_SIDE_PX).ok).toBe(true);
  });

  it("accepts a deliberately-thin divider box (long side carries it)", () => {
    // 2px×400px: long 400 ≥ 10 AND area 800 ≥ 20 → legal, not a speck.
    expect(checkAddedItemMinSize("shape", 2, 400).ok).toBe(true);
  });

  it("rejects a box whose LONG side is below the floor (speck)", () => {
    const v = checkAddedItemMinSize("frame", 4, 4);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("긴 변");
  });

  it("the area floor bites independently of the long side", () => {
    // 200px×0.05px: long 200 ≥ 10 but area 10 < 20 → rejected by the area rule.
    const v = checkAddedItemMinSize("shape", 200, 0.05);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("면적");
  });

  it("rejects a tiny speck (both long side and area below floor)", () => {
    expect(checkAddedItemMinSize("shape", 3, 3).ok).toBe(false);
  });

  it("text is width-only — height is ignored (auto-fits)", () => {
    // A wide text with a (meaningless at add time) tiny height still passes.
    expect(checkAddedItemMinSize("text", 200, 1).ok).toBe(true);
    // A sub-10px width text is rejected with a text-specific reason.
    const v = checkAddedItemMinSize("text", 6, 200);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("너비");
  });

  it("line is length-only — a thin bbox passes when long enough", () => {
    expect(checkAddedItemMinSize("line", 400, 0.5).ok).toBe(true);
    const v = checkAddedItemMinSize("line", 4, 0.5);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("선 길이");
  });

  it("the area floor is the user's spec value", () => {
    expect(MIN_ITEM_SIDE_PX).toBe(10);
    expect(MIN_ITEM_AREA_PX2).toBe(20);
  });
});

describe("weave.item.add — min-size reject (WI-147)", () => {
  const addCmd = () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
    if (cmd === undefined) throw new Error("command not found");
    return cmd;
  };
  // 1920×1080 root: a 0.004 ratio → ~7.7×4.3px, well under the 10px floor.
  const TINY = { x: 0.1, y: 0.1, width: 0.004, height: 0.004, rotation: 0 };
  const ROOMY = { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 };
  const guard = { enforceMinSize: true, designWidth: 1920, designHeight: 1080 };

  it("REJECTS an agent-flagged add below the px floor (no patches, has reason)", () => {
    const result = addCmd().run(makeCtx(), { kind: "frame", frame: TINY, ...guard });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("item-too-small");
      expect(result.error.message).toContain("거부");
    }
  });

  it("ACCEPTS an agent-flagged add that clears the floor", () => {
    const result = addCmd().run(makeCtx(), { kind: "frame", frame: ROOMY, ...guard });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patches).toHaveLength(1);
  });

  it("does NOT guard a manual add (no enforceMinSize) — tiny still succeeds", () => {
    const result = addCmd().run(makeCtx(), { kind: "frame", frame: TINY });
    expect(result.ok).toBe(true);
  });

  it("fails OPEN when design px is missing even with the flag set", () => {
    const result = addCmd().run(makeCtx(), { kind: "frame", frame: TINY, enforceMinSize: true });
    expect(result.ok).toBe(true);
  });
});

describe("weave.item.add — container-is-frame reject (WI-150 / DR-105)", () => {
  const addCmd = () => {
    const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
    if (cmd === undefined) throw new Error("command not found");
    return cmd;
  };
  // Root with a layout FRAME and a TEXT leaf as siblings — the agent's "dump the
  // calendar dates under the SAT header text" mistake targets the leaf.
  function ctxWithLeaf(): CommandContext {
    const textLeaf = {
      id: "text-leaf-1",
      kind: "text",
      attrs: { frame: FULL_FRAME, textRuns: [] },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const frame = {
      id: "grid-frame-1",
      kind: "frame",
      attrs: { frame: FULL_FRAME },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const weave: WeaveDocument = {
      id: "doc-leaf",
      title: "Leaf",
      items: [frame, textLeaf],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    return {
      document: toAgocraftDocument(weave),
      resolve: () => null as never,
      skipRelations: false,
    };
  }
  const BOX = { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 };

  it("REJECTS an agent-flagged add whose containerId is a non-frame leaf", () => {
    const result = addCmd().run(ctxWithLeaf(), {
      kind: "text",
      frame: BOX,
      containerId: "text-leaf-1",
      enforceContainerIsFrame: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("container-not-frame");
      expect(result.error.message).toContain("거부");
    }
  });

  it("ACCEPTS an agent-flagged add whose containerId is a real frame", () => {
    const result = addCmd().run(ctxWithLeaf(), {
      kind: "text",
      frame: BOX,
      containerId: "grid-frame-1",
      enforceContainerIsFrame: true,
    });
    expect(result.ok).toBe(true);
  });

  it("ACCEPTS an agent-flagged add into the root (a container, though kind is not 'frame')", () => {
    const result = addCmd().run(ctxWithLeaf(), {
      kind: "frame",
      frame: BOX,
      enforceContainerIsFrame: true,
    });
    expect(result.ok).toBe(true);
  });

  it("does NOT guard a manual add (no flag) targeting a leaf container", () => {
    const result = addCmd().run(ctxWithLeaf(), {
      kind: "text",
      frame: BOX,
      containerId: "text-leaf-1",
    });
    expect(result.ok).toBe(true);
  });
});

// ─── WI-155 — weave.page.duplicate (rail per-page duplicate) ──────────────
//
// Kit duplicate with `offset: 0` (a FULL_FRAME page clone must land exactly
// on the source's frame — the 0.02 nudge would knock it out of the page box)
// composed with a same-transaction `document.attrs` patch that inserts the
// clone into `presentationOrder` right after the source.
describe("weave.page.duplicate (WI-155)", () => {
  function makePagesCtx(): CommandContext {
    const page1 = {
      id: "page-1",
      kind: "frame",
      attrs: { frame: FULL_FRAME, title: "P1" },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const page2 = {
      id: "page-2",
      kind: "frame",
      attrs: { frame: FULL_FRAME, title: "P2" },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    // WI-072 — a frame opted OUT of the deck: not in presentationOrder.
    const group = {
      id: "group-1",
      kind: "frame",
      attrs: { frame: FULL_FRAME, presentable: false },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const rect = {
      id: "rect-page-1",
      kind: "shape",
      attrs: {
        frame: FULL_FRAME,
        shape: "rectangle",
        subAttrs: { shape: "rectangle" },
      },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const weave: WeaveDocument = {
      id: "doc-pages",
      title: "Pages",
      items: [page1, page2, group, rect],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    const idGen = createUuidV7Generator(defaultClock, defaultRandom);
    return {
      document: toAgocraftDocument(weave),
      resolve: ((token: Token<unknown>) =>
        token === IdGeneratorToken ? idGen : null) as CommandContext["resolve"],
      skipRelations: false,
    };
  }

  function cmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.page.duplicate");
    if (c === undefined) throw new Error("command not found");
    return c;
  }

  it("clones a page IN PLACE (offset 0 — clone frame identical to source) and inserts it right after the source in presentationOrder, in ONE transaction", () => {
    const ctx = makePagesCtx();
    const rootId = String(ctx.document.root.id);
    const result = cmd().run(ctx, { itemId: "page-1" });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
    expect(result.patches).toHaveLength(2);
    const [create, attrs] = result.patches;
    if (create === undefined || create.type !== "item.create")
      throw new Error("expected item.create first");
    expect(String(create.parentId)).toBe(rootId);
    // offset 0: the clone's frame is the source's frame, not a 0.02 nudge.
    expect((create.item.attrs as { frame: unknown }).frame).toEqual(FULL_FRAME);
    expect(String(create.item.id)).toBe(result.value);
    // fresh id — never the source's.
    expect(result.value).not.toBe("page-1");
    if (attrs === undefined || attrs.type !== "document.attrs")
      throw new Error("expected document.attrs second");
    expect((attrs.after as { presentationOrder: unknown }).presentationOrder).toEqual([
      "page-1",
      result.value,
      "page-2",
    ]);
  });

  it("refuses a non-frame item (`not-a-page`) — pages are frames", () => {
    const result = cmd().run(makePagesCtx(), { itemId: "rect-page-1" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.error.code).toBe("not-a-page");
  });

  it("fails `item-not-found` for an unknown id", () => {
    const result = cmd().run(makePagesCtx(), { itemId: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.error.code).toBe("item-not-found");
  });

  it("skips the order patch when the source is NOT a deck member (presentable:false) — the clone inherits the flag and stays out of the order too", () => {
    const result = cmd().run(makePagesCtx(), { itemId: "group-1" });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0]?.type).toBe("item.create");
    // the clone carries presentable:false (deep-cloned attrs).
    const create = result.patches[0];
    if (create === undefined || create.type !== "item.create") throw new Error("unreachable");
    expect((create.item.attrs as { presentable?: boolean }).presentable).toBe(false);
  });

  // ─── WI-184 ⑨ — weave.pages.duplicate (rail multi-select SET copy) ──────
  //
  // One kit batch clone (offset 0) + ONE order patch interleaving each clone
  // right after its own source — one transaction → one Cmd+Z for the set.
  // Not a host loop over weave.page.duplicate (that would be N undo steps).
  describe("weave.pages.duplicate (WI-184 ⑨)", () => {
    function pagesCmd() {
      const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.pages.duplicate");
      if (c === undefined) throw new Error("command not found");
      return c;
    }

    it("clones a SET in one transaction; each clone slots right after its own source", () => {
      const ctx = makePagesCtx();
      const result = pagesCmd().run(ctx, { itemIds: ["page-1", "page-2"] });
      if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
      expect(result.value).toHaveLength(2);
      const [c1, c2] = result.value as ReadonlyArray<string>;
      // 2 creates + 1 order patch — the WHOLE set is one undo step.
      expect(result.patches).toHaveLength(3);
      expect(result.patches.filter((p) => p.type === "item.create")).toHaveLength(2);
      const attrs = result.patches[2];
      if (attrs === undefined || attrs.type !== "document.attrs")
        throw new Error("expected document.attrs last");
      expect((attrs.after as { presentationOrder: unknown }).presentationOrder).toEqual([
        "page-1",
        c1,
        "page-2",
        c2,
      ]);
    });

    it("offset 0 — every clone's frame is identical to its source (page-box lock)", () => {
      const result = pagesCmd().run(makePagesCtx(), { itemIds: ["page-1", "page-2"] });
      if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
      for (const p of result.patches) {
        if (p.type !== "item.create") continue;
        expect((p.item.attrs as { frame: unknown }).frame).toEqual(FULL_FRAME);
      }
    });

    it("validates the WHOLE set upfront: one non-frame fails the call (`not-a-page`), one unknown id fails (`item-not-found`), empty input fails (`empty-input`)", () => {
      const notAPage = pagesCmd().run(makePagesCtx(), { itemIds: ["page-1", "rect-page-1"] });
      expect(notAPage.ok).toBe(false);
      if (!notAPage.ok) expect(notAPage.error.code).toBe("not-a-page");
      const notFound = pagesCmd().run(makePagesCtx(), { itemIds: ["page-1", "nope"] });
      expect(notFound.ok).toBe(false);
      if (!notFound.ok) expect(notFound.error.code).toBe("item-not-found");
      const empty = pagesCmd().run(makePagesCtx(), { itemIds: [] });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.error.code).toBe("empty-input");
    });

    it("skips the order patch when NO source is a deck member (presentable:false set)", () => {
      const result = pagesCmd().run(makePagesCtx(), { itemIds: ["group-1"] });
      if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
      expect(result.patches).toHaveLength(1);
      expect(result.patches[0]?.type).toBe("item.create");
    });
  });

  // ─── WI-184 ⑩ — weave.page.add (insert-after-current page creation) ─────
  //
  // Promoted from an agent-surface alias over weave.item.add: the REAL command
  // stamps kind/container/frame (WI-169 FULL_FRAME lock) and splices the new
  // page into `presentationOrder` right after `afterId`, one transaction —
  // 5/5-tool consensus puts a new slide after the current one, not at the end.
  describe("weave.page.add (WI-184 ⑩)", () => {
    function pageAddCmd() {
      const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.page.add");
      if (c === undefined) throw new Error("command not found");
      return c;
    }

    it("creates a FULL_FRAME root frame and inserts it right after `afterId` in presentationOrder, in ONE transaction", () => {
      const ctx = makePagesCtx();
      const rootId = String(ctx.document.root.id);
      const result = pageAddCmd().run(ctx, { afterId: "page-1" });
      if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
      expect(result.patches).toHaveLength(2);
      const [create, attrs] = result.patches;
      if (create === undefined || create.type !== "item.create")
        throw new Error("expected item.create first");
      expect(String(create.parentId)).toBe(rootId);
      expect(create.item.kind).toBe("frame");
      // WI-169 page-box lock: every page is FULL_FRAME at the same coords.
      expect((create.item.attrs as { frame: unknown }).frame).toEqual(FULL_FRAME);
      if (attrs === undefined || attrs.type !== "document.attrs")
        throw new Error("expected document.attrs second");
      expect((attrs.after as { presentationOrder: unknown }).presentationOrder).toEqual([
        "page-1",
        result.value,
        "page-2",
      ]);
    });

    it("omitted/unknown afterId → appended at the deck end (legacy + empty-deck degenerate case)", () => {
      const result = pageAddCmd().run(makePagesCtx(), {});
      if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
      const attrs = result.patches[1];
      if (attrs === undefined || attrs.type !== "document.attrs")
        throw new Error("expected document.attrs second");
      expect((attrs.after as { presentationOrder: unknown }).presentationOrder).toEqual([
        "page-1",
        "page-2",
        result.value,
      ]);
      const unknownAfter = pageAddCmd().run(makePagesCtx(), { afterId: "nope" });
      if (!unknownAfter.ok) throw new Error("expected ok");
      const attrs2 = unknownAfter.patches[1];
      if (attrs2 === undefined || attrs2.type !== "document.attrs")
        throw new Error("expected document.attrs second");
      expect((attrs2.after as { presentationOrder: unknown }).presentationOrder).toEqual([
        "page-1",
        "page-2",
        unknownAfter.value,
      ]);
    });

    it("forwards attrsOverride onto the created page (background styling in the same call)", () => {
      const result = pageAddCmd().run(makePagesCtx(), {
        afterId: "page-2",
        attrsOverride: { title: "새 페이지" },
      });
      if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
      const create = result.patches[0];
      if (create === undefined || create.type !== "item.create") throw new Error("unreachable");
      expect((create.item.attrs as { title?: string }).title).toBe("새 페이지");
    });
  });
});

// ─── WI-185 ⑬ — weave.items.duplicateWithDelta (smart duplicate) ──────────
//
// Kit clone at `offset: 0` (delegate-run) + one item.attrs translate patch
// per clone root, all in ONE transaction → one Cmd+Z removes clone+translate
// together. `before: source.attrs` is exact because an offset-0 clone's attrs
// ARE the source's; patches apply sequentially, so the translate lands after
// the clone's item.create.
describe("weave.items.duplicateWithDelta (WI-185 ⑬)", () => {
  const FRAME_A = { x: 0.1, y: 0.2, width: 0.2, height: 0.1, rotation: 0 } as const;
  const FRAME_B = { x: 0.5, y: 0.6, width: 0.1, height: 0.1, rotation: 0 } as const;

  function makeDeltaCtx(): CommandContext {
    const shapeA = {
      id: "shape-a",
      kind: "shape",
      attrs: { frame: FRAME_A, shape: "rectangle", subAttrs: { shape: "rectangle" } },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const shapeB = {
      id: "shape-b",
      kind: "shape",
      attrs: { frame: FRAME_B, shape: "rectangle", subAttrs: { shape: "rectangle" } },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const weave: WeaveDocument = {
      id: "doc-delta",
      title: "Delta",
      items: [shapeA, shapeB],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    const idGen = createUuidV7Generator(defaultClock, defaultRandom);
    return {
      document: toAgocraftDocument(weave),
      resolve: ((token: Token<unknown>) =>
        token === IdGeneratorToken ? idGen : null) as CommandContext["resolve"],
      skipRelations: false,
    };
  }

  function deltaCmd() {
    const c = buildWeaveCommands(spyTargets()).find(
      (x) => x.name === "weave.items.duplicateWithDelta",
    );
    if (c === undefined) throw new Error("command not found");
    return c;
  }

  it("clones at offset 0 then translates each clone by (dx, dy) — N creates + N item.attrs in ONE transaction", () => {
    const result = deltaCmd().run(makeDeltaCtx(), {
      itemIds: ["shape-a", "shape-b"],
      dx: 0.25,
      dy: -0.05,
    });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
    const cloneIds = result.value as ReadonlyArray<string>;
    expect(cloneIds).toHaveLength(2);
    const creates = result.patches.filter((p) => p.type === "item.create");
    const translates = result.patches.filter((p) => p.type === "item.attrs");
    expect(creates).toHaveLength(2);
    expect(translates).toHaveLength(2);
    // offset 0: the staged clone holds the source's exact frame…
    const c0 = creates[0];
    if (c0 === undefined || c0.type !== "item.create") throw new Error("unreachable");
    expect((c0.item.attrs as { frame: unknown }).frame).toEqual(FRAME_A);
    // …and the translate patch targets the CLONE (not the source) with the
    // source attrs as `before` (offset-0 clone attrs === source attrs).
    const t0 = translates[0];
    if (t0 === undefined || t0.type !== "item.attrs") throw new Error("unreachable");
    expect(String(t0.itemId)).toBe(cloneIds[0]);
    expect((t0.before as { frame: unknown }).frame).toEqual(FRAME_A);
    expect((t0.after as { frame: { x: number; y: number } }).frame).toEqual({
      ...FRAME_A,
      x: FRAME_A.x + 0.25,
      y: FRAME_A.y - 0.05,
    });
    const t1 = translates[1];
    if (t1 === undefined || t1.type !== "item.attrs") throw new Error("unreachable");
    expect(String(t1.itemId)).toBe(cloneIds[1]);
    expect((t1.after as { frame: { x: number; y: number } }).frame).toEqual({
      ...FRAME_B,
      x: FRAME_B.x + 0.25,
      y: FRAME_B.y - 0.05,
    });
  });

  it("the patch sequence APPLIES: the translate finds the clone created earlier in the same transaction", () => {
    const ctx = makeDeltaCtx();
    const result = deltaCmd().run(ctx, { itemIds: ["shape-a"], dx: 0.3, dy: 0.1 });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
    let doc = ctx.document;
    for (const p of result.patches) {
      doc = applyChangeToDocument(doc, p as Parameters<typeof applyChangeToDocument>[1]);
    }
    const cloneId = nn((result.value as ReadonlyArray<string>)[0]);
    const clone = doc.root.children.find((c) => String(c.id) === cloneId);
    expect(clone).toBeDefined();
    expect((clone?.attrs as { frame: { x: number; y: number } }).frame.x).toBeCloseTo(0.4);
    expect((clone?.attrs as { frame: { x: number; y: number } }).frame.y).toBeCloseTo(0.3);
    // the source is untouched.
    const source = doc.root.children.find((c) => String(c.id) === "shape-a");
    expect((source?.attrs as { frame: unknown }).frame).toEqual(FRAME_A);
  });

  it("validates upfront: unknown id fails the WHOLE call, empty input and non-finite deltas refuse", () => {
    const notFound = deltaCmd().run(makeDeltaCtx(), {
      itemIds: ["shape-a", "nope"],
      dx: 0.1,
      dy: 0.1,
    });
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) expect(notFound.error.code).toBe("item-not-found");
    const empty = deltaCmd().run(makeDeltaCtx(), { itemIds: [], dx: 0.1, dy: 0.1 });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("empty-input");
    const nan = deltaCmd().run(makeDeltaCtx(), { itemIds: ["shape-a"], dx: Number.NaN, dy: 0 });
    expect(nan.ok).toBe(false);
    if (!nan.ok) expect(nan.error.code).toBe("invalid-input");
  });
});

// ─── WI-185 ⑭ — weave.items.group (Cmd+G wrap-in-frame) ───────────────────
//
// weave's grouping construct IS the frame: group = create a frame over the
// selection's bbox + reparent the members into it, one transaction. The
// composite delegates to weave.item.add and weave.item.reparent against an
// EVOLVED working doc (the weave.batch idiom), so the reparent geometry can
// resolve the just-created wrap frame.
describe("weave.items.group (WI-185 ⑭)", () => {
  const FRAME_A = { x: 0.1, y: 0.2, width: 0.2, height: 0.1, rotation: 0 } as const;
  const FRAME_B = { x: 0.5, y: 0.6, width: 0.1, height: 0.1, rotation: 0 } as const;

  function makeGroupCtx(): CommandContext {
    const shapeA = {
      id: "shape-a",
      kind: "shape",
      attrs: { frame: FRAME_A, shape: "rectangle", subAttrs: { shape: "rectangle" } },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const shapeB = {
      id: "shape-b",
      kind: "shape",
      attrs: { frame: FRAME_B, shape: "rectangle", subAttrs: { shape: "rectangle" } },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    // A nested child for the mixed-parents guard.
    const holder = {
      id: "holder",
      kind: "frame",
      attrs: { frame: { x: 0.7, y: 0.1, width: 0.2, height: 0.2, rotation: 0 } },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const weave: WeaveDocument = {
      id: "doc-group",
      title: "Group",
      items: [shapeA, shapeB, holder],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    const idGen = createUuidV7Generator(defaultClock, defaultRandom);
    const doc = toAgocraftDocument(weave);
    // Tuck a child under `holder` so "shape-a + nested" is a cross-parent set.
    const nested = {
      id: makeItemId("nested-1"),
      kind: "shape",
      attrs: { frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 } },
      units: [],
      children: [],
      meta: { schemaVersion: 3, createdAt: META_DATE, updatedAt: META_DATE },
    };
    const docWithNested = addChild(doc, nested as unknown as AgocraftItem, "holder");
    return {
      document: docWithNested,
      resolve: ((token: Token<unknown>) =>
        token === IdGeneratorToken ? idGen : null) as CommandContext["resolve"],
      skipRelations: false,
    };
  }

  function groupCmd() {
    const c = buildWeaveCommands(spyTargets()).find((x) => x.name === "weave.items.group");
    if (c === undefined) throw new Error("command not found");
    return c;
  }

  it("wraps siblings in a NEW frame sized to their bbox and reparents them in — one transaction, visual position preserved", () => {
    const ctx = makeGroupCtx();
    const result = groupCmd().run(ctx, {
      itemIds: ["shape-a", "shape-b"],
      designWidth: 800,
      designHeight: 600,
    });
    if (!result.ok) throw new Error(`unexpected fail: ${result.error.code}`);
    const groupId = result.value as string;
    // First patch creates the wrap frame at the members' bounding box.
    const create = result.patches.find((p) => p.type === "item.create");
    if (create === undefined || create.type !== "item.create")
      throw new Error("expected an item.create");
    expect(String(create.item.id)).toBe(groupId);
    expect(create.item.kind).toBe("frame");
    const gFrame = (create.item.attrs as { frame: ItemFrameLike }).frame;
    expect(gFrame.x).toBeCloseTo(0.1);
    expect(gFrame.y).toBeCloseTo(0.2);
    expect(gFrame.width).toBeCloseTo(0.5);
    expect(gFrame.height).toBeCloseTo(0.5);
    // Apply the whole transaction and check the resulting tree + geometry.
    let doc = ctx.document;
    for (const p of result.patches) {
      doc = applyChangeToDocument(doc, p as Parameters<typeof applyChangeToDocument>[1]);
    }
    const group = doc.root.children.find((c) => String(c.id) === groupId);
    expect(group).toBeDefined();
    // Membership, not order — fresh-group z-order is not part of this contract.
    const byId = new Map((group?.children ?? []).map((c) => [String(c.id), c]));
    expect([...byId.keys()].sort()).toEqual(["shape-a", "shape-b"]);
    // Visual position preserved: child ratio × group box = original box.
    const aFrame = (byId.get("shape-a")?.attrs as { frame: ItemFrameLike }).frame;
    expect(aFrame.x).toBeCloseTo(0); // (0.1 − 0.1) / 0.5
    expect(aFrame.y).toBeCloseTo(0);
    expect(aFrame.width).toBeCloseTo(0.4); // 0.2 / 0.5
    expect(aFrame.height).toBeCloseTo(0.2);
    const bFrame = (byId.get("shape-b")?.attrs as { frame: ItemFrameLike }).frame;
    expect(bFrame.x).toBeCloseTo(0.8); // (0.5 − 0.1) / 0.5
    expect(bFrame.y).toBeCloseTo(0.8);
    // The originals left the root.
    const rootIds = doc.root.children.map((c) => String(c.id));
    expect(rootIds).not.toContain("shape-a");
    expect(rootIds).not.toContain("shape-b");
  });

  it("refuses a cross-parent set (`mixed-parents`) — a group wraps siblings", () => {
    const result = groupCmd().run(makeGroupCtx(), { itemIds: ["shape-a", "nested-1"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("mixed-parents");
  });

  it("validates upfront: unknown id and empty input refuse", () => {
    const notFound = groupCmd().run(makeGroupCtx(), { itemIds: ["shape-a", "nope"] });
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) expect(notFound.error.code).toBe("item-not-found");
    const empty = groupCmd().run(makeGroupCtx(), { itemIds: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("empty-input");
  });
});

// WI-224 — paste honors the destination layout's add-rule (routes through the
// engine's onChildAdd instead of the kit's stacking frame).
describe("weave.clipboard.paste — layout add-rule placement (WI-224)", () => {
  const META9 = { createdAt: META_DATE, updatedAt: META_DATE, schemaVersion: 9 };
  const cell = (id: string, col: number, row: number): AgocraftItem =>
    ({
      id: makeItemId(id),
      kind: "frame",
      attrs: {
        frame: { x: 0, y: 0, width: 0.5, height: 0.5, rotation: 0 },
        layoutChild: makeGridChildPolicy({ column: col, columnSpan: 1, row, rowSpan: 1 }),
      },
      units: [],
      children: [],
      meta: { ...META9 },
    }) as unknown as AgocraftItem;

  function makeFullGridCtx(): CommandContext {
    // A full 2×2 auto-grid (4 cells occupied) at root.
    const gridFrame = {
      id: "grid-1",
      kind: "frame",
      attrs: {
        frame: FULL_FRAME,
        layout: makeGridSpec({
          columns: [makeTrackFr(1), makeTrackFr(1)],
          rows: [makeTrackFr(1), makeTrackFr(1)],
        }),
      },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const weave: WeaveDocument = {
      id: "doc-grid",
      title: "Grid",
      items: [gridFrame],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    let doc = toAgocraftDocument(weave);
    for (const [id, col, row] of [
      ["c0", 1, 1],
      ["c1", 2, 1],
      ["c2", 1, 2],
      ["c3", 2, 2],
    ] as const) {
      doc = addChild(doc, cell(id, col, row), "grid-1");
    }
    const idGen = createUuidV7Generator(defaultClock, defaultRandom);
    return {
      document: doc,
      resolve: ((token: Token<unknown>) =>
        token === IdGeneratorToken ? idGen : null) as CommandContext["resolve"],
      skipRelations: false,
    };
  }

  it("places a paste into a FULL grid in its OWN new cell (grows tracks) — never the source overlap frame", () => {
    // ONE command set so copy + paste share the clipboard transport closure.
    const cmds = buildWeaveCommands(spyTargets());
    const copy = nn(cmds.find((c) => c.name === "weave.clipboard.copy"));
    const paste = nn(cmds.find((c) => c.name === "weave.clipboard.paste"));
    const ctx = makeFullGridCtx();

    const copyRes = copy.run(ctx, { itemIds: ["c0"] });
    expect(copyRes.ok).toBe(true);

    const pasteRes = paste.run(ctx, {
      containerId: "grid-1",
      containerSizePx: { width: 800, height: 600 },
    });
    expect(pasteRes.ok).toBe(true);
    if (!pasteRes.ok) return;

    // The pasted item is created under the grid…
    const create = pasteRes.patches.find((p) => p.type === "item.create");
    if (create === undefined || create.type !== "item.create") throw new Error("no item.create");
    expect(String(create.parentId)).toBe("grid-1");

    // …with a GRID cell policy (routed through onChildAdd), not the bare
    // stacking frame — and that cell is the next free one (row 3, the grid grew).
    const policy = (create.item.attrs as { layoutChild?: { kind?: string; row?: number } })
      .layoutChild;
    expect(policy?.kind).toBe("auto-grid");
    expect(policy?.row).toBe(3); // 2×2 full → grew to 2×3, new item in the fresh row

    // The grid's track count grew (parentPatch / item.layout), proving it didn't
    // stack the paste onto the last existing cell.
    const grew = pasteRes.patches.find(
      (p) => p.type === "item.layout" && String(p.itemId) === "grid-1",
    );
    expect(grew).toBeDefined();
  });

  it("leaves a paste into the ROOT canvas as free placement (no grid policy)", () => {
    const cmds = buildWeaveCommands(spyTargets());
    const copy = nn(cmds.find((c) => c.name === "weave.clipboard.copy"));
    const paste = nn(cmds.find((c) => c.name === "weave.clipboard.paste"));
    const ctx = makeFullGridCtx();
    copy.run(ctx, { itemIds: ["grid-1"] });
    const pasteRes = paste.run(ctx, { containerSizePx: { width: 800, height: 600 } });
    expect(pasteRes.ok).toBe(true);
    if (!pasteRes.ok) return;
    const create = pasteRes.patches.find((p) => p.type === "item.create");
    if (create === undefined || create.type !== "item.create") throw new Error("no item.create");
    expect(String(create.parentId)).toBe(String(ctx.document.root.id));
    // No layout re-stamp at the root (free placement).
    expect((create.item.attrs as { layoutChild?: unknown }).layoutChild).toBeUndefined();
  });

  // WI-226 — (re)setting a grid layout covers existing AUTHORED cells so the
  // agent re-asserting a too-small spec can't push a row-3 child out of bounds
  // (→ clamp → stack). This is the host-side guard complementing the engine grow.
  it("setFrameLayout grows the grid to cover an existing high-row child cell", () => {
    // Grid frame (2×1) holding a child AUTHORED at row 3.
    const gridFrame = {
      id: "grid-2",
      kind: "frame",
      attrs: {
        frame: FULL_FRAME,
        layout: makeGridSpec({ columns: [makeTrackFr(1), makeTrackFr(1)], rows: [makeTrackFr(1)] }),
      },
      behaviors: [],
      createdAt: META_DATE,
    } as unknown as Item;
    const weave: WeaveDocument = {
      id: "doc-grid2",
      title: "Grid2",
      items: [gridFrame],
      updatedAt: META_DATE,
      schemaVersion: 3,
    };
    const doc = addChild(toAgocraftDocument(weave), cell("hi", 2, 3), "grid-2");
    const ctx: CommandContext = { document: doc, resolve: () => null as never, skipRelations: false };

    const setLayout = nn(
      buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.frame.setLayout"),
    );
    // Re-assert a SMALL 2×1 spec — the guard must grow rows to cover the row-3 cell.
    const res = setLayout.run(ctx, {
      itemId: "grid-2",
      layout: { kind: "auto-grid", columns: [makeTrackFr(1), makeTrackFr(1)], rows: [makeTrackFr(1)] },
    } as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const layoutPatch = res.patches.find((p) => p.type === "item.layout");
    if (layoutPatch === undefined || layoutPatch.type !== "item.layout") {
      throw new Error("no item.layout patch");
    }
    const after = (layoutPatch as { after: { rows: unknown[]; columns: unknown[] } }).after;
    expect(after.columns.length).toBe(2); // column count preserved
    expect(after.rows.length).toBeGreaterThanOrEqual(3); // grown to cover row 3
  });
});

type ItemFrameLike = { x: number; y: number; width: number; height: number };
