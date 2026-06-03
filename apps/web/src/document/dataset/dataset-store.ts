// WI-077 Phase 1 — dataset 데이터 스토어 (DR-031 / FR-015).
//
// "데이터를 관리하는 아이템" — but NOT a `DomainKind` item. A dataset is the
// data SOURCE that `chart` items reference by id; it has no spatial frame and
// never renders on the canvas. It lives as a Unit on the document ROOT
// (`doc.root.units`), exactly like the `style.provider` Unit (theme tokens):
//   - off-canvas (not a child Item → no z-order / selection / marquee)
//   - serialized + round-tripped for free (root units survive the Serializer)
//   - mutated through `weave.dataset.*` commands → Patch → History (undo/redo)
//
// chart items resolve their data each render via `resolveDataset(doc, id)`.
// Because the doc is immutable, a `weave.dataset.update` produces a new
// snapshot and every referencing chart re-renders with no extra wiring
// (DR-031 § 4 — reactivity is free).

import type { Document as AgocraftDocument, Unit as AgocraftUnit } from "@agocraft/core";
import { unitId } from "@agocraft/core";

/** Unit kind that marks a root Unit as a dataset. Weave-local — not an
 *  agocraft builtin (agocraft treats Unit attrs as opaque, so a weave-only
 *  unit kind round-trips losslessly, same as the data-driven `qr` item). */
export const DATASET_UNIT_KIND = "dataset" as const;

/** One row of a dataset, keyed by column name (NOT positional) so a column
 *  reorder/rename never silently re-maps values, and a chart's `encoding`
 *  references columns by their stable name. */
export type DatasetCell = string | number | boolean | null;
export type DatasetRow = Readonly<Record<string, DatasetCell>>;

/** DR-036 — a column's declared data type. This is the "format" that lets a
 *  chart know how to treat each column (category axis vs value axis vs time
 *  axis), independent of the chart type. Mirrors the grammar-of-graphics field
 *  types (Vega-Lite / ggplot). */
export type FieldType = "nominal" | "ordinal" | "quantitative" | "temporal";

/** DR-036 — a typed dataset column. The column carries its NAME (the stable row
 *  key) and its TYPE (how charts interpret it). `format` is an optional parse /
 *  display hint (e.g. "YYYY-MM", "0.0%"). Replaces the bare `string` column. */
export interface DatasetColumn {
  readonly name: string;
  readonly type: FieldType;
  readonly format?: string;
}

/** The full dataset payload carried under `unit.attrs.dataset`. Mirrors the
 *  behavior pattern (`unit.attrs.behavior`) so a single `unit.attrs` patch
 *  with path `["dataset"]` replaces it atomically. */
export interface DatasetPayload {
  /** Human label shown in the dataset picker / panel. */
  readonly name: string;
  /** Ordered TYPED columns (DR-036). The order is the display/axis order; row
   *  lookup is by name, so reordering columns never moves cell values. */
  readonly columns: ReadonlyArray<DatasetColumn>;
  /** Row records keyed by column name. Cells absent for a column read as
   *  empty in the chart layer (graceful, like a sparse table). */
  readonly rows: ReadonlyArray<DatasetRow>;
}

/** The ordered column NAMES — the many call sites that only need the name list
 *  (axis order, row iteration, encoding pickers). */
export function columnNames(payload: DatasetPayload): ReadonlyArray<string> {
  return payload.columns.map((c) => c.name);
}

/** Look up a column's declared type by name (default `nominal` when unknown). */
export function columnType(payload: DatasetPayload, name: string): FieldType {
  return payload.columns.find((c) => c.name === name)?.type ?? "nominal";
}

/** Infer a column's FieldType from its cells: all-number → quantitative, all
 *  parseable as a date → temporal, otherwise nominal. Used when importing
 *  untyped data (clipboard paste) and when migrating legacy string columns. */
export function inferFieldType(rows: ReadonlyArray<DatasetRow>, name: string): FieldType {
  let sawValue = false;
  let allNumber = true;
  let allTemporal = true;
  for (const r of rows) {
    const v = r[name];
    if (v === undefined || v === null || v === "") continue;
    sawValue = true;
    if (typeof v !== "number" && !(typeof v === "string" && looksNumeric(v))) allNumber = false;
    if (!(typeof v === "string" && looksTemporal(v))) allTemporal = false;
  }
  if (!sawValue) return "nominal";
  if (allNumber) return "quantitative";
  if (allTemporal) return "temporal";
  return "nominal";
}

/** A `DatasetColumn` with its type inferred from the rows. */
function inferredColumn(name: string, rows: ReadonlyArray<DatasetRow>): DatasetColumn {
  return { name, type: inferFieldType(rows, name) };
}

/** True when `s` parses as a date weave treats as temporal. Conservative: needs
 *  a year and a separator (so a bare "2026" stays quantitative, not temporal). */
export function looksTemporal(s: string): boolean {
  const t = s.trim();
  if (t === "" || looksNumeric(t)) return false;
  // ISO-ish (2026-06-03, 2026/06, 2026.06) or a Date-parseable string with a digit.
  if (!/\d/.test(t)) return false;
  if (/^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?/.test(t)) return true;
  return !Number.isNaN(Date.parse(t)) && /[-/:]/.test(t);
}

/** A resolved dataset paired with its id (the id is the Unit id, which is
 *  also what `chart.attrs.datasetId` stores). */
export interface ResolvedDataset {
  readonly id: string;
  readonly payload: DatasetPayload;
}

/** Empty payload — a freshly-added dataset starts with no columns/rows and a
 *  default name. Returns a fresh object each call (no shared mutable ref). */
export function emptyDatasetPayload(name = "데이터셋"): DatasetPayload {
  return { name, columns: [], rows: [] };
}

/** Normalize a partial payload into a complete one (fills missing fields from
 *  `emptyDatasetPayload`). Used by `weave.dataset.add` so callers can pass
 *  just `{ columns, rows }` or nothing at all. */
export function normalizeDatasetPayload(partial?: Partial<DatasetPayload>): DatasetPayload {
  const base = emptyDatasetPayload();
  if (partial === undefined) return base;
  // Migrate so a caller passing legacy `columns: string[]` still yields typed
  // columns (DR-036).
  return migrateDatasetColumns({
    name: partial.name ?? base.name,
    columns: partial.columns ?? base.columns,
    rows: partial.rows ?? base.rows,
  });
}

let datasetCounter = 0;

/** Generate a fresh dataset id. Commands accept an explicit `id` for
 *  determinism (tests / agent), and fall back to this when omitted. Mirrors
 *  seed.ts's `nextId` scheme. */
export function nextDatasetId(): string {
  datasetCounter += 1;
  return `dataset-${Date.now().toString(36)}-${datasetCounter.toString(36)}`;
}

// ── Pure table transforms (WI-077 Phase 5) ──────────────────────────────────
//
// The dataset editor panel (DatasetEditorDialog) mutates a dataset through
// these pure helpers, each dispatched as `weave.dataset.update({ id, patch })`
// so every table edit is one undoable transaction. Rows are keyed by column
// NAME, so add/remove/rename operate on the columns array AND remap row keys
// consistently. Kept pure (no React, no doc) → unit-testable in isolation.

/** Coerce a raw input string to a cell value: a finite-number string becomes a
 *  number (so charts plot it), anything else stays a string. */
export function coerceCell(raw: string): DatasetCell {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : raw;
}

// ── Clipboard table import (WI-077 — Excel/Sheets paste) ────────────────────
//
// Excel / Google Sheets put a TAB-separated, newline-delimited block on the
// clipboard when you copy a range. These pure helpers turn that text into a
// DatasetPayload so a paste can replace/import a whole table in one undoable
// `weave.dataset.update`. Header detection is automatic (a first row with no
// numbers, over data rows that have numbers, reads as column names).

/** True when `s` trims to a finite number (used for header heuristics). */
export function looksNumeric(s: string): boolean {
  const t = s.trim();
  return t !== "" && Number.isFinite(Number(t));
}

/** Parse clipboard text into a 2-D string grid (TSV — Excel/Sheets default).
 *  Trailing blank line is dropped; ragged rows are kept as-is. Empty → []. */
export function parseClipboardTable(text: string): string[][] {
  const norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "");
  if (norm === "") return [];
  return norm.split("\n").map((line) => line.split("\t"));
}

/** Heuristic: does row 0 look like a header? Yes when it has NO numeric cells
 *  and at least one later row DOES — i.e. labels over data. Needs ≥2 rows. */
export function detectHeaderRow(table: ReadonlyArray<ReadonlyArray<string>>): boolean {
  if (table.length < 2) return false;
  const first = table[0] ?? [];
  if (first.some(looksNumeric)) return false;
  return table.slice(1).some((r) => r.some(looksNumeric));
}

/** Build a DatasetPayload from a parsed clipboard grid. When `header` (default
 *  auto-detected) the first row becomes column names; otherwise columns are
 *  generated (`열1`, `열2`, …). Column names are de-duplicated. Cells coerce to
 *  number where possible. */
export function clipboardTableToPayload(
  table: ReadonlyArray<ReadonlyArray<string>>,
  opts: { readonly name?: string; readonly header?: boolean } = {},
): DatasetPayload {
  if (table.length === 0) return emptyDatasetPayload(opts.name);
  const hasHeader = opts.header ?? detectHeaderRow(table);
  const width = table.reduce((m, r) => Math.max(m, r.length), 0);
  const headerRow = hasHeader ? table[0] : undefined;

  const seen = new Set<string>();
  const names: string[] = [];
  for (let i = 0; i < width; i++) {
    const raw = headerRow?.[i]?.trim();
    let name = raw && raw !== "" ? raw : `열${i + 1}`;
    let n = 1;
    while (seen.has(name)) {
      n += 1;
      name = `${raw && raw !== "" ? raw : `열${i + 1}`}_${n}`;
    }
    seen.add(name);
    names.push(name);
  }

  const dataRows = hasHeader ? table.slice(1) : table;
  const rows = dataRows.map((r) => {
    const obj: Record<string, DatasetCell> = {};
    names.forEach((col, i) => {
      obj[col] = coerceCell(r[i] ?? "");
    });
    return obj;
  });
  // DR-036 — infer each column's type from the imported cells.
  const columns = names.map((n) => inferredColumn(n, rows));
  return { name: opts.name ?? "데이터셋", columns, rows };
}

/** Anchor paste (Excel-style): write a parsed block into the dataset starting at
 *  cell (`anchorRow`, `anchorCol`), OVERWRITING that region and auto-expanding
 *  rows / columns to fit — everything outside the block is preserved. New
 *  columns get generated names (`열N`); cells coerce to number where possible.
 *  Empty block → unchanged. Anchors clamp to ≥ 0. */
export function pasteTableAt(
  payload: DatasetPayload,
  table: ReadonlyArray<ReadonlyArray<string>>,
  anchorRow: number,
  anchorCol: number,
): DatasetPayload {
  if (table.length === 0) return payload;
  const aRow = Math.max(0, anchorRow);
  const aCol = Math.max(0, anchorCol);
  const blockWidth = table.reduce((m, r) => Math.max(m, r.length), 0);

  // Grow column NAMES to cover aCol + blockWidth (unique generated names).
  const names = columnNames(payload).slice();
  const seen = new Set(names);
  while (names.length < aCol + blockWidth) {
    let i = names.length + 1;
    let name = `열${i}`;
    while (seen.has(name)) {
      i += 1;
      name = `열${i}`;
    }
    seen.add(name);
    names.push(name);
  }

  // Rebuild rows: grow to cover aRow + table.length and normalize every row to
  // the full column set (so newly-added columns exist on old rows).
  const total = Math.max(payload.rows.length, aRow + table.length);
  const rows: Record<string, DatasetCell>[] = [];
  for (let i = 0; i < total; i++) {
    const src = payload.rows[i] ?? {};
    const r: Record<string, DatasetCell> = {};
    for (const c of names) r[c] = src[c] ?? "";
    rows.push(r);
  }

  // Write the block from the anchor.
  table.forEach((line, dr) => {
    line.forEach((cell, dc) => {
      const col = names[aCol + dc];
      const row = rows[aRow + dr];
      if (col !== undefined && row !== undefined) row[col] = coerceCell(cell);
    });
  });

  // DR-036 — preserve existing column types; infer types for newly-added /
  // overwritten columns from the resulting rows.
  const prevType = new Map(payload.columns.map((c) => [c.name, c]));
  const columns = names.map((n) => prevType.get(n) ?? inferredColumn(n, rows));
  return { ...payload, columns, rows };
}

/** Set one cell (row `rowIndex`, column `column`) to `raw` (coerced). No-op if
 *  the row index is out of range. Used by the chart label layer (WI-078) to
 *  push a label edit back into the category cell. */
export function setCell(
  payload: DatasetPayload,
  rowIndex: number,
  column: string,
  raw: string,
): DatasetPayload {
  if (rowIndex < 0 || rowIndex >= payload.rows.length) return payload;
  const rows = payload.rows.map((r, i) =>
    i === rowIndex ? { ...r, [column]: coerceCell(raw) } : r,
  );
  return { ...payload, rows };
}

/** Set `column` to `raw` (coerced) on every row in `rowIndices`. Used by
 *  LONG-format chart labels (WI-084): one label binds a DISTINCT category that
 *  spans several rows, so editing it writes the new value to each. The indices
 *  are STABLE across the per-keystroke commits (unlike a rename-by-value key,
 *  which shifts as cells change). No-op when no index is in range. */
export function setCells(
  payload: DatasetPayload,
  rowIndices: ReadonlyArray<number>,
  column: string,
  raw: string,
): DatasetPayload {
  const target = new Set(rowIndices.filter((i) => i >= 0 && i < payload.rows.length));
  if (target.size === 0) return payload;
  const next = coerceCell(raw);
  const rows = payload.rows.map((r, i) => (target.has(i) ? { ...r, [column]: next } : r));
  return { ...payload, rows };
}

/** Append an empty row (all columns blank). */
export function addRow(payload: DatasetPayload): DatasetPayload {
  const blank: Record<string, DatasetCell> = {};
  for (const c of payload.columns) blank[c.name] = "";
  return { ...payload, rows: [...payload.rows, blank] };
}

/** Remove the row at `rowIndex` (no-op if out of range). */
export function removeRow(payload: DatasetPayload, rowIndex: number): DatasetPayload {
  if (rowIndex < 0 || rowIndex >= payload.rows.length) return payload;
  return { ...payload, rows: payload.rows.filter((_, i) => i !== rowIndex) };
}

/** Append a new column with a unique default name (type `nominal`); existing
 *  rows get a blank cell for it. */
export function addColumn(payload: DatasetPayload): DatasetPayload {
  const existing = new Set(columnNames(payload));
  let n = payload.columns.length + 1;
  let name = `열${n}`;
  while (existing.has(name)) {
    n += 1;
    name = `열${n}`;
  }
  const rows = payload.rows.map((r) => ({ ...r, [name]: "" as DatasetCell }));
  return { ...payload, columns: [...payload.columns, { name, type: "nominal" }], rows };
}

/** Remove a column from `columns` and delete its key from every row. */
export function removeColumn(payload: DatasetPayload, column: string): DatasetPayload {
  if (!payload.columns.some((c) => c.name === column)) return payload;
  const rows = payload.rows.map((r) => {
    const { [column]: _drop, ...rest } = r;
    return rest;
  });
  return { ...payload, columns: payload.columns.filter((c) => c.name !== column), rows };
}

/** Set a column's declared FieldType (DR-036). No-op when the column is
 *  unknown. The grid header type-selector dispatches this. */
export function setColumnType(
  payload: DatasetPayload,
  column: string,
  type: FieldType,
): DatasetPayload {
  if (!payload.columns.some((c) => c.name === column)) return payload;
  return {
    ...payload,
    columns: payload.columns.map((c) => (c.name === column ? { ...c, type } : c)),
  };
}

/** Rename a column, remapping its key across every row. No-op when `from`
 *  doesn't exist; when `to` collides with another column or is blank the
 *  original is returned unchanged (the panel keeps the old name). */
export function renameColumn(payload: DatasetPayload, from: string, to: string): DatasetPayload {
  const next = to.trim();
  if (from === next) return payload;
  const names = new Set(columnNames(payload));
  if (next === "" || !names.has(from) || names.has(next)) {
    return payload;
  }
  const columns = payload.columns.map((c) => (c.name === from ? { ...c, name: next } : c));
  const rows = payload.rows.map((r) => {
    const { [from]: moved, ...rest } = r;
    return { ...rest, [next]: moved ?? "" };
  });
  return { ...payload, columns, rows };
}

/** Build the agocraft Unit that carries a dataset. The whole payload lives
 *  under `attrs.dataset` (single key) so `unit.attrs` path `["dataset"]`
 *  replaces it in one patch — symmetric with `behaviorToUnit`'s
 *  `attrs.behavior`. */
export function buildDatasetUnit(id: string, payload: DatasetPayload): AgocraftUnit {
  const ts = new Date().toISOString();
  return {
    id: unitId(id),
    kind: DATASET_UNIT_KIND,
    attrs: { dataset: payload as unknown as Readonly<Record<string, unknown>> },
    meta: { createdAt: ts, updatedAt: ts, schemaVersion: 1 } as AgocraftUnit["meta"],
  };
}

/** DR-036 migration — normalize a stored payload so consumers always see TYPED
 *  columns. Legacy payloads (WI-077) stored `columns: string[]`; convert those
 *  to `DatasetColumn[]` with types inferred from the rows. Idempotent: a payload
 *  that already has typed columns is returned unchanged (same ref). */
export function migrateDatasetColumns(payload: DatasetPayload): DatasetPayload {
  const cols = payload.columns as ReadonlyArray<DatasetColumn | string>;
  if (cols.every((c) => typeof c === "object" && c !== null)) return payload;
  const columns = cols.map((c) => (typeof c === "string" ? inferredColumn(c, payload.rows) : c));
  return { ...payload, columns };
}

/** Read the dataset payload off a Unit, or undefined if the Unit isn't a
 *  dataset / carries no payload. Runs the DR-036 column-type migration so every
 *  reader (resolver, picker, grid) sees typed columns regardless of when the
 *  payload was persisted. */
export function readDatasetPayload(unit: AgocraftUnit): DatasetPayload | undefined {
  if (unit.kind !== DATASET_UNIT_KIND) return undefined;
  const carried = unit.attrs.dataset as DatasetPayload | undefined;
  return carried === undefined ? undefined : migrateDatasetColumns(carried);
}

/** Locate a dataset Unit on the document root by id, with its index in
 *  `root.units` (needed for the `unit.remove` patch position). Undefined when
 *  no dataset with that id exists. */
export function findDatasetUnit(
  doc: AgocraftDocument,
  id: string,
): { readonly unit: AgocraftUnit; readonly index: number } | undefined {
  const units = doc.root.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u !== undefined && u.kind === DATASET_UNIT_KIND && String(u.id) === id) {
      return { unit: u, index: i };
    }
  }
  return undefined;
}

/** Resolve a dataset payload by id — the single lookup chart renderers use.
 *  Returns undefined for a dangling/empty id; the chart layer renders a
 *  "데이터 없음" placeholder rather than crashing (DR-031 — graceful refs). */
export function resolveDataset(doc: AgocraftDocument, id: string): DatasetPayload | undefined {
  if (id === "") return undefined;
  const found = findDatasetUnit(doc, id);
  return found === undefined ? undefined : readDatasetPayload(found.unit);
}

/** List every dataset in the document (for the dataset picker / panel). */
export function listDatasets(doc: AgocraftDocument): ReadonlyArray<ResolvedDataset> {
  const out: ResolvedDataset[] = [];
  for (const u of doc.root.units) {
    const payload = readDatasetPayload(u);
    if (payload !== undefined) out.push({ id: String(u.id), payload });
  }
  return out;
}
