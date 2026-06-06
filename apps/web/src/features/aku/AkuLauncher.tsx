// Aku floating launcher (WI-052 → WI-053 → WI-103) — the collapsed state, a
// floating CHARACTER mascot (둥둥 떠다니는 요정 컨셉). Positioned by the host via
// `style` (top-left by default, user-draggable). The button box stays stable (so
// a Popover/Coachmark anchors cleanly) while the INNER content animates.
//
// WI-103: the inner content is now INJECTED (`mascot`) so the host can drive an
// expression-aware mascot (mood → motion) while keeping this component
// presentational; it defaults to the plain bob mascot when no expression is
// wired (coachmark/tip anchors, tests). An optional `caption` renders a
// turn-bound work말풍선 above the launcher (decorative — the panel carries the
// real status, so it's aria-hidden + pointer-events-none).
// Presentational + forwardRef + prop spread so it works both as a draggable
// surface AND as a Popover/Coachmark anchor (Radix `asChild` merges ref + handlers).
// ([[feedback_radix_slot_wrapper_forwardref]])

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { AkuMascot } from "./AkuMascot.js";

interface AkuLauncherProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Expression-aware inner content (WI-103). Defaults to the plain bob mascot. */
  readonly mascot?: ReactNode;
  /** Turn-bound work caption shown above the launcher (null/empty = none). */
  readonly caption?: string | null;
}

export const AkuLauncher = forwardRef<HTMLButtonElement, AkuLauncherProps>(function AkuLauncher(
  { className, mascot, caption, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="아쿠 열기"
      data-aku-launcher
      className={`fixed z-[48] w-[86px] h-30 rounded-[var(--radius-lg)] touch-none cursor-grab active:cursor-grabbing hover:brightness-105 active:brightness-95 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] transition-[left,top] duration-[1100ms] ease-in-out motion-reduce:transition-none ${className ?? ""}`}
      {...rest}
    >
      {caption !== null && caption !== undefined && caption !== "" ? (
        <span
          aria-hidden="true"
          data-aku-caption
          className="pointer-events-none absolute bottom-full left-1/2 mb-1 w-max max-w-[180px] -translate-x-1/2 text-balance rounded-[var(--radius-md)] border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay)] px-2 py-1 text-center text-[11px] leading-snug text-[color:var(--text-overlay)] shadow-[var(--shadow-overlay)] backdrop-blur-[var(--surface-blur)]"
        >
          {caption}
        </span>
      ) : null}
      {/* inner content animates; the button box itself stays put (anchor stability) */}
      {mascot ?? (
        <span className="aku-bob block w-full h-full">
          <AkuMascot
            variant="mark"
            className="w-full h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
          />
        </span>
      )}
    </button>
  );
});
