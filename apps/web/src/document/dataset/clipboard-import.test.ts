// WI-077 — clipboard table import (Excel/Sheets TSV paste) pure helpers.

import { describe, expect, it } from "vitest";
import {
  clipboardTableToPayload,
  columnNames,
  type DatasetPayload,
  detectHeaderRow,
  looksNumeric,
  parseClipboardTable,
  pasteTableAt,
} from "./dataset-store.js";

describe("parseClipboardTable", () => {
  it("splits TSV rows/cols; drops trailing newline; handles CRLF", () => {
    expect(parseClipboardTable("a\tb\n1\t2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseClipboardTable("a\tb\r\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseClipboardTable("")).toEqual([]);
    expect(parseClipboardTable("solo")).toEqual([["solo"]]);
  });
});

describe("detectHeaderRow", () => {
  it("first row labels over numeric data → header", () => {
    expect(
      detectHeaderRow([
        ["분기", "매출"],
        ["Q1", "120"],
      ]),
    ).toBe(true);
  });
  it("first row has a number → data, not header", () => {
    expect(
      detectHeaderRow([
        ["Q1", "120"],
        ["Q2", "150"],
      ]),
    ).toBe(false);
  });
  it("single row → no header", () => {
    expect(detectHeaderRow([["a", "b"]])).toBe(false);
  });
});

describe("clipboardTableToPayload", () => {
  it("auto-detects header → columns from row 0, numeric cells coerced", () => {
    const p = clipboardTableToPayload(parseClipboardTable("분기\t매출\nQ1\t120\nQ2\t150"));
    expect(columnNames(p)).toEqual(["분기", "매출"]);
    // DR-036 — types inferred from cells: 매출 (all-number) → quantitative.
    expect(p.columns).toEqual([
      { name: "분기", type: "nominal" },
      { name: "매출", type: "quantitative" },
    ]);
    expect(p.rows).toEqual([
      { 분기: "Q1", 매출: 120 },
      { 분기: "Q2", 매출: 150 },
    ]);
  });

  it("no header → generated column names, all rows are data", () => {
    const p = clipboardTableToPayload(parseClipboardTable("Q1\t120\nQ2\t150"));
    expect(columnNames(p)).toEqual(["열1", "열2"]);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toEqual({ 열1: "Q1", 열2: 120 });
  });

  it("forced header=false keeps row 0 as data", () => {
    const p = clipboardTableToPayload(
      [
        ["a", "b"],
        ["1", "2"],
      ],
      { header: false },
    );
    expect(columnNames(p)).toEqual(["열1", "열2"]);
    expect(p.rows).toHaveLength(2);
  });

  it("de-duplicates blank/colliding header names", () => {
    const p = clipboardTableToPayload(
      [
        ["x", "", "x"],
        ["1", "2", "3"],
      ],
      { header: true },
    );
    expect(columnNames(p)).toEqual(["x", "열2", "x_2"]);
  });

  it("ragged rows fill missing cells with empty", () => {
    const p = clipboardTableToPayload(
      [
        ["a", "b", "c"],
        ["1", "2"],
      ],
      { header: true },
    );
    expect(p.rows[0]).toEqual({ a: 1, b: 2, c: "" });
  });

  it("empty grid → empty payload", () => {
    expect(clipboardTableToPayload([]).rows).toEqual([]);
  });
});

describe("looksNumeric", () => {
  it("numbers yes, labels/blank no", () => {
    expect(looksNumeric("42")).toBe(true);
    expect(looksNumeric("-3.5")).toBe(true);
    expect(looksNumeric("Q1")).toBe(false);
    expect(looksNumeric("  ")).toBe(false);
  });
});

describe("pasteTableAt (anchor paste)", () => {
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

  it("overwrites from the anchor cell, preserving cells outside the block", () => {
    // Paste a 2×1 block into the 값 column (col 1) starting at row 0.
    const out = pasteTableAt(BASE, [["100"], ["200"]], 0, 1);
    expect(out.rows).toEqual([
      { 항목: "A", 값: 100 },
      { 항목: "B", 값: 200 },
    ]);
  });

  it("expands rows when the block extends past the end", () => {
    const out = pasteTableAt(BASE, [["1"], ["2"], ["3"]], 1, 1);
    expect(out.rows).toHaveLength(4); // 1 anchor + 3 rows
    expect(out.rows[1]).toEqual({ 항목: "B", 값: 1 });
    expect(out.rows[3]).toEqual({ 항목: "", 값: 3 });
  });

  it("expands columns (generated names) and backfills old rows", () => {
    const out = pasteTableAt(BASE, [["x", "y"]], 0, 1); // writes 값 + a new col
    expect(columnNames(out)).toEqual(["항목", "값", "열3"]);
    expect(out.rows[0]).toEqual({ 항목: "A", 값: "x", 열3: "y" });
    expect(out.rows[1]).toEqual({ 항목: "B", 값: 20, 열3: "" }); // old row backfilled
  });

  it("clamps negative anchors and is a no-op on empty block", () => {
    expect(pasteTableAt(BASE, [["9"]], -5, -5).rows[0]).toEqual({ 항목: 9, 값: 10 });
    expect(pasteTableAt(BASE, [], 0, 0)).toBe(BASE);
  });
});
