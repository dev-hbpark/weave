import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

type Variant = "ghost" | "subtle" | "danger";
type Size = "sm" | "md";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly "aria-label": string; // required for a11y
  readonly children: ReactNode;
}

/** Square icon-only button. Always requires `aria-label`. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = "ghost", size = "md", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-sm)]",
        "transition-[background,color] duration-[var(--motion-fast)] ease-[var(--motion-spring-soft)]",
        "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        size === "sm" ? "w-7 h-7 text-[14px]" : "w-9 h-9 text-[16px]",
        variant === "ghost" &&
          "text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] hover:bg-[color:var(--surface-2)]",
        variant === "subtle" &&
          "text-[color:var(--text-strong)] bg-[color:var(--surface-2)] hover:bg-[color:var(--surface-1)] border border-[color:var(--surface-2-border)]",
        variant === "danger" &&
          "text-[color:var(--accent-strong)] hover:bg-[color:var(--accent-soft)]",
        className,
      )}
      {...rest}
    >
      <span aria-hidden>{children}</span>
    </button>
  );
});
