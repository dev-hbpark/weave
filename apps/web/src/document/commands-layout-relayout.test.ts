// WI-020 / WI-043 FIX — relayout-on-child-add integration test.
//
// Regression guard for the bug "adding an item always lands it in the
// frame center, no auto-arrangement". The fix wires `weave.item.add` to
// recompute the parent's Auto Layout (auto-flex / auto-grid) when a child
// is added, so the new child + every sibling land at their spec-computed
// frames in one transaction.
//
// This is a unit/integration test (command run() against an in-memory
// CommandContext) — NOT a Playwright e2e. The e2e suite (5 scenarios) +
// axe smoke remain deferred under the Operational Readiness policy.
//
// Gated on WI020_LAYOUT_VARIANTS_ENABLED: when the flag is off the
// adapters aren't mounted and relayout is a no-op, so the assertions only
// hold when the feature is enabled.

import type { Patch } from "@agocraft/core";
import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  type AutoGridSpec,
  type CommandContext,
  createAutoFlexChildPolicy,
  createAutoFlexSpec,
  createAutoGridChildPolicy,
  createAutoGridSpec,
  type LayoutSpec,
  itemId as makeItemId,
  trackFr,
} from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import { nn } from "../lib/nn.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "./commands.js";
import { WI020_LAYOUT_VARIANTS_ENABLED } from "./layout/registry.js";

const META = {
  createdAt: "2026-05-28T00:00:00Z",
  updatedAt: "2026-05-28T00:00:00Z",
  schemaVersion: 11,
};

/** WI-024 — `weave.item.add` now emits a self-contained `item.create`; the new
 *  child's computed frame lives in the carried subtree's `attrs.frame`. */
function createdFrame(patches: ReadonlyArray<Patch>): Record<string, number> | undefined {
  const p = patches.find((x) => x.type === "item.create");
  if (p === undefined || p.type !== "item.create") return undefined;
  return (p.item.attrs as { frame?: Record<string, number> }).frame;
}

function spyTargets(): WeaveCommandTargets {
  return {
    reset: vi.fn(),
  };
}

interface FrameOpts {
  readonly frame?: { x: number; y: number; width: number; height: number; rotation: number };
  readonly layout?: LayoutSpec;
  readonly layoutChild?: unknown;
}

function frameItem(
  id: string,
  opts: FrameOpts = {},
  children: ReadonlyArray<AgocraftItem> = [],
): AgocraftItem {
  const attrs: Record<string, unknown> = {};
  if (opts.frame !== undefined) attrs.frame = opts.frame;
  if (opts.layout !== undefined) attrs.layout = opts.layout;
  if (opts.layoutChild !== undefined) attrs.layoutChild = opts.layoutChild;
  return {
    id: makeItemId(id),
    kind: "frame",
    attrs: attrs as AgocraftItem["attrs"],
    units: [],
    children,
    meta: { ...META },
  } as AgocraftItem;
}

/** Build a CommandContext whose root holds a single parent frame carrying
 *  `parentLayout` + one existing child at `existingChildFrame`. */
function makeCtx(parentLayout: LayoutSpec, existingChild: AgocraftItem): CommandContext {
  const parent = frameItem(
    "parent",
    { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 }, layout: parentLayout },
    [existingChild],
  );
  const root = frameItem("root", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }, [
    parent,
  ]);
  const doc = {
    id: "doc",
    schema: undefined as unknown as AgocraftDocument["schema"],
    root,
    meta: { id: "doc", ...META, schemaRefs: [] },
  } as unknown as AgocraftDocument;
  return { document: doc, resolve: () => null as never, skipRelations: false } as CommandContext;
}

const F = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
  rotation: 0,
});

describe.runIf(WI020_LAYOUT_VARIANTS_ENABLED)(
  "weave.item.add — relayout on child add (auto-flex)",
  () => {
    it("places the new child at its spec frame (row flex, 2 children → 0.5 each)", () => {
      const flex: LayoutSpec = createAutoFlexSpec({
        direction: "row",
        gap: 0,
        justify: "start",
        align: "stretch",
      });
      // Existing child already at the left half with explicit basis 0.5.
      const existing = frameItem("c1", {
        frame: F(0, 0, 0.5, 1),
        layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }),
      });
      const ctx = makeCtx(flex, existing);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      // Add a 2nd child with basis 0.5, intentionally dropped at a wrong
      // frame (0.9, 0.9) — relayout must override it to the spec position.
      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        frame: F(0.9, 0.9, 0.5, 1),
        attrsOverride: { layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }) },
      });
      if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);

      // The staged new child must be at the SECOND flex slot (x = 0.5),
      // NOT at its raw drop frame (0.9) — proving auto-arrangement ran.
      const stagedFrame = createdFrame(result.patches);
      expect(stagedFrame?.x).toBeCloseTo(0.5, 6);
      expect(stagedFrame?.width).toBeCloseTo(0.5, 6);
    });

    it("does not crash when the parent layout was stored WITHOUT padding (DR-048)", () => {
      // Repro: the agent set an auto-flex layout via weave.frame.setLayout but
      // OMITTED padding; @agocraft/layout's onParentResize dereferences
      // spec.padding.left, so the next child add threw "Cannot read properties of
      // undefined (reading 'left')". weave.item.add now normalizes the parent's
      // layout (fills the required padding) before the engine reads it.
      const paddinglessFlex = {
        kind: "auto-flex",
        direction: "row",
        gap: 0,
        justify: "start",
        align: "stretch",
        // padding intentionally ABSENT — the bug trigger.
      } as unknown as LayoutSpec;
      const existing = frameItem("c1", { frame: F(0, 0, 0.5, 1) });
      const ctx = makeCtx(paddinglessFlex, existing);
      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");
      expect(() =>
        cmd.run(ctx, { kind: "frame", containerId: "parent", frame: F(0, 0, 0.5, 1) }),
      ).not.toThrow();
    });

    it("emits item.children (add) + sibling item.attrs patches in one transaction", () => {
      const flex: LayoutSpec = createAutoFlexSpec({
        direction: "row",
        gap: 0,
        justify: "start",
        align: "stretch",
      });
      // Existing child at a WRONG position (0.9) so relayout must shift it
      // back to x=0 (first slot) — producing a sibling patch.
      const existing = frameItem("c1", {
        frame: F(0.9, 0.9, 0.01, 0.01),
        layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }),
      });
      const ctx = makeCtx(flex, existing);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        frame: F(0.9, 0.9, 0.01, 0.01),
        attrsOverride: { layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }) },
      });
      if (!result.ok) throw new Error("expected ok");

      // One item.create (add) + at least one item.attrs (existing sibling
      // shifting to slot 0) — all in this transaction (single Cmd+Z).
      const childrenPatches = result.patches.filter((p) => p.type === "item.create");
      const attrsPatches = result.patches.filter((p) => p.type === "item.attrs");
      expect(childrenPatches).toHaveLength(1);
      expect(attrsPatches.length).toBeGreaterThanOrEqual(1);
      // The sibling patch targets the existing child and moves it to x≈0.
      const siblingPatch = attrsPatches.find((p) => String(p.itemId) === "c1");
      expect(siblingPatch).toBeDefined();
      if (siblingPatch !== undefined && siblingPatch.type === "item.attrs") {
        const after = siblingPatch.after as { frame?: { x: number } };
        expect(after.frame?.x).toBeCloseTo(0, 6);
      }
    });

    it("sibling patches carry FULL attrs (regression: frame-only wiped shape geometry)", () => {
      // The bug: relayout's sibling item.attrs patch had after = { frame }
      // only, but weave's reducer REPLACES the whole attrs map — so a shape
      // sibling lost attrs.shape and shapeToSvgGeometry crashed. The fix
      // merges frame into the child's existing attrs.
      const flex: LayoutSpec = createAutoFlexSpec({
        direction: "row",
        gap: 0,
        justify: "start",
        align: "stretch",
      });
      // Existing SHAPE sibling at a wrong position, carrying real shape
      // attrs that MUST survive the relayout patch.
      const existing = {
        id: makeItemId("c1"),
        kind: "shape",
        attrs: {
          frame: F(0.9, 0.9, 0.01, 0.01),
          shape: "ellipse",
          fill: "var(--accent)",
          layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }),
        } as AgocraftItem["attrs"],
        units: [],
        children: [],
        meta: { ...META },
      } as AgocraftItem;
      const ctx = makeCtx(flex, existing);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "shape",
        containerId: "parent",
        frame: F(0.9, 0.9, 0.01, 0.01),
        attrsOverride: {
          shape: "rectangle",
          layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }),
        },
      });
      if (!result.ok) throw new Error("expected ok");

      const siblingPatch = result.patches.find(
        (p) => p.type === "item.attrs" && String(p.itemId) === "c1",
      );
      expect(siblingPatch).toBeDefined();
      if (siblingPatch !== undefined && siblingPatch.type === "item.attrs") {
        const after = siblingPatch.after as {
          frame?: { x: number };
          shape?: string;
          fill?: string;
        };
        // Frame moved to slot 0 …
        expect(after.frame?.x).toBeCloseTo(0, 6);
        // … AND the shape geometry attrs survived (the regression).
        expect(after.shape).toBe("ellipse");
        expect(after.fill).toBe("var(--accent)");
      }
    });

    it("overflow → existing siblings SHRINK to fit (user's requested behaviour)", () => {
      // User ask: when children exceed the row width, either wrap OR shrink.
      // v1.1 has no wrap (FR-009 T1), so shrink (flex-shrink) is the path.
      // Two existing children at basis 0.5 already fill the row; adding a
      // 3rd (basis 0.5) → total basis 1.5 > 1.0 → all shrink to 1/3 each.
      const flex: LayoutSpec = createAutoFlexSpec({
        direction: "row",
        gap: 0,
        justify: "start",
        align: "stretch",
      });
      const policy = createAutoFlexChildPolicy({ basis: 0.5, shrink: 1 });
      // Build a parent with TWO existing children (the makeCtx helper only
      // seeds one, so assemble the doc inline here).
      const c1 = frameItem("c1", { frame: F(0, 0, 0.5, 1), layoutChild: policy });
      const c2 = frameItem("c2", { frame: F(0.5, 0, 0.5, 1), layoutChild: policy });
      const parent = frameItem("parent", { frame: F(0, 0, 1, 1), layout: flex }, [c1, c2]);
      const root = frameItem("root", { frame: F(0, 0, 1, 1) }, [parent]);
      const doc = {
        id: "doc",
        schema: undefined as unknown as AgocraftDocument["schema"],
        root,
        meta: { id: "doc", ...META, schemaRefs: [] },
      } as unknown as AgocraftDocument;
      const ctx = {
        document: doc,
        resolve: () => null as never,
        skipRelations: false,
      } as CommandContext;

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        frame: F(0.9, 0.9, 0.5, 1),
        attrsOverride: { layoutChild: policy },
      });
      if (!result.ok) throw new Error("expected ok");

      // New child ends at the 3rd slot, shrunk to 1/3 width.
      const sFrame = createdFrame(result.patches);
      expect(sFrame?.width).toBeCloseTo(1 / 3, 5);
      expect(sFrame?.x).toBeCloseTo(2 / 3, 5);

      // BOTH existing siblings shrank from 0.5 → 1/3 (the "이전 시블링들의
      // 크기가 줄어들면서" behaviour).
      const attrsPatches = result.patches.filter((p) => p.type === "item.attrs");
      for (const id of ["c1", "c2"]) {
        const p = attrsPatches.find((q) => String(q.itemId) === id);
        expect(p).toBeDefined();
        if (p !== undefined && p.type === "item.attrs") {
          const after = p.after as { frame?: { width: number } };
          expect(after.frame?.width).toBeCloseTo(1 / 3, 5);
        }
      }
    });
  },
);

describe.runIf(WI020_LAYOUT_VARIANTS_ENABLED)(
  "weave.item.add — relayout on child add (auto-grid)",
  () => {
    it("places the new child in the next grid cell (2-col grid → column 2 at x=0.5)", () => {
      const grid: LayoutSpec = createAutoGridSpec({
        columns: [trackFr(1), trackFr(1)],
        rows: [trackFr(1)],
        justify: "stretch",
        align: "stretch",
      });
      const existing = frameItem("c1", {
        frame: F(0, 0, 0.5, 1),
        layoutChild: createAutoGridChildPolicy({ column: 1, row: 1 }),
      });
      const ctx = makeCtx(grid, existing);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        frame: F(0.9, 0.9, 0.1, 0.1),
        attrsOverride: { layoutChild: createAutoGridChildPolicy({ column: 2, row: 1 }) },
      });
      if (!result.ok) throw new Error("expected ok");

      const stagedFrame = createdFrame(result.patches);
      // Column 2 of a 2-fr grid (stretch) → x = 0.5, width = 0.5.
      expect(stagedFrame?.x).toBeCloseTo(0.5, 6);
      expect(stagedFrame?.width).toBeCloseTo(0.5, 6);
    });
  },
);

describe.runIf(WI020_LAYOUT_VARIANTS_ENABLED)(
  "weave.item.add — NO relayout for absolute / no-layout parents",
  () => {
    it("absolute-constraints parent keeps the new child at its drop frame", () => {
      const absolute: LayoutSpec = { kind: "absolute-constraints" };
      const existing = frameItem("c1", { frame: F(0, 0, 0.3, 0.3) });
      const ctx = makeCtx(absolute, existing);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        frame: F(0.4, 0.4, 0.2, 0.2),
      });
      if (!result.ok) throw new Error("expected ok");

      // absolute-constraints onParentResize is scale-factor based and
      // returns [] on a no-op resize → the new child keeps its drop frame.
      const stagedFrame = createdFrame(result.patches);
      expect(stagedFrame?.x).toBeCloseTo(0.4, 6);
      expect(stagedFrame?.y).toBeCloseTo(0.4, 6);
      // No sibling patches — only the item.create add.
      expect(result.patches.filter((p) => p.type === "item.attrs")).toHaveLength(0);
    });

    it("a frame with NO layout policy keeps the new child at its drop frame", () => {
      const noLayout = frameItem("parent", { frame: F(0, 0, 1, 1) }, [
        frameItem("c1", { frame: F(0, 0, 0.3, 0.3) }),
      ]);
      const root = frameItem("root", { frame: F(0, 0, 1, 1) }, [noLayout]);
      const doc = {
        id: "doc",
        schema: undefined as unknown as AgocraftDocument["schema"],
        root,
        meta: { id: "doc", ...META, schemaRefs: [] },
      } as unknown as AgocraftDocument;
      const ctx = {
        document: doc,
        resolve: () => null as never,
        skipRelations: false,
      } as CommandContext;

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        frame: F(0.4, 0.4, 0.2, 0.2),
      });
      if (!result.ok) throw new Error("expected ok");
      const stagedFrame = createdFrame(result.patches);
      expect(stagedFrame?.x).toBeCloseTo(0.4, 6);
      expect(result.patches.filter((p) => p.type === "item.attrs")).toHaveLength(0);
    });
  },
);

describe.runIf(WI020_LAYOUT_VARIANTS_ENABLED)(
  "weave.frame.setLayout — paradigm change rearranges existing children",
  () => {
    /** Build a ctx whose parent already holds N children at given frames. */
    function ctxWithChildren(
      parentLayout: LayoutSpec | undefined,
      children: ReadonlyArray<AgocraftItem>,
    ): CommandContext {
      const parentOpts: FrameOpts =
        parentLayout !== undefined
          ? { frame: F(0, 0, 1, 1), layout: parentLayout }
          : { frame: F(0, 0, 1, 1) };
      const parent = frameItem("parent", parentOpts, children);
      const root = frameItem("root", { frame: F(0, 0, 1, 1) }, [parent]);
      const doc = {
        id: "doc",
        schema: undefined as unknown as AgocraftDocument["schema"],
        root,
        meta: { id: "doc", ...META, schemaRefs: [] },
      } as unknown as AgocraftDocument;
      return {
        document: doc,
        resolve: () => null as never,
        skipRelations: false,
      } as CommandContext;
    }

    it("Absolute → Flex rearranges children into a row (with full-attrs + reassigned policy)", () => {
      // Two children scattered at arbitrary positions under an Absolute (no
      // layout) parent. Switching to Flex must spread them into a row.
      const c1 = {
        id: makeItemId("c1"),
        kind: "shape",
        attrs: {
          frame: F(0.1, 0.7, 0.2, 0.2),
          shape: "ellipse",
          fill: "var(--a)",
        } as AgocraftItem["attrs"],
        units: [],
        children: [],
        meta: { ...META },
      } as AgocraftItem;
      const c2 = {
        id: makeItemId("c2"),
        kind: "shape",
        attrs: {
          frame: F(0.6, 0.1, 0.2, 0.2),
          shape: "rectangle",
          fill: "var(--b)",
        } as AgocraftItem["attrs"],
        units: [],
        children: [],
        meta: { ...META },
      } as AgocraftItem;
      const ctx = ctxWithChildren(undefined, [c1, c2]);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.frame.setLayout");
      if (cmd === undefined) throw new Error("weave.frame.setLayout not found");

      const flex: LayoutSpec = createAutoFlexSpec({
        direction: "row",
        gap: 0,
        justify: "start",
        align: "stretch",
      });
      const result = cmd.run(ctx, { itemId: "parent", layout: flex });
      if (!result.ok) throw new Error("expected ok");

      // 1 item.layout (parent spec) + 2 item.attrs (children rearranged).
      const layoutPatch = result.patches.find((p) => p.type === "item.layout");
      expect(layoutPatch).toBeDefined();
      const attrsPatches = result.patches.filter(
        (p): p is Extract<typeof p, { type: "item.attrs" }> => p.type === "item.attrs",
      );
      expect(attrsPatches).toHaveLength(2);

      // Children land at distinct, increasing x (row spread) — NOT their old
      // scattered positions.
      const byId = new Map(attrsPatches.map((p) => [String(p.itemId), p]));
      const a1 = nn(byId.get("c1")).after as {
        frame?: { x: number };
        shape?: string;
        layoutChild?: { kind: string };
      };
      const a2 = nn(byId.get("c2")).after as { frame?: { x: number } };
      expect(a1.frame?.x).toBeLessThan(nn(a2.frame).x);
      // Each child's other attrs survived AND its policy was reassigned to flex.
      expect(a1.shape).toBe("ellipse");
      expect(a1.layoutChild?.kind).toBe("auto-flex");
    });

    it("Absolute → Grid places children into distinct cells (row-major auto-assign)", () => {
      const c1 = frameItem("c1", { frame: F(0.1, 0.1, 0.2, 0.2) });
      const c2 = frameItem("c2", { frame: F(0.1, 0.1, 0.2, 0.2) });
      const c3 = frameItem("c3", { frame: F(0.1, 0.1, 0.2, 0.2) });
      const ctx = ctxWithChildren(undefined, [c1, c2, c3]);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.frame.setLayout");
      if (cmd === undefined) throw new Error("not found");

      const grid: LayoutSpec = createAutoGridSpec({
        columns: [trackFr(1), trackFr(1), trackFr(1)],
        rows: [trackFr(1)],
        justify: "stretch",
        align: "stretch",
      });
      const result = cmd.run(ctx, { itemId: "parent", layout: grid });
      if (!result.ok) throw new Error("expected ok");

      const attrsPatches = result.patches.filter(
        (p): p is Extract<typeof p, { type: "item.attrs" }> => p.type === "item.attrs",
      );
      expect(attrsPatches).toHaveLength(3);
      const xs = ["c1", "c2", "c3"].map((id) => {
        const p = nn(attrsPatches.find((q) => String(q.itemId) === id));
        return nn((p.after as { frame?: { x: number } }).frame).x;
      });
      // 3 children → row-major into columns 1/2/3 → x = 0, 1/3, 2/3.
      expect(xs[0]).toBeCloseTo(0, 5);
      expect(xs[1]).toBeCloseTo(1 / 3, 5);
      expect(xs[2]).toBeCloseTo(2 / 3, 5);
      // Each child's policy reassigned to a distinct grid cell.
      for (const id of ["c1", "c2", "c3"]) {
        const p = nn(attrsPatches.find((q) => String(q.itemId) === id));
        const policy = (p.after as { layoutChild?: { kind: string; column: number } }).layoutChild;
        expect(policy?.kind).toBe("auto-grid");
      }
    });

    it("Flex → Absolute emits ONLY the layout patch (children keep frames, free placement)", () => {
      const flex: LayoutSpec = createAutoFlexSpec();
      const c1 = frameItem("c1", {
        frame: F(0, 0, 0.5, 1),
        layoutChild: createAutoFlexChildPolicy(),
      });
      const ctx = ctxWithChildren(flex, [c1]);

      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.frame.setLayout");
      if (cmd === undefined) throw new Error("not found");

      // Absolute is represented as `undefined` layout (specForChoice("absolute")).
      const result = cmd.run(ctx, { itemId: "parent", layout: undefined });
      if (!result.ok) throw new Error("expected ok");

      const layoutPatches = result.patches.filter((p) => p.type === "item.layout");
      const attrsPatches = result.patches.filter((p) => p.type === "item.attrs");
      expect(layoutPatches).toHaveLength(1);
      // No child rearrangement when switching to free placement.
      expect(attrsPatches).toHaveLength(0);
    });
  },
);

// ── WI-199 / DR-128 — nested-layout add: cascade relayout + grid track grow ──

/** A flat-attrs accessor for the `frame` an item.attrs patch sets. */
function patchFrame(p: Patch): { x: number; y: number; width: number; height: number } | undefined {
  if (p.type !== "item.attrs") return undefined;
  return (p as { after?: { frame?: { x: number; y: number; width: number; height: number } } })
    .after?.frame;
}

/** Build a CommandContext whose root holds a parent frame with arbitrary children
 *  (mirrors makeCtx but lets the caller supply the full child list, including
 *  nested containers). */
function makeCtxChildren(
  parentLayout: LayoutSpec,
  children: ReadonlyArray<AgocraftItem>,
): CommandContext {
  const parent = frameItem(
    "parent",
    { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 }, layout: parentLayout },
    children,
  );
  const root = frameItem("root", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } }, [
    parent,
  ]);
  const doc = {
    id: "doc",
    schema: undefined as unknown as AgocraftDocument["schema"],
    root,
    meta: { id: "doc", ...META, schemaRefs: [] },
  } as unknown as AgocraftDocument;
  return { document: doc, resolve: () => null as never, skipRelations: false } as CommandContext;
}

describe.runIf(WI020_LAYOUT_VARIANTS_ENABLED)(
  "weave.item.add — #3 grid track auto-grow (enforceGridCapacity)",
  () => {
    /** A full 2×2 (= 4 cell) auto-managed grid with 4 occupied children. */
    function full2x2(): { grid: AutoGridSpec; children: AgocraftItem[] } {
      const grid = createAutoGridSpec({
        columns: [trackFr(1), trackFr(1)],
        rows: [trackFr(1), trackFr(1)],
        justify: "stretch",
        align: "stretch",
      });
      const children = [
        frameItem("c1", {
          frame: F(0, 0, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 1, row: 1 }),
        }),
        frameItem("c2", {
          frame: F(0.5, 0, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 2, row: 1 }),
        }),
        frameItem("c3", {
          frame: F(0, 0.5, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 1, row: 2 }),
        }),
        frameItem("c4", {
          frame: F(0.5, 0.5, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 2, row: 2 }),
        }),
      ];
      return { grid, children };
    }

    it("grows tracks (2×2 → 3 columns) and persists an item.layout patch when the grid would overflow", () => {
      const { grid, children } = full2x2();
      const ctx = makeCtxChildren(grid, children);
      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        enforceGridCapacity: true,
      });
      if (!result.ok) throw new Error("expected ok");

      const layoutPatches = result.patches.filter((p) => p.type === "item.layout");
      expect(layoutPatches).toHaveLength(1);
      const after = (layoutPatches[0] as { after?: AutoGridSpec }).after;
      // 5 children → ⌈√5⌉ = 3 columns × 2 rows.
      expect(after?.columns).toHaveLength(3);
      expect(after?.rows).toHaveLength(2);

      // The new child lands in a REAL free cell (3,1) → x = 2/3, NOT stacked on
      // the last existing cell.
      const staged = createdFrame(result.patches);
      expect(staged?.x).toBeCloseTo(2 / 3, 5);
      expect(staged?.width).toBeCloseTo(1 / 3, 5);
    });

    it("does NOT grow (or emit item.layout) without the agent flag — manual adds keep their track count", () => {
      const { grid, children } = full2x2();
      const ctx = makeCtxChildren(grid, children);
      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, { kind: "frame", containerId: "parent" });
      if (!result.ok) throw new Error("expected ok");

      expect(result.patches.filter((p) => p.type === "item.layout")).toHaveLength(0);
    });

    it("does NOT grow when there is still a free cell (capacity not exceeded)", () => {
      const grid = createAutoGridSpec({
        columns: [trackFr(1), trackFr(1)],
        rows: [trackFr(1), trackFr(1)],
        justify: "stretch",
        align: "stretch",
      });
      // Only 2 of 4 cells filled — adding a 3rd stays within 2×2.
      const children = [
        frameItem("c1", {
          frame: F(0, 0, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 1, row: 1 }),
        }),
        frameItem("c2", {
          frame: F(0.5, 0, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 2, row: 1 }),
        }),
      ];
      const ctx = makeCtxChildren(grid, children);
      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        enforceGridCapacity: true,
      });
      if (!result.ok) throw new Error("expected ok");
      expect(result.patches.filter((p) => p.type === "item.layout")).toHaveLength(0);
    });
  },
);

describe.runIf(WI020_LAYOUT_VARIANTS_ENABLED)(
  "weave.item.add — #1 cascade relayout into nested containers",
  () => {
    it("reflows the GRANDCHILDREN of a nested flex container reshaped by the add", () => {
      // Outer grid full at 2×2; cell (1,1) is a nested flex-COLUMN container whose
      // children carry an intrinsic crossSize. Adding a 5th child grows the grid to
      // 3 columns → the nested container's WIDTH (its flex cross axis) shrinks
      // 0.5 → 1/3, so its children's cross ratios must be recomputed. Without the
      // cascade those grandchildren stay sized for the old 0.5-wide box.
      const grid = createAutoGridSpec({
        columns: [trackFr(1), trackFr(1)],
        rows: [trackFr(1), trackFr(1)],
        justify: "stretch",
        align: "stretch",
      });
      const nestedFlex = createAutoFlexSpec({
        direction: "column",
        justify: "start",
        align: "start",
      });
      const gc1 = frameItem("gc1", {
        frame: F(0, 0, 0.8, 0.4),
        layoutChild: createAutoFlexChildPolicy({ basis: 0.4, crossSize: 0.8 }),
      });
      const gc2 = frameItem("gc2", {
        frame: F(0, 0.4, 0.8, 0.4),
        layoutChild: createAutoFlexChildPolicy({ basis: 0.4, crossSize: 0.8 }),
      });
      const F1 = frameItem(
        "F1",
        {
          frame: F(0, 0, 0.5, 0.5),
          layout: nestedFlex,
          layoutChild: createAutoGridChildPolicy({ column: 1, row: 1 }),
        },
        [gc1, gc2],
      );
      const children = [
        F1,
        frameItem("c2", {
          frame: F(0.5, 0, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 2, row: 1 }),
        }),
        frameItem("c3", {
          frame: F(0, 0.5, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 1, row: 2 }),
        }),
        frameItem("c4", {
          frame: F(0.5, 0.5, 0.5, 0.5),
          layoutChild: createAutoGridChildPolicy({ column: 2, row: 2 }),
        }),
      ];
      const ctx = makeCtxChildren(grid, children);
      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        enforceGridCapacity: true,
      });
      if (!result.ok) throw new Error("expected ok");

      const attrsById = new Map<string, Patch>();
      for (const p of result.patches) {
        if (p.type === "item.attrs") attrsById.set(String(p.itemId), p);
      }
      // F1 itself was repositioned by the grid grow (sibling patch)…
      expect(attrsById.has("F1")).toBe(true);
      // …and the cascade reflowed F1's CHILDREN against its new (narrower) box.
      expect(attrsById.has("gc1")).toBe(true);
      expect(attrsById.has("gc2")).toBe(true);
      // The grandchild's stored cross (width) ratio was 0.8, sized for F1's old
      // 0.5-wide box. The cascade recomputed it against F1's new (1/3-wide) box, so
      // it must NO LONGER be the stale 0.8 — that recompute is the bug fix. (Here
      // the preserved absolute cross overflows the narrower box and clamps to 1.0.)
      const gc1Frame = patchFrame(nn(attrsById.get("gc1")));
      expect(gc1Frame).toBeDefined();
      expect(nn(gc1Frame).width).not.toBeCloseTo(0.8, 5);
      expect(nn(gc1Frame).width).toBeGreaterThan(0);
      expect(nn(gc1Frame).width).toBeLessThanOrEqual(1);
    });

    it("is a NO-OP when the reshaped siblings are leaves (no nested containers)", () => {
      // A plain flex row of leaves: adding a 3rd reshapes the two leaf siblings,
      // but none is a container, so no cascade (grandchild) patches are produced.
      const flex = createAutoFlexSpec({ direction: "row", justify: "start", align: "stretch" });
      const children = [
        frameItem("a", {
          frame: F(0, 0, 0.5, 1),
          layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }),
        }),
        frameItem("b", {
          frame: F(0.5, 0, 0.5, 1),
          layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }),
        }),
      ];
      const ctx = makeCtxChildren(flex, children);
      const cmd = buildWeaveCommands(spyTargets()).find((c) => c.name === "weave.item.add");
      if (cmd === undefined) throw new Error("weave.item.add not found");

      const result = cmd.run(ctx, {
        kind: "frame",
        containerId: "parent",
        attrsOverride: { layoutChild: createAutoFlexChildPolicy({ basis: 0.5 }) },
      });
      if (!result.ok) throw new Error("expected ok");

      // Only the two leaf siblings (a, b) may carry item.attrs patches — there are
      // no grandchildren to cascade into.
      const attrsIds = result.patches
        .filter((p) => p.type === "item.attrs")
        .map((p) => String((p as { itemId: unknown }).itemId));
      for (const id of attrsIds) {
        expect(["a", "b"]).toContain(id);
      }
    });
  },
);
