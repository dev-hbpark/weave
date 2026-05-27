// WI-020 Phase 1 — SegmentedControl primitive (DR-design-009).
//
// Single-select enum group as a row of segmented buttons. Radix ToggleGroup
// in single mode with custom styling. Common for image fit ("Cover/Contain/
// Fill/None"), triangle variant, heart variant, etc.

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

export interface SegmentedControlOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface SegmentedControlProps<V extends string> {
  readonly value: V;
  readonly onValueChange: (next: V) => void;
  readonly options: ReadonlyArray<SegmentedControlOption<V>>;
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

function _SegmentedControl<V extends string>(
  {
    value,
    onValueChange,
    options,
    "aria-label": ariaLabel,
    disabled,
    className,
  }: SegmentedControlProps<V>,
  ref: React.Ref<HTMLDivElement>,
): JSX.Element {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v !== "" && v !== undefined) onValueChange(v as V);
      }}
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      {...(disabled !== undefined ? { disabled } : {})}
      className={cn(
        "inline-flex items-stretch gap-0",
        "rounded-[6px] p-0.5",
        "bg-[color:var(--surface-overlay-2)]",
        "border border-[color:var(--surface-overlay-border)]",
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          aria-label={o.label}
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium",
            "rounded-[4px] inline-flex items-center gap-1.5",
            "text-[color:var(--text-overlay-soft)]",
            "data-[state=on]:bg-[color:var(--accent-soft)]",
            "data-[state=on]:text-[color:var(--text-overlay)]",
            "hover:bg-[color:var(--surface-overlay-2)]",
            "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            "transition-[background,color] duration-[var(--motion-quick)]",
            "disabled:opacity-50 disabled:pointer-events-none",
          )}
        >
          {o.icon !== undefined ? <span aria-hidden>{o.icon}</span> : null}
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export const SegmentedControl = forwardRef(_SegmentedControl) as <V extends string>(
  props: SegmentedControlProps<V> & { ref?: React.Ref<HTMLDivElement> },
) => ReturnType<typeof _SegmentedControl>;
