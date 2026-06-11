// WI-077 Phase 1 — weave.dataset.* command tests (DR-031).
//
// Proves the three dataset commands emit correct root-unit patches, that
// applyPatch materializes them onto `doc.root.units`, that resolveDataset
// reflects the change (reactivity substrate), and that each is undoable via
// the swapped-inverse patch (how history replays a transaction).

import type { Document as AgocraftDocument, Command, CommandContext, Patch } from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import { applyChangeToDocument, toAgocraftDocument } from "../agocraft-mirror.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "../commands.js";
import type { Document as WeaveDocument } from "../types.js";
import { type DatasetPayload, findDatasetUnit, resolveDataset } from "./dataset-store.js";

const META_DATE = "2026-06-02T00:00:00Z";

function targets(): WeaveCommandTargets {
  return {
    reset: vi.fn(),
  };
}

/** Empty doc — root with the style.provider unit only, no datasets. */
function makeCtx(): CommandContext {
  const weave: WeaveDocument = {
    id: "doc-1",
    title: "Test",
    items: [],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  return {
    document: toAgocraftDocument(weave),
    resolve: () => null as never,
    skipRelations: false,
  };
}

function cmd(name: string): Command {
  const c = buildWeaveCommands(targets()).find((x) => x.name === name);
  if (c === undefined) throw new Error(`command ${name} not found`);
  return c;
}

/** Manual inverse for the unit patches (mirrors agocraft `history.invertPatch`):
 *  create⁻¹ = remove, remove⁻¹ = create, attrs⁻¹ = before/after swap. */
function invert(p: Patch): Patch {
  if (p.type === "unit.create") {
    return { type: "unit.remove", itemId: p.itemId, position: p.position, unit: p.unit };
  }
  if (p.type === "unit.remove") {
    return { type: "unit.create", itemId: p.itemId, position: p.position, unit: p.unit };
  }
  if (p.type === "unit.attrs") {
    return { ...p, before: p.after, after: p.before };
  }
  throw new Error(`invert: unexpected patch ${p.type}`);
}

function applyAll(doc: AgocraftDocument, patches: ReadonlyArray<Patch>): AgocraftDocument {
  let next = doc;
  for (const p of patches) next = applyChangeToDocument(next, p as never);
  return next;
}

const SALES: DatasetPayload = {
  name: "분기 매출",
  columns: [
    { name: "quarter", type: "nominal" },
    { name: "revenue", type: "quantitative" },
  ],
  rows: [{ quarter: "Q1", revenue: 120 }],
};

describe("weave.dataset.add", () => {
  it("emits a unit.create on the root and materializes a resolvable dataset", () => {
    const ctx = makeCtx();
    const res = cmd("weave.dataset.add").run(ctx, { id: "ds-1", dataset: SALES });
    if (!res.ok) throw new Error("expected ok");
    expect(res.value).toBe("ds-1");
    expect(res.patches).toHaveLength(1);
    const p = res.patches[0] as Patch;
    expect(p.type).toBe("unit.create");
    if (p.type === "unit.create") expect(String(p.itemId)).toBe(String(ctx.document.root.id));

    const after = applyAll(ctx.document, res.patches);
    expect(resolveDataset(after, "ds-1")).toEqual(SALES);
  });

  it("generates an id when omitted and defaults to an empty table", () => {
    const ctx = makeCtx();
    const res = cmd("weave.dataset.add").run(ctx, {});
    if (!res.ok) throw new Error("expected ok");
    expect(res.value).toMatch(/^dataset-/);
    const after = applyAll(ctx.document, res.patches);
    expect(resolveDataset(after, res.value as string)).toEqual({
      name: "데이터셋",
      columns: [],
      rows: [],
    });
  });

  it("rejects a duplicate id", () => {
    let ctx = makeCtx();
    const first = cmd("weave.dataset.add").run(ctx, { id: "ds-1", dataset: SALES });
    if (!first.ok) throw new Error("expected ok");
    ctx = { ...ctx, document: applyAll(ctx.document, first.patches) };
    const dup = cmd("weave.dataset.add").run(ctx, { id: "ds-1" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("duplicate-id");
  });

  it("undo (unit.create⁻¹) removes the dataset", () => {
    const ctx = makeCtx();
    const res = cmd("weave.dataset.add").run(ctx, { id: "ds-1", dataset: SALES });
    if (!res.ok) throw new Error("expected ok");
    let doc = applyAll(ctx.document, res.patches);
    expect(findDatasetUnit(doc, "ds-1")).toBeDefined();
    doc = applyAll(doc, res.patches.map(invert).reverse());
    expect(findDatasetUnit(doc, "ds-1")).toBeUndefined();
  });
});

describe("weave.dataset.update", () => {
  function seeded(): { ctx: CommandContext } {
    const base = makeCtx();
    const add = cmd("weave.dataset.add").run(base, { id: "ds-1", dataset: SALES });
    if (!add.ok) throw new Error("seed failed");
    return { ctx: { ...base, document: applyAll(base.document, add.patches) } };
  }

  it("declarative `dataset` shallow-merges and referencing reads see the new data", () => {
    const { ctx } = seeded();
    const nextRows = [
      { quarter: "Q1", revenue: 120 },
      { quarter: "Q2", revenue: 150 },
    ];
    const res = cmd("weave.dataset.update").run(ctx, { id: "ds-1", dataset: { rows: nextRows } });
    if (!res.ok) throw new Error("expected ok");
    const p = res.patches[0] as Patch;
    expect(p.type).toBe("unit.attrs");

    const after = applyAll(ctx.document, res.patches);
    const resolved = resolveDataset(after, "ds-1");
    expect(resolved?.rows).toEqual(nextRows);
    expect(resolved?.columns).toEqual(SALES.columns); // untouched fields preserved
  });

  it("WI-172 — declarative `dataset` with malformed rows is normalized, not committed raw", () => {
    const { ctx } = seeded();
    const res = cmd("weave.dataset.update").run(ctx, {
      id: "ds-1",
      // an agent-style poisoned payload: rows with null / array / primitive
      // entries and a non-primitive cell — the shape that crashed ECharts
      // ("Invalid data provider") when committed unnormalized.
      dataset: {
        rows: [
          { quarter: "Q1", revenue: 120 },
          null,
          ["Q2", 150],
          { quarter: "Q3", revenue: { nested: true } },
        ] as unknown as DatasetPayload["rows"],
      },
    });
    if (!res.ok) throw new Error("expected ok");
    const after = applyAll(ctx.document, res.patches);
    expect(resolveDataset(after, "ds-1")?.rows).toEqual([
      { quarter: "Q1", revenue: 120 },
      { quarter: "Q3", revenue: "" },
    ]);
  });

  it("`patch` function form transforms the previous payload", () => {
    const { ctx } = seeded();
    const res = cmd("weave.dataset.update").run(ctx, {
      id: "ds-1",
      patch: (prev: DatasetPayload) => ({ ...prev, name: "이름 변경" }),
    });
    if (!res.ok) throw new Error("expected ok");
    const after = applyAll(ctx.document, res.patches);
    expect(resolveDataset(after, "ds-1")?.name).toBe("이름 변경");
  });

  it("fails on a missing dataset, and on empty input", () => {
    const { ctx } = seeded();
    const missing = cmd("weave.dataset.update").run(ctx, { id: "nope", dataset: {} });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("dataset-not-found");
    const empty = cmd("weave.dataset.update").run(ctx, { id: "ds-1" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("invalid-input");
  });

  it("undo (unit.attrs before/after swap) restores the prior payload", () => {
    const { ctx } = seeded();
    const res = cmd("weave.dataset.update").run(ctx, { id: "ds-1", dataset: { name: "변경" } });
    if (!res.ok) throw new Error("expected ok");
    let doc = applyAll(ctx.document, res.patches);
    expect(resolveDataset(doc, "ds-1")?.name).toBe("변경");
    doc = applyAll(doc, res.patches.map(invert).reverse());
    expect(resolveDataset(doc, "ds-1")).toEqual(SALES);
  });
});

describe("weave.dataset.remove", () => {
  function seeded(): { ctx: CommandContext } {
    const base = makeCtx();
    const add = cmd("weave.dataset.add").run(base, { id: "ds-1", dataset: SALES });
    if (!add.ok) throw new Error("seed failed");
    return { ctx: { ...base, document: applyAll(base.document, add.patches) } };
  }

  it("emits unit.remove and the dataset is gone after apply", () => {
    const { ctx } = seeded();
    const res = cmd("weave.dataset.remove").run(ctx, { id: "ds-1" });
    if (!res.ok) throw new Error("expected ok");
    expect((res.patches[0] as Patch).type).toBe("unit.remove");
    const after = applyAll(ctx.document, res.patches);
    expect(resolveDataset(after, "ds-1")).toBeUndefined();
  });

  it("fails on a missing dataset", () => {
    const { ctx } = seeded();
    const res = cmd("weave.dataset.remove").run(ctx, { id: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("dataset-not-found");
  });

  it("undo (unit.remove⁻¹) restores the dataset with its payload", () => {
    const { ctx } = seeded();
    const res = cmd("weave.dataset.remove").run(ctx, { id: "ds-1" });
    if (!res.ok) throw new Error("expected ok");
    let doc = applyAll(ctx.document, res.patches);
    expect(resolveDataset(doc, "ds-1")).toBeUndefined();
    doc = applyAll(doc, res.patches.map(invert).reverse());
    expect(resolveDataset(doc, "ds-1")).toEqual(SALES);
  });
});
