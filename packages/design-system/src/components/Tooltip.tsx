// DR-design-010 — Tooltip primitive (Grew × 3, one of 3 launch-comm primitives).
//
// Thin wrapper over `@radix-ui/react-tooltip`. Radix handles a11y (focus +
// hover + `aria-describedby` + `Esc` dismiss), accessible delay buffers, and
// collision-aware positioning. We add the aurora-glass surface + token-based
// motion only.
//
// Distinct from `AITooltip` (DR-design-006). AITooltip composes three regions
// (context + actions + shortcut keycap) for AI-agentic surfaces; this Tooltip
// is the simple single-line hint used for affordance copy, change-of-behavior
// notes, and other non-agentic guidance.
//
// Usage:
//   <Tooltip content="Change font size here — corner drag adjusts the box only">
//     <NumberSlider ... />
//   </Tooltip>
//
// `delayDuration` defaults to 200ms (slightly later than AITooltip's 175ms
// dwell threshold — the simple hint shouldn't pre-empt the agentic surface).
//
// Token discipline: zero hard-coded colors / shadows / radii / motion.

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { motion, useReducedMotion } from "motion/react";
import { forwardRef, type ReactElement, type ReactNode } from "react";
import { cn } from "../cn.js";

export interface TooltipProps {
  /** Tooltip content. Keep to one or two lines — use Popover for richer
   *  content. */
  readonly content: ReactNode;
  /** Anchor element. Must be a single React element so Radix can attach the
   *  hover / focus handlers and `aria-describedby`. */
  readonly children: ReactElement;
  /** Hover-dwell before the tooltip appears. Default 200ms. */
  readonly delayDuration?: number;
  readonly side?: TooltipPrimitive.TooltipContentProps["side"];
  readonly align?: TooltipPrimitive.TooltipContentProps["align"];
  readonly sideOffset?: number;
  /** Suppress the tooltip without changing markup. Useful for time-bound
   *  hints (e.g. show only for the first week post-launch). */
  readonly disabled?: boolean;
  readonly className?: string;
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(function Tooltip(
  {
    content,
    children,
    delayDuration = 200,
    side = "top",
    align = "center",
    sideOffset = 6,
    disabled = false,
    className,
  },
  ref,
) {
  const reduced = useReducedMotion();
  const initial = reduced ? { opacity: 0 } : { opacity: 0, y: -2, scale: 0.98 };
  const animate = reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };

  if (disabled) return children;

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} disableHoverableContent>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            ref={ref}
            side={side}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={12}
            className={cn(
              "z-50 max-w-[280px]",
              "rounded-[var(--radius-sm)] border",
              "bg-[color:var(--surface-overlay)] border-[color:var(--surface-overlay-border)]",
              "text-[color:var(--text-overlay)]",
              "shadow-[var(--shadow-overlay)]",
              "backdrop-blur-[var(--surface-blur)]",
              "px-2.5 py-1.5",
              "text-xs leading-4",
              "focus-visible:outline-none",
              "[transform:translateZ(0)] [will-change:backdrop-filter]",
              className,
            )}
            asChild
          >
            <motion.div
              initial={initial}
              animate={animate}
              transition={{ duration: reduced ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              {content}
              <TooltipPrimitive.Arrow
                width={10}
                height={5}
                className="fill-[color:var(--surface-overlay)] stroke-[color:var(--surface-overlay-border)]"
              />
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
});
