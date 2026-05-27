// WI-020 Phase 1 — DashPatternPicker primitive (DR-design-009).
//
// Predefined stroke dash patterns shown as visual rows. Picker between
// solid / dashed / dotted / dash-dot.

import { forwardRef } from "react";
import { cn } from "../cn.js";

export type DashPattern = "solid" | "dashed" | "dotted" | "dash-dot" | "long-dash";

export interface DashPatternPickerProps {
  readonly value: DashPattern;
  readonly onValueChange: (next: DashPattern) => void;
  readonly "aria-label"?: string;
  readonly className?: string;
}

/** Resolve a DashPattern enum to an SVG dasharray. Hosts can also use this
 *  to compose StrokeSpec.dashArray. */
export function dashPatternToArray(p: DashPattern): ReadonlyArray<number> {
  switch (p) {
    case "solid":
      return [];
    case "dashed":
      return [6, 4];
    case "dotted":
      return [1, 3];
    case "dash-dot":
      return [6, 3, 1, 3];
    case "long-dash":
      return [12, 6];
  }
}

const ALL_PATTERNS: ReadonlyArray<{ readonly value: DashPattern; readonly label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "dash-dot", label: "Dash-dot" },
  { value: "long-dash", label: "Long dash" },
];

export const DashPatternPicker = forwardRef<HTMLDivElement, DashPatternPickerProps>(
  function DashPatternPicker({ value, onValueChange, "aria-label": ariaLabel, className }, ref) {
    return (
      <div
        ref={ref}
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center gap-0.5 p-0.5",
          "rounded-[6px]",
          "bg-[color:var(--surface-overlay-2)]",
          "border border-[color:var(--surface-overlay-border)]",
          className,
        )}
      >
        {ALL_PATTERNS.map((p) => {
          const pressed = p.value === value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={pressed}
              aria-label={p.label}
              title={p.label}
              onClick={() => onValueChange(p.value)}
              className={cn(
                "h-7 w-9 inline-flex items-center justify-center",
                "rounded-[4px]",
                pressed
                  ? "bg-[color:var(--accent-soft)]"
                  : "hover:bg-[color:var(--surface-overlay-2)]",
                "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                "transition-[background] duration-[var(--motion-quick)]",
              )}
            >
              <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden>
                <line
                  x1={1}
                  y1={3}
                  x2={21}
                  y2={3}
                  stroke={pressed ? "var(--accent)" : "var(--text-overlay-soft)"}
                  strokeWidth={1.75}
                  strokeDasharray={dashPatternToArray(p.value).join(" ") || undefined}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          );
        })}
      </div>
    );
  },
);
