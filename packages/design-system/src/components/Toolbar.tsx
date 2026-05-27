import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.js";

/** Horizontal control group — hosts buttons / dividers. Subtle aurora-glass
 *  surface with rounded ends. Used at the top of the doc editor and as the
 *  selection toolbar overlay. */
export function Toolbar({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { readonly children?: ReactNode }) {
  return (
    <div
      role="toolbar"
      className={cn(
        "inline-flex items-center gap-1 p-1",
        "rounded-[var(--radius-md)] bg-[color:var(--surface-1)]",
        "border border-[color:var(--surface-1-border)]",
        "backdrop-blur-[var(--surface-blur)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ToolbarDivider({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block w-px self-stretch bg-[color:var(--surface-1-border)] mx-0.5",
        className,
      )}
    />
  );
}
