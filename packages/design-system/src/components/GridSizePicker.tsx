// DR-design-021 — GridSizePicker (drag/hover matrix).
//
// Sets a grid's column × row COUNT by hovering/clicking across a small cell
// matrix — the Word / Google Docs / Notion / Figma table-size picker. This
// replaces "+ Add" buttons for the common "make it N×M" case; per-track fine
// sizing (fr / ratio / auto) lives separately (TrackSizeEditor in an
// advanced accordion).
//
// Interaction: hovering a cell previews the 1..r × 1..c selection; clicking
// commits. Keyboard: arrow keys move the active cell, Enter commits. Compact
// +/- steppers allow exceeding the matrix max for precision. The component is
// count-based; the caller reconciles counts into its track arrays (preserve
// existing sizes, append a default, or truncate).
//
// Tree-shake: ESM, sideEffects:false, no decorators, named export.

import { type KeyboardEvent, useState } from "react";
import { cn } from "../cn.js";

export interface GridSizePickerProps {
  readonly columns: number;
  readonly rows: number;
  readonly onChange: (columns: number, rows: number) => void;
  readonly minColumns?: number;
  readonly minRows?: number;
  /** Matrix extent. Counts beyond this are still reachable via the steppers
   *  but the matrix caps its visual grid here. Default 8×8. */
  readonly maxColumns?: number;
  readonly maxRows?: number;
  readonly "aria-label"?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function GridSizePicker({
  columns,
  rows,
  onChange,
  minColumns = 1,
  minRows = 1,
  maxColumns = 8,
  maxRows = 8,
  "aria-label": ariaLabel = "그리드 크기",
  className,
  "data-testid": testid = "grid-size-picker",
}: GridSizePickerProps): JSX.Element {
  // 1-based hover target; null when the pointer is outside the matrix (then
  // the current columns/rows drive the highlight).
  const [hover, setHover] = useState<{ c: number; r: number } | null>(null);

  const gridCols = Math.max(maxColumns, Math.min(columns, maxColumns));
  const gridRows = Math.max(maxRows, Math.min(rows, maxRows));
  const activeC = hover?.c ?? clamp(columns, minColumns, gridCols);
  const activeR = hover?.r ?? clamp(rows, minRows, gridRows);

  const commit = (c: number, r: number) => {
    onChange(clamp(c, minColumns, gridCols), clamp(r, minRows, gridRows));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const c = activeC;
    const r = activeR;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHover({ c: clamp(c + 1, minColumns, gridCols), r });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHover({ c: clamp(c - 1, minColumns, gridCols), r });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHover({ c, r: clamp(r + 1, minRows, gridRows) });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHover({ c, r: clamp(r - 1, minRows, gridRows) });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(c, r);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid={testid}>
      {/* biome-ignore lint/a11y/useSemanticElements: composite 2D grid picker — a single focusable widget with arrow-key navigation, not a list of native controls. */}
      <div
        role="grid"
        tabIndex={0}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHover(null)}
        className="inline-grid gap-0.5 w-fit p-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-overlay-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        style={{ gridTemplateColumns: `repeat(${gridCols}, 14px)` }}
      >
        {Array.from({ length: gridRows }).map((_, rIdx) =>
          Array.from({ length: gridCols }).map((__, cIdx) => {
            const c = cIdx + 1;
            const r = rIdx + 1;
            const on = c <= activeC && r <= activeR;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                tabIndex={-1}
                aria-label={`${c} × ${r}`}
                data-testid={`${testid}-cell-${c}-${r}`}
                onPointerEnter={() => setHover({ c, r })}
                onFocus={() => setHover({ c, r })}
                onClick={() => commit(c, r)}
                className={cn(
                  "w-[14px] h-[14px] rounded-[2px] border",
                  on
                    ? "bg-[color:var(--accent-soft)] border-[color:var(--accent-strong)]"
                    : "bg-[color:var(--surface-overlay)] border-[color:var(--surface-overlay-border)]",
                )}
              />
            );
          }),
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[11px] tabular-nums text-[color:var(--text-overlay-soft)]"
          data-testid={`${testid}-readout`}
        >
          {activeC} × {activeR}
        </span>
        <div className="flex items-center gap-1">
          <Stepper
            label="열"
            value={columns}
            min={minColumns}
            onChange={(v) => commit(v, rows)}
            testid={`${testid}-cols`}
          />
          <Stepper
            label="행"
            value={rows}
            min={minRows}
            onChange={(v) => commit(columns, v)}
            testid={`${testid}-rows`}
          />
        </div>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  onChange,
  testid,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly onChange: (v: number) => void;
  readonly testid: string;
}): JSX.Element {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[6px] border border-[color:var(--surface-overlay-border)] px-1"
      data-testid={testid}
    >
      <span className="text-[10px] text-[color:var(--text-overlay-muted)]">{label}</span>
      <button
        type="button"
        aria-label={`${label} 감소`}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-4 h-5 text-[12px] leading-none text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]"
      >
        −
      </button>
      <span className="w-3 text-center text-[11px] tabular-nums text-[color:var(--text-overlay)]">
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label} 증가`}
        onClick={() => onChange(value + 1)}
        className="w-4 h-5 text-[12px] leading-none text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]"
      >
        +
      </button>
    </div>
  );
}
