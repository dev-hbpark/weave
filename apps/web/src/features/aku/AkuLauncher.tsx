// Aku floating launcher (WI-052 → WI-053) — the collapsed state, now a floating
// CHARACTER mascot (둥둥 떠다니는 요정 컨셉) instead of a labeled pill. Positioned
// by the host via `style` (top-left by default, user-draggable). The button box
// stays stable (so a Popover/Coachmark anchors cleanly) while an INNER wrapper
// bobs via the `aku-bob` transform animation (reduced-motion safe, CSS).
// Presentational + forwardRef + full prop spread so it works both as a draggable
// surface (host passes onPointerDown) AND as a Popover/Coachmark anchor (Radix
// `asChild` merges its ref + handlers). ([[feedback_radix_slot_wrapper_forwardref]])

import { type ButtonHTMLAttributes, forwardRef } from "react";
import { AkuMascot } from "./AkuMascot.js";

export const AkuLauncher = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function AkuLauncher({ className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="아쿠 열기"
        data-aku-launcher
        className={`fixed z-[48] w-16 h-16 rounded-full touch-none cursor-grab active:cursor-grabbing hover:brightness-105 active:brightness-95 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] transition-[filter] duration-[var(--motion-fast)] ${className ?? ""}`}
        {...rest}
      >
        {/* inner wrapper bobs; the button box itself stays put (anchor stability) */}
        <span className="aku-bob block w-full h-full">
          <AkuMascot
            variant="mark"
            className="w-full h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
          />
        </span>
      </button>
    );
  },
);
