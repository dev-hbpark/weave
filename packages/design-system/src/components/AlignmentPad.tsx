// DR-design-021 follow-up — AlignmentPad (3×3).
//
// Combines a horizontal + vertical alignment choice into one 2D control (the
// Figma auto-layout alignment pattern), replacing two stacked single-axis
// pickers. Nine cells map to {start,center,end} × {start,center,end}; the
// selected cell shows a filled marker. Axes whose value falls outside the
// triple (e.g. "stretch", "justify", "space-between") render with no cell
// highlighted — the host pairs the pad with a small supplementary control
// for those modes.
//
// Tree-shake: ESM, sideEffects:false, no decorators, named export.

import { cn } from "../cn.js";

export interface AlignmentPadProps<H extends string, V extends string> {
  /** Current horizontal value. When not one of `hValues`, no column is
   *  highlighted (a supplementary control owns that mode). */
  readonly horizontal: H | (string & {});
  readonly vertical: V | (string & {});
  /** Horizontal axis values, left → right. */
  readonly hValues: readonly [H, H, H];
  /** Vertical axis values, top → bottom. */
  readonly vValues: readonly [V, V, V];
  readonly onChange: (horizontal: H, vertical: V) => void;
  readonly "aria-label"?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

const ROW_LABEL = ["위", "가운데", "아래"] as const;
const COL_LABEL = ["왼쪽", "가운데", "오른쪽"] as const;

function AlignmentPadInner<H extends string, V extends string>({
  horizontal,
  vertical,
  hValues,
  vValues,
  onChange,
  "aria-label": ariaLabel = "정렬",
  className,
  "data-testid": testid = "alignment-pad",
}: AlignmentPadProps<H, V>): JSX.Element {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled cluster of related buttons — role="group" matches the rest of the toolbar (ToolbarField); <fieldset> would impose form-control styling/semantics.
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testid}
      className={cn(
        "inline-grid grid-cols-3 gap-px p-1 w-fit",
        "rounded-[var(--radius-sm)] bg-[color:var(--surface-overlay-2)]",
        "border border-[color:var(--surface-overlay-border)]",
        className,
      )}
    >
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => {
          const h = hValues[c] as H;
          const v = vValues[r] as V;
          const on = h === horizontal && v === vertical;
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              aria-pressed={on}
              aria-label={`${COL_LABEL[c]} ${ROW_LABEL[r]}`}
              data-testid={`${testid}-cell-${c}-${r}`}
              onClick={() => onChange(h, v)}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-[3px]",
                "hover:bg-[color:var(--surface-overlay)]",
                "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                on && "bg-[color:var(--accent-soft)]",
              )}
            >
              <span
                className={cn(
                  "rounded-full transition-all duration-[var(--motion-quick)]",
                  on
                    ? "h-2 w-2 bg-[color:var(--accent-strong)]"
                    : "h-1 w-1 bg-[color:var(--text-overlay-muted)]",
                )}
              />
            </button>
          );
        }),
      )}
    </div>
  );
}

export const AlignmentPad = AlignmentPadInner as <H extends string, V extends string>(
  props: AlignmentPadProps<H, V>,
) => JSX.Element;
