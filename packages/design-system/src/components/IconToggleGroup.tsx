// WI-020 Phase 1 — IconToggleGroup primitive (DR-design-009).
//
// Icon-only single-select group — narrower than SegmentedControl, designed
// for visual options where icon == meaning (e.g., text alignment, arrow
// head style).

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

export interface IconToggleOption<V extends string> {
  readonly value: V;
  readonly icon: ReactNode;
  readonly label: string; // for aria-label / tooltip
}

export interface IconToggleGroupProps<V extends string> {
  readonly value: V;
  readonly onValueChange: (next: V) => void;
  readonly options: ReadonlyArray<IconToggleOption<V>>;
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

function _IconToggleGroup<V extends string>(
  {
    value,
    onValueChange,
    options,
    "aria-label": ariaLabel,
    disabled,
    className,
  }: IconToggleGroupProps<V>,
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
        "inline-flex items-center gap-0.5",
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
          title={o.label}
          className={cn(
            "h-7 w-7 inline-flex items-center justify-center",
            "rounded-[4px]",
            "text-[color:var(--text-overlay-soft)]",
            "data-[state=on]:bg-[color:var(--accent-soft)]",
            "data-[state=on]:text-[color:var(--text-overlay)]",
            "hover:bg-[color:var(--surface-overlay-2)]",
            "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            "transition-[background,color] duration-[var(--motion-quick)]",
          )}
        >
          {o.icon}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export const IconToggleGroup = forwardRef(_IconToggleGroup) as <V extends string>(
  props: IconToggleGroupProps<V> & { ref?: React.Ref<HTMLDivElement> },
) => ReturnType<typeof _IconToggleGroup>;
