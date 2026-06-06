// WI-077 — DatasetGrid: spreadsheet-like dataset editor (DR-034). Lazy module:
// the ONLY place react-data-grid is imported, reached via React.lazy from
// DatasetEditorDialog, so the grid + its CSS land in a separate chunk (loaded on
// demand) and never touch the main bundle — same code-split discipline as the
// echarts renderer.
//
// react-data-grid gives Excel-like editing for free: inline cell edit, keyboard
// nav (Tab/Enter/arrows), copy/paste of a cell, and the drag-fill handle
// (`onFill`). On top of it we wire the one thing it doesn't do: MULTI-cell paste
// from Excel/Sheets (a TSV block) → replace the whole table (header
// auto-detected). Header cells are editable (rename) with a remove-column
// button; a trailing column deletes the row. Every change dispatches
// `weave.dataset.update` → one undoable transaction.

import "react-data-grid/lib/styles.css";

import type { Editor } from "@agocraft/editor";
import { type JSX, useCallback, useRef } from "react";
import DataGrid, {
  type CellSelectArgs,
  type Column,
  type FillEvent,
  type RenderCellProps,
  type RenderHeaderCellProps,
  textEditor,
} from "react-data-grid";
import {
  clipboardTableToPayload,
  coerceCell,
  columnNames,
  columnType,
  type DatasetCell,
  type DatasetPayload,
  type FieldType,
  parseClipboardTable,
  pasteTableAt,
  removeColumn,
  removeRow,
  renameColumn,
  setColumnType,
} from "./dataset-store.js";

/** DR-036 — column data-type options shown in the grid header selector. */
const FIELD_TYPE_OPTIONS: ReadonlyArray<{ value: FieldType; label: string }> = [
  { value: "nominal", label: "범주" },
  { value: "ordinal", label: "순서" },
  { value: "quantitative", label: "수치" },
  { value: "temporal", label: "시간" },
];

/** Render a (possibly boolean/null/absent) dataset cell as a grid-editable scalar. */
function gridValue(v: DatasetCell | undefined): string | number {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

export interface DatasetGridProps {
  readonly editor: Editor;
  readonly datasetId: string;
  readonly payload: DatasetPayload;
}

type GridRow = { readonly _k: number } & Record<string, string | number>;

const ACTIONS_KEY = "__actions";

/** Map weave token CSS vars onto react-data-grid's `--rdg-*` theming hooks so
 *  the grid matches the surrounding panel. */
const GRID_THEME: React.CSSProperties = {
  ["--rdg-color" as string]: "var(--text-strong)",
  ["--rdg-background-color" as string]: "var(--surface-2)",
  ["--rdg-header-background-color" as string]: "var(--surface-1)",
  ["--rdg-row-hover-background-color" as string]: "var(--surface-2)",
  ["--rdg-border-color" as string]: "var(--surface-2-border)",
  ["--rdg-selection-color" as string]: "var(--accent)",
  ["--rdg-font-size" as string]: "13px",
  blockSize: "100%",
};

export default function DatasetGrid({ editor, datasetId, payload }: DatasetGridProps): JSX.Element {
  const update = useCallback(
    (patch: (p: DatasetPayload) => DatasetPayload) =>
      editor.exec("weave.dataset.update", { id: datasetId, patch }),
    [editor, datasetId],
  );
  const replaceWith = useCallback(
    (next: DatasetPayload) => editor.exec("weave.dataset.update", { id: datasetId, dataset: next }),
    [editor, datasetId],
  );

  // Grid rows mirror the payload (keyed by row index for stable identity).
  const gridRows: GridRow[] = payload.rows.map((r, i) => {
    const row: Record<string, string | number> = { _k: i };
    for (const c of payload.columns) row[c.name] = gridValue(r[c.name]);
    return row as GridRow;
  });

  // Map the grid's mutated rows back to a DatasetPayload (cells re-coerced so a
  // typed-in number plots as a number) and commit.
  const commitRows = useCallback(
    (rows: ReadonlyArray<GridRow>): void => {
      const nextRows = rows.map((r) => {
        const obj: Record<string, DatasetCell> = {};
        for (const c of payload.columns) obj[c.name] = coerceCell(String(r[c.name] ?? ""));
        return obj;
      });
      replaceWith({ ...payload, rows: nextRows });
    },
    [payload, replaceWith],
  );

  // Track the selected cell so paste can anchor there (Excel-style). null until
  // the user picks a cell — until then a block paste imports the whole table.
  const anchorRef = useRef<{ rowIdx: number; colKey: string } | null>(null);
  const onSelectedCellChange = useCallback((args: CellSelectArgs<GridRow>): void => {
    anchorRef.current = { rowIdx: args.rowIdx, colKey: args.column.key };
  }, []);

  // Drag-fill: copy the source cell's value down the dragged range.
  const onFill = useCallback(
    ({ columnKey, sourceRow, targetRow }: FillEvent<GridRow>): GridRow => ({
      ...targetRow,
      [columnKey]: sourceRow[columnKey] ?? "",
    }),
    [],
  );

  // Multi-cell paste (Excel/Sheets block). With a selected cell → ANCHOR paste:
  // write the block from that cell, overwriting + auto-expanding, preserving the
  // rest. With no selection → import the whole table (header auto-detected).
  // Single-cell paste falls through to react-data-grid's own cell paste.
  const onPaste = useCallback(
    (e: React.ClipboardEvent): void => {
      const text = e.clipboardData.getData("text/plain");
      const table = parseClipboardTable(text);
      const multiCell = table.length > 1 || table.some((r) => r.length > 1);
      if (!multiCell) return;
      e.preventDefault();
      e.stopPropagation();
      const anchor = anchorRef.current;
      if (anchor !== null && anchor.colKey !== ACTIONS_KEY && anchor.rowIdx >= 0) {
        const aCol = columnNames(payload).indexOf(anchor.colKey);
        replaceWith(pasteTableAt(payload, table, anchor.rowIdx, aCol >= 0 ? aCol : 0));
      } else {
        replaceWith(clipboardTableToPayload(table, { name: payload.name }));
      }
    },
    [payload, replaceWith],
  );

  const HeaderCell = ({ column }: RenderHeaderCellProps<GridRow>): JSX.Element => (
    <div className="flex items-center gap-1 w-full">
      <input
        defaultValue={column.name as string}
        aria-label={`열 이름: ${column.name}`}
        data-testid="dataset-col-name"
        onClick={(ev) => ev.stopPropagation()}
        onKeyDown={(ev) => ev.stopPropagation()}
        onBlur={(ev) => update((p) => renameColumn(p, column.key, ev.currentTarget.value))}
        className="h-6 px-1 w-full bg-transparent border-0 text-[color:var(--text-strong)] font-medium focus-visible:outline-none focus-visible:bg-[color:var(--surface-2)] rounded"
      />
      {/* DR-036 — per-column data-type selector (drives chart channel filtering). */}
      <select
        value={columnType(payload, column.key)}
        aria-label={`열 타입: ${column.name}`}
        data-testid="dataset-col-type"
        onClick={(ev) => ev.stopPropagation()}
        onChange={(ev) => update((p) => setColumnType(p, column.key, ev.target.value as FieldType))}
        className="shrink-0 h-6 text-[10px] bg-transparent border-0 text-[color:var(--text-soft)] focus-visible:outline-none rounded"
      >
        {FIELD_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`열 삭제: ${column.name}`}
        data-testid="dataset-col-remove"
        onClick={(ev) => {
          ev.stopPropagation();
          update((p) => removeColumn(p, column.key));
        }}
        className="shrink-0 text-[color:var(--text-soft)] hover:text-[color:var(--accent)] px-1"
      >
        ×
      </button>
    </div>
  );

  const DeleteRowCell = ({ row }: RenderCellProps<GridRow>): JSX.Element => (
    <button
      type="button"
      aria-label={`행 삭제: ${row._k + 1}`}
      data-testid="dataset-row-remove"
      onClick={() => update((p) => removeRow(p, row._k))}
      className="w-full text-[color:var(--text-soft)] hover:text-[color:var(--accent)]"
    >
      ×
    </button>
  );

  const columns: ReadonlyArray<Column<GridRow>> = [
    ...payload.columns.map(
      (col): Column<GridRow> => ({
        key: col.name,
        name: col.name,
        editable: true,
        resizable: true,
        renderEditCell: textEditor,
        renderHeaderCell: HeaderCell,
      }),
    ),
    {
      key: ACTIONS_KEY,
      name: "",
      width: 40,
      minWidth: 40,
      resizable: false,
      renderCell: DeleteRowCell,
    },
  ];

  return (
    // onPasteCapture so we see the Excel block before the grid's own cell paste.
    <div
      data-testid="dataset-grid"
      onPasteCapture={onPaste}
      className="h-[320px] rounded-[var(--radius-md)] overflow-hidden border border-[color:var(--surface-2-border)]"
    >
      <DataGrid
        columns={columns}
        rows={gridRows}
        rowKeyGetter={(r: GridRow) => r._k}
        onRowsChange={commitRows}
        onFill={onFill}
        onSelectedCellChange={onSelectedCellChange}
        style={GRID_THEME}
        className="rdg-light"
      />
    </div>
  );
}
