// WI-077 Phase 1 — dataset store pure-helper tests (DR-031).

import type { Document as AgocraftDocument, Unit as AgocraftUnit } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import {
  buildDatasetUnit,
  DATASET_UNIT_KIND,
  type DatasetPayload,
  emptyDatasetPayload,
  findDatasetUnit,
  inferFieldType,
  listDatasets,
  migrateDatasetColumns,
  normalizeDatasetPayload,
  readDatasetPayload,
  resolveDataset,
} from "./dataset-store.js";

const SAMPLE: DatasetPayload = {
  name: "분기 매출",
  columns: [
    { name: "quarter", type: "nominal" },
    { name: "revenue", type: "quantitative" },
  ],
  rows: [
    { quarter: "Q1", revenue: 120 },
    { quarter: "Q2", revenue: 150 },
  ],
};

/** Minimal doc carrying the given root units — store helpers only read
 *  `doc.root.units`, so a partial cast is sufficient. */
function docWithUnits(units: ReadonlyArray<AgocraftUnit>): AgocraftDocument {
  return { root: { units } } as unknown as AgocraftDocument;
}

describe("dataset-store — payload helpers", () => {
  it("emptyDatasetPayload returns a fresh empty table each call", () => {
    const a = emptyDatasetPayload();
    const b = emptyDatasetPayload();
    expect(a).toEqual({ name: "데이터셋", columns: [], rows: [] });
    expect(a).not.toBe(b);
  });

  it("normalizeDatasetPayload fills missing fields from the empty default", () => {
    expect(normalizeDatasetPayload()).toEqual(emptyDatasetPayload());
    expect(normalizeDatasetPayload({ columns: [{ name: "x", type: "nominal" }] })).toEqual({
      name: "데이터셋",
      columns: [{ name: "x", type: "nominal" }],
      rows: [],
    });
    // Legacy string columns are migrated to typed columns (DR-036).
    expect(
      normalizeDatasetPayload({ columns: ["x"] as unknown as DatasetPayload["columns"] }),
    ).toEqual({
      name: "데이터셋",
      columns: [{ name: "x", type: "nominal" }],
      rows: [],
    });
    expect(normalizeDatasetPayload(SAMPLE)).toEqual(SAMPLE);
  });
});

describe("DR-036 — column typing", () => {
  it("inferFieldType: all-number → quantitative, dates → temporal, else nominal", () => {
    const rows = [
      { n: 1, d: "2026-01", s: "A", e: "" },
      { n: 2, d: "2026-02", s: "B", e: "" },
    ];
    expect(inferFieldType(rows, "n")).toBe("quantitative");
    expect(inferFieldType(rows, "d")).toBe("temporal");
    expect(inferFieldType(rows, "s")).toBe("nominal");
    expect(inferFieldType(rows, "e")).toBe("nominal"); // all-blank → nominal
    // a bare year stays quantitative (not temporal — no separator)
    expect(inferFieldType([{ y: "2026" }, { y: "2027" }], "y")).toBe("quantitative");
  });

  it("migrateDatasetColumns: legacy string[] → typed, idempotent on typed", () => {
    const legacy = {
      name: "x",
      columns: ["분기", "매출"],
      rows: [
        { 분기: "Q1", 매출: 10 },
        { 분기: "Q2", 매출: 20 },
      ],
    } as unknown as DatasetPayload;
    const migrated = migrateDatasetColumns(legacy);
    expect(migrated.columns).toEqual([
      { name: "분기", type: "nominal" },
      { name: "매출", type: "quantitative" },
    ]);
    // idempotent — a typed payload returns the SAME ref
    expect(migrateDatasetColumns(migrated)).toBe(migrated);
  });

  it("readDatasetPayload migrates legacy columns at the read boundary", () => {
    const unit = {
      id: "ds1",
      kind: DATASET_UNIT_KIND,
      attrs: { dataset: { name: "x", columns: ["a"], rows: [{ a: "z" }] } },
      meta: {},
    } as unknown as AgocraftUnit;
    expect(readDatasetPayload(unit)?.columns).toEqual([{ name: "a", type: "nominal" }]);
  });
});

describe("dataset-store — unit build/read round-trip", () => {
  it("buildDatasetUnit carries the payload under attrs.dataset with the dataset kind", () => {
    const unit = buildDatasetUnit("ds-1", SAMPLE);
    expect(unit.kind).toBe(DATASET_UNIT_KIND);
    expect(String(unit.id)).toBe("ds-1");
    expect(unit.attrs.dataset).toEqual(SAMPLE);
  });

  it("readDatasetPayload reads it back; rejects non-dataset units", () => {
    const unit = buildDatasetUnit("ds-1", SAMPLE);
    expect(readDatasetPayload(unit)).toEqual(SAMPLE);
    const other = {
      id: "u",
      kind: "style.provider",
      attrs: {},
      meta: {},
    } as unknown as AgocraftUnit;
    expect(readDatasetPayload(other)).toBeUndefined();
  });
});

describe("dataset-store — document lookups", () => {
  it("findDatasetUnit locates by id with its index; misses return undefined", () => {
    const doc = docWithUnits([
      { id: "style", kind: "style.provider", attrs: {}, meta: {} } as unknown as AgocraftUnit,
      buildDatasetUnit("ds-1", SAMPLE),
    ]);
    const found = findDatasetUnit(doc, "ds-1");
    expect(found?.index).toBe(1);
    expect(findDatasetUnit(doc, "nope")).toBeUndefined();
  });

  it("resolveDataset returns the payload, or undefined for dangling / empty id", () => {
    const doc = docWithUnits([buildDatasetUnit("ds-1", SAMPLE)]);
    expect(resolveDataset(doc, "ds-1")).toEqual(SAMPLE);
    expect(resolveDataset(doc, "ds-missing")).toBeUndefined();
    expect(resolveDataset(doc, "")).toBeUndefined();
  });

  it("listDatasets returns every dataset, skipping non-dataset units", () => {
    const doc = docWithUnits([
      { id: "style", kind: "style.provider", attrs: {}, meta: {} } as unknown as AgocraftUnit,
      buildDatasetUnit("ds-1", SAMPLE),
      buildDatasetUnit("ds-2", emptyDatasetPayload("빈 데이터")),
    ]);
    const list = listDatasets(doc);
    expect(list.map((d) => d.id)).toEqual(["ds-1", "ds-2"]);
    expect(list[0]?.payload).toEqual(SAMPLE);
  });
});
