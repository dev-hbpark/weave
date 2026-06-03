// WI-078 (DR-035) — editor for a clicked chart mark (bar / slice). Two kinds of
// edit, kept on the right side of the data/presentation boundary:
//   • VALUE (the mark's data) → the dataset (`weave.dataset.update` → setCell).
//   • PRESENTATION (color / thickness / pie pull-out) → a per-category override
//     on the chart item (`weave.item.update`).

import type { Editor } from "@agocraft/editor";
import { ColorPicker, IconClose } from "@weave/design-system";
import type { JSX } from "react";
import { type DatasetPayload, removeRow, setCell } from "../../dataset/dataset-store.js";
import type { ChartElementRef } from "../../domains/chart/chart-element-context.js";
import {
  type ChartDatumPatch,
  datumOverride,
  datumOverrideKey,
  seriesOverride,
  setDatumOverride,
  setSeriesOverride,
} from "../../domains/chart/chart-overrides.js";
import type { ChartAttrs } from "../../types.js";

interface ChartElementEditorProps {
  readonly editor: Editor;
  readonly chartId: string;
  readonly overrides: ChartAttrs["overrides"];
  readonly isPie: boolean;
  readonly selected: ChartElementRef;
  /** Dataset + value column the mark belongs to (for value editing). */
  readonly datasetId: string;
  readonly valueColumn: string;
  /** WI-088 — chart has >1 series → datum overrides key by (series, category). */
  readonly isMultiSeries: boolean;
  readonly onDeselect: () => void;
}

export function ChartElementEditor({
  editor,
  chartId,
  overrides,
  isPie,
  selected,
  datasetId,
  valueColumn,
  isMultiSeries,
  onDeselect,
}: ChartElementEditorProps): JSX.Element {
  // DR-037 — series role edits the WHOLE series (overrides.series), datum role
  // edits one mark (overrides.datum). Value editing + row delete are datum-only.
  const isSeries = selected.role === "series";
  // WI-088 — in a multi-series chart, the datum override is keyed by
  // (series, category) so the SAME category differs across series; single-series
  // keeps the bare category (backward compat).
  const category = selected.category ?? "";
  const datumKey =
    isMultiSeries && selected.seriesName !== undefined
      ? datumOverrideKey(selected.seriesName, category)
      : category;
  const cur = isSeries
    ? seriesOverride(overrides, selected.seriesName ?? "")
    : datumOverride(overrides, datumKey);
  const rowIndex = selected.rowIndex ?? -1;
  const canEditValue = !isSeries && datasetId !== "" && valueColumn !== "" && rowIndex >= 0;
  const label = isSeries ? `시리즈: ${selected.seriesName ?? ""}` : category || "요소";

  const apply = (patch: ChartDatumPatch): void => {
    const next = isSeries
      ? setSeriesOverride(overrides, selected.seriesName ?? "", patch)
      : setDatumOverride(overrides, datumKey, patch);
    editor.exec("weave.item.update", { itemId: chartId, attrs: { overrides: next } });
  };

  const commitValue = (raw: string): void => {
    if (!canEditValue || Number(raw) === selected.value) return;
    editor.exec("weave.dataset.update", {
      id: datasetId,
      patch: (p: DatasetPayload) => setCell(p, rowIndex, valueColumn, raw),
    });
  };

  // Deleting a mark = deleting its dataset ROW (the mark IS one row's data).
  const deleteRow = (): void => {
    if (datasetId === "" || rowIndex < 0) return;
    editor.exec("weave.dataset.update", {
      id: datasetId,
      patch: (p: DatasetPayload) => removeRow(p, rowIndex),
    });
    onDeselect();
  };

  return (
    <div
      className="flex items-center gap-2 pl-2 ml-1 border-l border-[color:var(--surface-2-border)]"
      data-testid="chart-element-editor"
    >
      <span className="text-[11px] text-[color:var(--text-soft)] max-w-[110px] truncate">
        {label}
      </span>
      <div className="flex items-center gap-2">
        {canEditValue ? (
          <label className="flex items-center gap-1 text-[11px] text-[color:var(--text-soft)]">
            값
            <input
              type="number"
              key={`val:${rowIndex}:${selected.value ?? ""}`}
              defaultValue={selected.value ?? 0}
              aria-label="요소 값"
              data-testid="chart-element-value"
              onBlur={(e) => commitValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="h-7 w-[64px] px-2 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[13px] text-[color:var(--text-strong)] focus-visible:outline-none focus-visible:border-[color:var(--accent)]"
            />
          </label>
        ) : null}
        <ColorPicker
          aria-label="요소 색"
          value={cur.color ?? "#64748b"}
          onValueCommit={(v) => apply({ color: v })}
          onValueChange={() => {
            /* commit-only */
          }}
        />
        <label className="flex items-center gap-1 text-[11px] text-[color:var(--text-soft)]">
          두께
          <input
            type="range"
            min={0}
            max={8}
            step={1}
            value={cur.borderWidth ?? 0}
            aria-label="요소 두께"
            data-testid="chart-element-thickness"
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              apply({ borderWidth: n === 0 ? undefined : n });
            }}
          />
        </label>
        {isPie && !isSeries ? (
          <label className="flex items-center gap-1 text-[11px] text-[color:var(--text-soft)]">
            거리
            <input
              type="range"
              min={0}
              max={30}
              step={2}
              value={cur.offset ?? 0}
              aria-label="조각 거리"
              data-testid="chart-element-offset"
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                apply({ offset: n === 0 ? undefined : n });
              }}
            />
          </label>
        ) : null}
        {rowIndex >= 0 && datasetId !== "" ? (
          <button
            type="button"
            aria-label="행 삭제"
            data-testid="chart-element-delete-row"
            onClick={deleteRow}
            className="h-6 px-2 rounded text-[11px] text-[color:var(--text-soft)] hover:text-[color:var(--accent)] hover:bg-[color:var(--surface-2)]"
          >
            행 삭제
          </button>
        ) : null}
        <button
          type="button"
          aria-label="선택 해제"
          data-testid="chart-element-deselect"
          onClick={onDeselect}
          className="grid place-items-center w-6 h-6 rounded text-[color:var(--text-soft)] hover:text-[color:var(--accent)] hover:bg-[color:var(--surface-2)]"
        >
          <IconClose size={13} />
        </button>
      </div>
    </div>
  );
}
