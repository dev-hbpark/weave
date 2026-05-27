// WI-020 Phase 1 — NumberSlider primitive (DR-design-009).
//
// Compound: Radix Slider (drag) + numeric input (typed value). The slider
// emits transient onValueChange during drag; onValueCommit fires once on
// pointer-up (or input blur / Enter). Hosts pair these so 60Hz dragging
// produces a single undo step.

import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  type ChangeEvent,
  type FocusEvent,
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useState,
} from "react";
import { cn } from "../cn.js";

export interface NumberSliderProps {
  readonly value: number;
  readonly onValueChange: (next: number) => void;
  /** Optional — invoked once when the user finishes a drag / commits via
   *  input. When omitted, `onValueChange` is the only sink. */
  readonly onValueCommit?: (next: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Display-only label for the inline number (e.g., "%"). */
  readonly suffix?: string;
  /** Optional custom formatter for the inline number. Default: round to
   *  step precision and append suffix. */
  readonly format?: (v: number) => string;
  /** Optional custom parser when the user types a value. Default: parseFloat. */
  readonly parse?: (text: string) => number;
  readonly id?: string;
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

function defaultFormat(value: number, step: number, suffix?: string): string {
  // step→decimal digits
  const digits = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return `${value.toFixed(digits)}${suffix ?? ""}`;
}

export const NumberSlider = forwardRef<HTMLDivElement, NumberSliderProps>(function NumberSlider(
  {
    value,
    onValueChange,
    onValueCommit,
    min = 0,
    max = 1,
    step = 0.01,
    suffix,
    format,
    parse = (t) => Number.parseFloat(t),
    id,
    "aria-label": ariaLabel,
    disabled,
    className,
  },
  ref,
) {
  const fmt = format ?? ((v: number) => defaultFormat(v, step, suffix));
  const [text, setText] = useState<string>(() => fmt(value));
  const [isFocused, setIsFocused] = useState(false);

  // Sync text when external value changes (unless user is typing).
  useEffect(() => {
    if (!isFocused) setText(fmt(value));
  }, [value, isFocused, fmt]);

  function handleSliderChange(values: number[]): void {
    const next = values[0];
    if (next === undefined) return;
    onValueChange(next);
  }
  function handleSliderCommit(values: number[]): void {
    const next = values[0];
    if (next === undefined) return;
    onValueCommit?.(next);
  }
  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    setText(e.target.value);
  }
  function flushInput(): void {
    const parsed = parse(text);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onValueChange(clamped);
      onValueCommit?.(clamped);
      setText(fmt(clamped));
    } else {
      setText(fmt(value));
    }
  }
  function handleInputBlur(_e: FocusEvent<HTMLInputElement>): void {
    setIsFocused(false);
    flushInput();
  }
  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      flushInput();
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setText(fmt(value));
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  return (
    <div
      ref={ref}
      className={cn("inline-flex items-center gap-2 min-w-[100px] max-w-[180px]", className)}
    >
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={handleSliderChange}
        onValueCommit={handleSliderCommit}
        min={min}
        max={max}
        step={step}
        {...(disabled !== undefined ? { disabled } : {})}
        {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
        className={cn("relative flex flex-1 items-center select-none touch-none h-5")}
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
          className={cn(
            "block h-3.5 w-3.5 rounded-full",
            "bg-[color:var(--text-overlay)]",
            "shadow-[0_1px_4px_rgba(0,0,0,0.45)]",
            "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            "transition-transform hover:scale-110",
          )}
          aria-label={ariaLabel ?? "value"}
        />
      </SliderPrimitive.Root>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleInputKeyDown}
        disabled={disabled}
        aria-label={`${ariaLabel ?? "value"} input`}
        className={cn(
          "w-12 px-1.5 py-0.5 text-[11px] font-mono text-right",
          "bg-[color:var(--surface-overlay-2)]",
          "border border-[color:var(--surface-overlay-border)]",
          "rounded-[4px] text-[color:var(--text-overlay)]",
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
          "disabled:opacity-50",
        )}
      />
    </div>
  );
});
