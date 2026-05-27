// WI-019 Phase 1 — Badge primitive (DR-design-008).
//
// Inline `<span>` label with variant × size matrix. Pure visual — no a11y
// machinery beyond the semantic span. Use for: z-rank chip, "RELATED" tag,
// status indicator, role label, etc.

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn.js";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "info";
type BadgeSize = "xs" | "sm";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children?: ReactNode;
}

const variantClass: Record<BadgeVariant, string> = {
  default:
    "bg-[color:var(--surface-2)] text-[color:var(--text-soft)] border-[color:var(--border-default)]",
  accent:
    "bg-[color:var(--accent-soft)] text-[color:var(--accent)] border-[color:var(--accent-soft)]",
  success: "bg-[rgba(34,197,94,0.16)] text-[rgb(74,222,128)] border-[rgba(34,197,94,0.3)]",
  warning: "bg-[rgba(234,179,8,0.16)] text-[rgb(250,204,21)] border-[rgba(234,179,8,0.3)]",
  info: "bg-[rgba(59,130,246,0.16)] text-[rgb(96,165,250)] border-[rgba(59,130,246,0.3)]",
};

const sizeClass: Record<BadgeSize, string> = {
  xs: "px-1.5 py-px text-[10px] leading-4 rounded-[var(--radius-xs)]",
  sm: "px-2 py-0.5 text-[11px] leading-4 rounded-[var(--radius-sm)]",
};

const baseClass = [
  "inline-flex items-center gap-1",
  "font-mono font-semibold",
  "border",
  "letter-spacing-[0.4px]",
].join(" ");

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "default", size = "xs", className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      {...rest}
      className={cn(baseClass, variantClass[variant], sizeClass[size], className)}
    >
      {children}
    </span>
  );
});

export type { BadgeSize, BadgeVariant };
