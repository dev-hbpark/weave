import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn.js";

type Tone = "default" | "raised";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

const toneClass: Record<Tone, string> = {
  default: ["bg-[color:var(--surface-1)]", "border border-[color:var(--surface-1-border)]"].join(
    " ",
  ),
  raised: [
    "bg-[color:var(--surface-2)]",
    "border border-[color:var(--surface-2-border)]",
    "shadow-[var(--shadow-glass)]",
  ].join(" "),
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ tone = "default", className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative rounded-[var(--radius-xl)] backdrop-blur-[var(--surface-blur)]",
        // Pin the card to its own GPU layer so `backdrop-filter` stays
        // applied across transform animations on ancestor elements. Without
        // this, Chromium opportunistically drops backdrop-filter while a
        // parent compositor layer is mid-animation (the present-mode
        // camera transform), then re-applies it on settle — visible as a
        // "things behind suddenly blur out" pop right after a slide
        // change. `will-change: backdrop-filter` hints intent and
        // `translateZ(0)` forces the layer promotion that backs it up.
        "[transform:translateZ(0)] [will-change:backdrop-filter]",
        "p-6 md:p-8",
        toneClass[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);

Card.displayName = "Card";

export function CardEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)] mb-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "text-[20px] font-semibold tracking-tight text-[color:var(--text-strong)]",
        className,
      )}
    >
      {children}
    </h2>
  );
}
