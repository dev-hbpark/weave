// WI-077 Phase 4 — weave.chart.add (one-transaction seed-dataset + chart).

import type { Document as AgocraftDocument, Command, CommandContext, Patch } from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import { applyChangeToDocument, findItemDeep, toAgocraftDocument } from "../agocraft-mirror.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "../commands.js";
import { categoryField, valueFields } from "../domains/chart/chart-model.js";
import type { ChartAttrs, Document as WeaveDocument } from "../types.js";
import { listDatasets, resolveDataset } from "./dataset-store.js";

const META_DATE = "2026-06-02T00:00:00Z";

function targets(): WeaveCommandTargets {
  return {
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    updateBehavior: vi.fn(),
    reset: vi.fn(),
  };
}

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

function invert(p: Patch): Patch {
  if (p.type === "unit.create")
    return { type: "unit.remove", itemId: p.itemId, position: p.position, unit: p.unit };
  if (p.type === "item.create")
    return { type: "item.remove", parentId: p.parentId, position: p.position, item: p.item };
  throw new Error(`invert: unexpected ${p.type}`);
}

function applyAll(doc: AgocraftDocument, patches: ReadonlyArray<Patch>): AgocraftDocument {
  let next = doc;
  for (const p of patches) next = applyChangeToDocument(next, p as never);
  return next;
}

describe("weave.chart.add", () => {
  it("emits one dataset unit.create + one chart item.create (single transaction)", () => {
    const ctx = makeCtx();
    const res = cmd("weave.chart.add").run(ctx, {});
    if (!res.ok) throw new Error("expected ok");
    expect(res.patches).toHaveLength(2);
    expect((res.patches[0] as Patch).type).toBe("unit.create");
    expect((res.patches[1] as Patch).type).toBe("item.create");
  });

  it("after apply: dataset is resolvable and the chart references it with a derived encoding", () => {
    const ctx = makeCtx();
    const res = cmd("weave.chart.add").run(ctx, {});
    if (!res.ok) throw new Error("expected ok");
    const doc = applyAll(ctx.document, res.patches);

    // One dataset seeded.
    const datasets = listDatasets(doc);
    expect(datasets).toHaveLength(1);
    const dsId = datasets[0]?.id as string;

    // Chart exists, references the dataset, encoding derived from columns
    // (first = category, rest = values).
    const chart = findItemDeep(doc, res.value as string);
    expect(chart?.kind).toBe("chart");
    const attrs = chart?.attrs as unknown as ChartAttrs;
    expect(attrs.datasetId).toBe(dsId);
    const cols = datasets[0]?.payload.columns ?? [];
    expect(categoryField(attrs.encoding)).toBe(cols[0]?.name);
    expect(valueFields(attrs.encoding)).toEqual(cols.slice(1).map((c) => c.name));
    // The reference resolves (chart can actually read its data).
    expect(resolveDataset(doc, attrs.datasetId)).toBeDefined();
  });

  it("respects an explicit chartType and custom dataset", () => {
    const ctx = makeCtx();
    const res = cmd("weave.chart.add").run(ctx, {
      chartType: "pie",
      dataset: {
        name: "커스텀",
        columns: [
          { name: "x", type: "nominal" },
          { name: "y", type: "quantitative" },
        ],
        rows: [{ x: "A", y: 1 }],
      },
    });
    if (!res.ok) throw new Error("expected ok");
    const doc = applyAll(ctx.document, res.patches);
    const chart = findItemDeep(doc, res.value as string);
    const attrs = chart?.attrs as unknown as ChartAttrs;
    expect(attrs.chartType).toBe("pie");
    expect(attrs.encoding).toEqual({ category: { field: "x" }, value: [{ field: "y" }] });
    expect(listDatasets(doc)[0]?.payload.name).toBe("커스텀");
  });

  it("undo removes BOTH the chart and its seeded dataset (one transaction)", () => {
    const ctx = makeCtx();
    const res = cmd("weave.chart.add").run(ctx, {});
    if (!res.ok) throw new Error("expected ok");
    let doc = applyAll(ctx.document, res.patches);
    expect(findItemDeep(doc, res.value as string)).toBeDefined();
    expect(listDatasets(doc)).toHaveLength(1);

    doc = applyAll(doc, res.patches.map(invert).reverse());
    expect(findItemDeep(doc, res.value as string)).toBeUndefined();
    expect(listDatasets(doc)).toHaveLength(0);
  });
});
