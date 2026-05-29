// Aku floating launcher (WI-052) — the collapsed state. A labeled accent PILL
// (icon + "아쿠"), positioned by the host via `style` (top-left by default,
// user-draggable). Presentational + forwardRef + full prop spread so it works
// both as a draggable surface (host passes onPointerDown) AND as the
// OnboardingCoachmark anchor (Radix Popover `asChild` merges its ref + handlers).
// ([[feedback_radix_slot_wrapper_forwardref]])

import { IconSparkle } from "@weave/design-system";
import { type ButtonHTMLAttributes, forwardRef } from "react";

export const AkuLauncher = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function AkuLauncher({ className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="아쿠 열기"
        data-aku-launcher
        className={`fixed z-[48] inline-flex items-center gap-2 h-12 pl-3.5 pr-4 rounded-full text-[var(--text-on-accent)] bg-[image:var(--accent-gradient)] shadow-[var(--shadow-glow)] hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] transition-[filter,box-shadow] duration-[var(--motion-fast)] touch-none cursor-grab active:cursor-grabbing ${className ?? ""}`}
        {...rest}
      >
        <IconSparkle size={20} />
        <span className="text-[14px] font-semibold tracking-tight">아쿠</span>
      </button>
    );
  },
);
