// WI-019 Phase 1 — Kbd primitive (DR-design-008).
//
// Semantic `<kbd>` element with token-aware visual. For hotkey hints
// (Space, Cmd+Z, ↑↓). When `combo` is true, ` + ` separators become visible
// pills so the user can read multi-key combos at a glance.

import { type HTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

type KbdSize = "sm" | "md";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  size?: KbdSize;
  /** When true, the `+` separators inside the label are rendered as visible
   *  glyphs between mini kbd pills. When false (default), the whole children
   *  is treated as a single key/glyph. */
  combo?: boolean;
  children?: ReactNode;
}

const sizeClass: Record<KbdSize, string> = {
  sm: "h-[18px] min-w-[18px] px-1 text-[10px]",
  md: "h-[20px] min-w-[20px] px-1.5 text-[11px]",
};

const baseClass = [
  "inline-flex items-center justify-center gap-1",
  "rounded-[var(--radius-xs)]",
  "bg-[color:var(--surface-2)]",
  "border border-[color:var(--border-strong)]",
  "text-[color:var(--text-strong)]",
  "font-mono font-medium tracking-[0.3px]",
  "select-none",
].join(" ");

function splitCombo(label: string): ReadonlyArray<string> {
  // Tolerant: accept "+", "+ " and " + " as separators.
  return label.split(/\s*\+\s*/).filter((s) => s.length > 0);
}

export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { size = "md", combo = false, className, children, ...rest },
  ref,
) {
  if (!combo || typeof children !== "string") {
    return (
      <kbd
        ref={ref}
        {...rest}
        className={cn(baseClass, sizeClass[size], className)}
      >
        {children}
      </kbd>
    );
  }

  // combo mode + string child → split into pills with + separators.
  const parts = splitCombo(children);
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      {...rest}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {parts.map((p, i) => (
        <span key={`${i}-${p}`} className="inline-flex items-center gap-1">
          <kbd className={cn(baseClass, sizeClass[size])}>{p}</kbd>
          {i < parts.length - 1 ? (
            <span className="text-[color:var(--text-soft)] text-[11px]">+</span>
          ) : null}
        </span>
      ))}
    </span>
  );
});

export type { KbdSize };
