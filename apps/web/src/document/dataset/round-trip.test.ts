// WI-077 Phase 7 — persistence round-trip (DR-031 gate).
//
// The whole point of the root-unit dataset model is that it survives save→load
// for free (units round-trip like style.provider). This proves it end-to-end:
// build a real chart + dataset via weave.chart.add, push the doc through the
// SAME serializer the storage layer uses (toJSON → JSON string → fromJSON with
// onUnknown:"preserve"), and assert the dataset is still resolvable and the
// chart still references it with its encoding intact.

import {
  type Document as AgocraftDocument,
  type Command,
  type CommandContext,
  createFeatureRegistry,
  createSchema,
  createSerializer,
  type Patch,
} from "@agocraft/core";
import { describe, expect, it, vi } from "vitest";
import {
  applyChangeToDocument,
  findItemDeep,
  toAgocraftDocument,
  updateChild,
} from "../agocraft-mirror.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "../commands.js";
import type { ChartAttrs, Document as WeaveDocument } from "../types.js";
import { listDatasets, resolveDataset } from "./dataset-store.js";

function targets(): WeaveCommandTargets {
  return {
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    updateBehavior: vi.fn(),
    reset: vi.fn(),
  };
}

function emptyCtx(): CommandContext {
  const weave: WeaveDocument = {
    id: "doc-1",
    title: "RT",
    items: [],
    updatedAt: "2026-06-02T00:00:00Z",
    schemaVersion: 3,
  };
  return {
    document: toAgocraftDocument(weave),
    resolve: () => null as never,
    skipRelations: false,
  };
}

function chartAddCommand(): Command {
  const c = buildWeaveCommands(targets()).find((x) => x.name === "weave.chart.add");
  if (c === undefined) throw new Error("weave.chart.add not found");
  return c;
}

/** Push a doc through the storage serializer (toJSON → JSON → fromJSON). */
function roundTrip(doc: AgocraftDocument): AgocraftDocument {
  const serializer = createSerializer();
  const json = JSON.parse(JSON.stringify(serializer.toJSON(doc)));
  const result = serializer.fromJSON(json, {
    schema: createSchema(),
    features: createFeatureRegistry(),
    onUnknown: "preserve",
  });
  if (!result.ok) throw new Error("fromJSON failed");
  return result.document;
}

describe("chart + dataset persistence round-trip", () => {
  it("dataset (root unit) and chart (child) both survive save→load losslessly", () => {
    const ctx = emptyCtx();
    const res = chartAddCommand().run(ctx, {
      chartType: "line",
      dataset: {
        name: "분기 매출",
        columns: ["분기", "매출", "비용"],
        rows: [
          { 분기: "Q1", 매출: 120, 비용: 80 },
          { 분기: "Q2", 매출: 150, 비용: 90 },
        ],
      },
    });
    if (!res.ok) throw new Error("chart.add failed");

    // Materialize the create, then round-trip the whole doc.
    let doc = ctx.document;
    for (const p of res.patches) doc = applyChangeToDocument(doc, p as Patch as never);
    const before = listDatasets(doc)[0];
    const reloaded = roundTrip(doc);

    // Dataset survives, byte-for-byte payload.
    const after = listDatasets(reloaded);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before?.id);
    expect(after[0]?.payload).toEqual(before?.payload);

    // Chart survives and still references the dataset with its encoding.
    const chart = findItemDeep(reloaded, res.value as string);
    expect(chart?.kind).toBe("chart");
    const attrs = chart?.attrs as unknown as ChartAttrs;
    expect(attrs.datasetId).toBe(before?.id);
    expect(attrs.chartType).toBe("line");
    // DR-036 — channel encoding survives round-trip (category + multi-value).
    expect(attrs.encoding).toEqual({
      category: { field: "분기" },
      value: [{ field: "매출" }, { field: "비용" }],
    });

    // And the reference resolves after reload (the chart can read its data).
    expect(resolveDataset(reloaded, attrs.datasetId)).toEqual(before?.payload);
  });

  it("per-element overrides (mark, stable-keyed) survive round-trip", () => {
    const ctx = emptyCtx();
    const res = chartAddCommand().run(ctx, {
      chartType: "bar",
      dataset: {
        name: "d",
        columns: ["c", "v"],
        rows: [
          { c: "A", v: 10 },
          { c: "B", v: 20 },
        ],
      },
    });
    if (!res.ok) throw new Error("chart.add failed");
    let doc = ctx.document;
    for (const p of res.patches) doc = applyChangeToDocument(doc, p as Patch as never);

    // Emphasis overrides keyed by CATEGORY (stable key — DR-035).
    const overrides = {
      datum: { B: { color: "#ff0000", borderWidth: 3 } },
    };
    doc = updateChild(doc, res.value as string, (it) => ({
      ...it,
      attrs: { ...it.attrs, overrides },
    }));

    const reloaded = roundTrip(doc);
    const attrs = findItemDeep(reloaded, res.value as string)?.attrs as unknown as ChartAttrs;
    // Both maps survive byte-for-byte, still keyed by category name.
    expect(attrs.overrides).toEqual(overrides);
  });
});
