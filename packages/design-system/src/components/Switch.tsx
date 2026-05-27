// WI-019 Phase 1 — Switch primitive (DR-design-008).
//
// Thin wrapper over `@radix-ui/react-switch`. Radix handles a11y (role,
// aria-checked, keyboard space/enter) — we add the aurora-glass thumb / track.

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

type SwitchSize = "default" | "small";

export interface SwitchProps extends Omit<SwitchPrimitive.SwitchProps, "asChild" | "size"> {
  /** Inline label rendered next to the track. Optional — omit for label-less. */
  children?: ReactNode;
  size?: SwitchSize;
}

const sizeClass: Record<SwitchSize, { track: string; thumb: string; on: string }> = {
  default: {
    track: "h-[22px] w-[38px]",
    thumb: "h-[18px] w-[18px]",
    on: "data-[state=checked]:translate-x-4",
  },
  small: {
    track: "h-[16px] w-[28px]",
    thumb: "h-[12px] w-[12px]",
    on: "data-[state=checked]:translate-x-3",
  },
};

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { children, size = "default", className, id, ...rest },
  ref,
) {
  const sizes = sizeClass[size];

  const root = (
    <SwitchPrimitive.Root
      ref={ref}
      id={id}
      {...rest}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center",
        "rounded-[var(--radius-pill)] border",
        "border-[color:var(--surface-1-border)]",
        "bg-[color:var(--surface-2)]",
        "data-[state=checked]:bg-[color:var(--accent)]",
        "data-[state=checked]:border-[color:var(--accent)]",
        "transition-[background,border-color] duration-[var(--motion-quick)] ease-[var(--motion-ease)]",
        "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        sizes.track,
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block rounded-[var(--radius-pill)]",
          "bg-[color:var(--text-strong)]",
          "shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
          "translate-x-0.5",
          "transition-transform duration-[var(--motion-quick)] ease-[var(--motion-ease)]",
          sizes.thumb,
          sizes.on,
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (children === undefined) return root;

  return (
    <label
      htmlFor={id}
      className="inline-flex items-center gap-2 cursor-pointer text-[12px] text-[color:var(--text-default)] select-none"
    >
      {root}
      <span>{children}</span>
    </label>
  );
});
