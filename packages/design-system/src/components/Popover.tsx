// WI-017 Phase B — Popover primitive (DR-design-007).
//
// Thin wrapper over `@radix-ui/react-popover`. Radix handles a11y (aria-
// haspopup / aria-expanded / focus trap / Esc dismiss / outside-click) plus
// collision-aware floating via `@floating-ui/react-dom`. We add the aurora-
// glass surface + token-based motion only.
//
// Exports:
//   - `Popover` — root (= Radix `Root`).
//   - `PopoverTrigger` — wrap the element that opens the popover (asChild).
//   - `PopoverAnchor` — *separately* declare the positioning anchor. Useful
//      when the click target is not the anchor (WI-017's rubber band drag —
//      pointer-up doesn't define an anchor, the drag rect does).
//   - `PopoverContent` — themed surface with entrance motion.
//   - `PopoverArrow` — caret pointing at the anchor; aurora-friendly fill.
//   - `PopoverClose` — declarative dismiss button slot.

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { motion, useReducedMotion } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export interface PopoverContentProps extends PopoverPrimitive.PopoverContentProps {
  readonly children: ReactNode;
}

export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  function PopoverContent({ className, children, sideOffset = 8, collisionPadding = 16, ...rest }, ref) {
    const reduced = useReducedMotion();
    const initial = reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 };
    const animate = reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          {...rest}
          className={cn(
            "z-50 min-w-[200px] max-w-[360px]",
            "rounded-[var(--radius-md)] border",
            "bg-[color:var(--surface-1)] border-[color:var(--surface-1-border)]",
            "shadow-[var(--shadow-glass)]",
            "backdrop-blur-[var(--surface-blur)]",
            "px-2 py-1.5",
            "focus-visible:outline-none",
            className,
          )}
          asChild
        >
          <motion.div
            initial={initial}
            animate={animate}
            transition={{
              duration: reduced ? 0 : 0.14,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {children}
          </motion.div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    );
  },
);

export interface PopoverArrowProps extends PopoverPrimitive.PopoverArrowProps {}

/**
 * Caret pointing at the anchor. Fill uses `var(--surface-1)` so the arrow
 * appears continuous with the content surface; the stroke matches the
 * content's border token. Width / height are token-free fixed pixels — the
 * arrow's geometry is part of its visual identity, not a theme dimension.
 */
export function PopoverArrow({ className, ...rest }: PopoverArrowProps) {
  return (
    <PopoverPrimitive.Arrow
      width={12}
      height={6}
      {...rest}
      className={cn(
        "fill-[color:var(--surface-1)] stroke-[color:var(--surface-1-border)]",
        className,
      )}
    />
  );
}
