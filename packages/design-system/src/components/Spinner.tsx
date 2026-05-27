// DR-design-018 — single-tone rotating arc primitive.
//
// Sized + styled in the same shape as Icon.tsx: 24×24 grid, stroke-only,
// `currentColor`. Rotation is driven by Tailwind's built-in `animate-
// spin` utility (CSS @keyframes spin → 360° rotation, linear, 1s).
// The component is intentionally self-contained — it ships no fade /
// settle behavior; callers compose their own loading overlay around it.

import { forwardRef, type SVGAttributes } from "react";
import { cn } from "../cn.js";

export interface SpinnerProps extends Omit<SVGAttributes<SVGSVGElement>, "children"> {
  readonly size?: number | string;
}

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(
  function Spinner({ size = 20, className, ...rest }, ref) {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden
        className={cn(
          "inline-block shrink-0 animate-spin motion-reduce:animate-none",
          className,
        )}
        {...rest}
      >
        <circle cx="12" cy="12" r="9" strokeOpacity="0.2" strokeWidth="2.4" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  },
);
