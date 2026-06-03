// WI-077 Phase 5 — pure dataset table transforms (DatasetEditorDialog ops).

import { describe, expect, it } from "vitest";
import {
  addColumn,
  addRow,
  coerceCell,
  columnNames,
  type DatasetPayload,
  removeColumn,
  removeRow,
  renameColumn,
  setCell,
  setCells,
} from "./dataset-store.js";

const BASE: DatasetPayload = {
  name: "t",
  columns: [
    { name: "항목", type: "nominal" },
    { name: "값", type: "quantitative" },
  ],
  rows: [
    { 항목: "A", 값: 10 },
    { 항목: "B", 값: 20 },
  ],
};

describe("coerceCell", () => {
  it("numeric strings → number, else string, blank → ''", () => {
    expect(coerceCell("42")).toBe(42);
    expect(coerceCell("3.5")).toBe(3.5);
    expect(coerceCell("A")).toBe("A");
    expect(coerceCell("   ")).toBe("");
  });
});

describe("setCell", () => {
  it("sets one cell (coerced), preserving others; out-of-range is a no-op", () => {
    expect(setCell(BASE, 1, "값", "99").rows[1]).toEqual({ 항목: "B", 값: 99 });
    expect(setCell(BASE, 0, "항목", "X").rows[0]).toEqual({ 항목: "X", 값: 10 });
    expect(setCell(BASE, 9, "값", "1")).toBe(BASE);
  });
});

describe("addRow / removeRow", () => {
  it("addRow appends a blank row for every column", () => {
    const out = addRow(BASE);
    expect(out.rows).toHaveLength(3);
    expect(out.rows[2]).toEqual({ 항목: "", 값: "" });
  });
  it("removeRow drops the row; out-of-range is a no-op", () => {
    expect(removeRow(BASE, 0).rows).toEqual([{ 항목: "B", 값: 20 }]);
    expect(removeRow(BASE, 9)).toBe(BASE);
  });
});

describe("addColumn / removeColumn", () => {
  it("addColumn appends a uniquely-named column with blank cells", () => {
    const out = addColumn(BASE);
    expect(columnNames(out)).toEqual(["항목", "값", "열3"]);
    expect(out.columns[2]).toEqual({ name: "열3", type: "nominal" });
    expect(out.rows[0]?.열3).toBe("");
  });
  it("removeColumn drops the column from header AND every row", () => {
    const out = removeColumn(BASE, "값");
    expect(columnNames(out)).toEqual(["항목"]);
    expect(out.rows[0]).toEqual({ 항목: "A" });
  });
});

describe("setCells (long-format group write)", () => {
  const LONG: DatasetPayload = {
    name: "t",
    columns: [
      { name: "월", type: "nominal" },
      { name: "값", type: "quantitative" },
    ],
    rows: [
      { 월: "1월", 값: 10 },
      { 월: "1월", 값: 20 },
      { 월: "2월", 값: 30 },
    ],
  };
  it("writes the coerced value to every listed row index", () => {
    const out = setCells(LONG, [0, 1], "월", "Q1");
    expect(out.rows.map((r) => r.월)).toEqual(["Q1", "Q1", "2월"]);
  });
  it("ignores out-of-range indices; no-op when none in range (same ref)", () => {
    expect(setCells(LONG, [2, 9], "월", "X").rows.map((r) => r.월)).toEqual(["1월", "1월", "X"]);
    expect(setCells(LONG, [9], "월", "X")).toBe(LONG);
  });
});

describe("renameColumn", () => {
  it("remaps the key across header and rows", () => {
    const out = renameColumn(BASE, "값", "revenue");
    expect(columnNames(out)).toEqual(["항목", "revenue"]);
    // rename preserves the column's declared type
    expect(out.columns[1]).toEqual({ name: "revenue", type: "quantitative" });
    expect(out.rows[0]).toEqual({ 항목: "A", revenue: 10 });
  });
  it("no-op on blank / collision / missing", () => {
    expect(renameColumn(BASE, "값", "")).toBe(BASE);
    expect(renameColumn(BASE, "값", "항목")).toBe(BASE); // collision
    expect(renameColumn(BASE, "없음", "x")).toBe(BASE); // missing
  });
});
