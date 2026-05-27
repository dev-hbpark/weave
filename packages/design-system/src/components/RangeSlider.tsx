// WI-020 Phase 1 — RangeSlider primitive (DR-design-009).
//
// Dual-thumb slider for ranges (e.g., video trim start/end). Uses Radix
// Slider in two-thumb mode. Hosts read [start, end] and emit independent
// commits if needed.

import * as SliderPrimitive from "@radix-ui/react-slider";
import { forwardRef } from "react";
import { cn } from "../cn.js";

export interface RangeSliderProps {
  readonly value: readonly [number, number];
  readonly onValueChange: (next: readonly [number, number]) => void;
  readonly onValueCommit?: (next: readonly [number, number]) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
  readonly className?: string;
}

export const RangeSlider = forwardRef<HTMLDivElement, RangeSliderProps>(function RangeSlider(
  {
    value,
    onValueChange,
    onValueCommit,
    min = 0,
    max = 100,
    step = 1,
    disabled,
    "aria-label": ariaLabel,
    className,
  },
  ref,
) {
  function handleChange(values: number[]): void {
    const a = values[0];
    const b = values[1];
    if (a === undefined || b === undefined) return;
    onValueChange([a, b]);
  }
  function handleCommit(values: number[]): void {
    const a = values[0];
    const b = values[1];
    if (a === undefined || b === undefined) return;
    onValueCommit?.([a, b]);
  }
  return (
    <SliderPrimitive.Root
      ref={ref}
      value={[value[0], value[1]]}
      onValueChange={handleChange}
      onValueCommit={handleCommit}
      min={min}
      max={max}
      step={step}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      minStepsBetweenThumbs={1}
      className={cn(
        "relative flex items-center select-none touch-none h-5 min-w-[140px]",
        className,
      )}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative grow h-1 rounded-full overflow-hidden",
          "bg-[color:var(--surface-overlay-2)]",
        )}
      >
        <SliderPrimitive.Range className={cn("absolute h-full bg-[color:var(--accent)]")} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={`${ariaLabel ?? "range"} start`}
        className={cn(
          "block h-3.5 w-3.5 rounded-full",
          "bg-[color:var(--text-overlay)]",
          "shadow-[0_1px_4px_rgba(0,0,0,0.45)]",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
        )}
      />
      <SliderPrimitive.Thumb
        aria-label={`${ariaLabel ?? "range"} end`}
        className={cn(
          "block h-3.5 w-3.5 rounded-full",
          "bg-[color:var(--text-overlay)]",
          "shadow-[0_1px_4px_rgba(0,0,0,0.45)]",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
        )}
      />
    </SliderPrimitive.Root>
  );
});
