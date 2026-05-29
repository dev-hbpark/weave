// WI-055 / DR-design-025 — CornerRadiusControl.
//
// Figma-style corner radius editor: a single uniform value (linked) with a
// link toggle that expands to four independent per-corner inputs (unlinked).
// Composed from existing primitives (NumberSlider + IconButton + native number
// inputs) + tokens only — no new token. Values are ABSOLUTE px (the agocraft
// rectangle `cornerRadii` model), not a 0..1 ratio.
//
// Pure presentation: the control knows nothing about shapes. The host reads the
// selected item's `cornerRadii`, passes them in, and commits `onChange` results
// through `editor.exec`.

import { forwardRef, useId, useState } from "react";
import { cn } from "../cn.js";
import { IconLink, IconLinkOff } from "./Icon.js";
import { IconButton } from "./IconButton.js";
import { NumberSlider } from "./NumberSlider.js";

export interface CornerRadiusValue {
  readonly tl: number;
  readonly tr: number;
  readonly br: number;
  readonly bl: number;
}

export interface CornerRadiusControlProps {
  /** Current four-corner value (absolute px). */
  readonly value: CornerRadiusValue;
  /** Commit a new four-corner value. Host routes this through `editor.exec`. */
  readonly onChange: (next: CornerRadiusValue) => void;
  /** Controlled link state. When omitted, the control manages its own and
   *  seeds the initial state from whether all four corners are equal. */
  readonly linked?: boolean;
  readonly onLinkedChange?: (linked: boolean) => void;
  /** Multi-select mixed values — the inputs show blank/placeholder. */
  readonly mixed?: boolean;
  readonly min?: number;
  /** Slider visual upper bound (typed values may exceed it; the renderer caps
   *  at min(w,h)/2 regardless). */
  readonly max?: number;
  readonly step?: number;
  readonly className?: string;
}

const CORNERS: ReadonlyArray<{ key: keyof CornerRadiusValue; label: string }> = [
  { key: "tl", label: "왼쪽 위 모서리" },
  { key: "tr", label: "오른쪽 위 모서리" },
  { key: "bl", label: "왼쪽 아래 모서리" },
  { key: "br", label: "오른쪽 아래 모서리" },
];

function allEqual(v: CornerRadiusValue): boolean {
  return v.tl === v.tr && v.tr === v.br && v.br === v.bl;
}

export const CornerRadiusControl = forwardRef<HTMLDivElement, CornerRadiusControlProps>(
  function CornerRadiusControl(
    {
      value,
      onChange,
      linked,
      onLinkedChange,
      mixed = false,
      min = 0,
      max = 200,
      step = 1,
      className,
    },
    ref,
  ) {
    const baseId = useId();
    const [internalLinked, setInternalLinked] = useState(() => allEqual(value));
    const isLinked = linked ?? internalLinked;

    const setLinked = (next: boolean) => {
      if (onLinkedChange) onLinkedChange(next);
      else setInternalLinked(next);
      // Re-linking flattens to the top-left value so the four stay coherent.
      if (next && !allEqual(value)) {
        onChange({ tl: value.tl, tr: value.tl, br: value.tl, bl: value.tl });
      }
    };

    const setUniform = (n: number) => {
      const r = Math.max(min, n);
      onChange({ tl: r, tr: r, br: r, bl: r });
    };

    const setCorner = (key: keyof CornerRadiusValue, n: number) => {
      onChange({ ...value, [key]: Math.max(min, n) });
    };

    return (
      <div ref={ref} className={cn("flex flex-col gap-1.5 w-full", className)}>
        <div className="flex items-center gap-1.5">
          {isLinked ? (
            <NumberSlider
              value={mixed ? min : value.tl}
              onValueChange={setUniform}
              min={min}
              max={max}
              step={step}
              aria-label="모서리 반경"
              className="flex-1"
            />
          ) : (
            <span className="flex-1 text-[10px] uppercase tracking-wide text-[color:var(--text-soft)]">
              코너별 반경
            </span>
          )}
          <IconButton
            variant={isLinked ? "subtle" : "ghost"}
            size="sm"
            aria-label={isLinked ? "모서리 개별 편집" : "모서리 함께 편집"}
            aria-pressed={isLinked}
            data-testid="corner-radius-link-toggle"
            onClick={() => setLinked(!isLinked)}
          >
            {isLinked ? <IconLink size={14} /> : <IconLinkOff size={14} />}
          </IconButton>
        </div>

        {!isLinked && (
          <div className="grid grid-cols-2 gap-1.5">
            {CORNERS.map(({ key, label }) => (
              <label key={key} className="grid gap-0.5">
                <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-soft)]">
                  {key}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={min}
                  step={step}
                  value={mixed ? "" : value[key]}
                  id={`${baseId}-${key}`}
                  aria-label={label}
                  data-testid={`corner-radius-${key}`}
                  onChange={(e) => {
                    const n = Number(e.currentTarget.value);
                    if (Number.isFinite(n)) setCorner(key, n);
                  }}
                  className={cn(
                    "px-2 py-1.5 rounded-[var(--radius-sm)] w-full",
                    "bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)]",
                    "text-[12px] text-[color:var(--text-strong)]",
                    "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  )}
                />
              </label>
            ))}
          </div>
        )}
      </div>
    );
  },
);
