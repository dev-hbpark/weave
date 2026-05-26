// DR-design-010 — Banner primitive (Grew × 3, one of 3 launch-comm primitives).
//
// Region-level announcement surface for in-app communication: launch notes,
// known-issue notices, deprecation warnings. Non-blocking (unlike Dialog),
// host-controlled persistence (the primitive emits `onDismiss`; the host
// decides whether to record that dismissal in localStorage and what TTL to
// apply on next mount).
//
// Anatomy:
//   ┌─────────────────────────────────────────────────────────────────┐
//   │  [icon]  Headline                                          [×]  │
//   │          Body (children)                                        │
//   │          [Action label →]                                       │
//   └─────────────────────────────────────────────────────────────────┘
//
// Tone variants:
//   - "info"          — neutral overlay surface, soft text icon.
//   - "announcement"  — accent-tinted icon + border, used for launch notes.
//
// (tone="warning" is intentionally deferred to a follow-up PR — no `--warning`
//  token is wired yet across all theme variants. The amber color palette is
//  available but using it directly would be a token escape.)
//
// Token discipline: zero hard-coded colors / shadows / radii / motion.
//
// a11y:
//   - `role="status"` (info / announcement). `aria-live="polite"`.
//   - dismiss button has visible focus ring + accessible label.
//   - motion respects `prefers-reduced-motion` (slide-down → fade-only).
//
// Host responsibilities (intentionally NOT in the primitive):
//   - localStorage persist of dismissal (read on mount, write in onDismiss).
//   - Time-windowed auto-retraction (e.g. 1 week post-launch).
//   - i18n of headline / body / action label / dismiss label.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn.js";

export type BannerTone = "info" | "announcement";

export interface BannerAction {
  readonly label: string;
  readonly onAction: () => void;
}

export interface BannerProps {
  /** Visual tone. Default `"info"`. */
  readonly tone?: BannerTone;
  /** Optional decorative icon. Hidden from assistive tech automatically (host
   *  should mark with `aria-hidden` when passing an emoji or icon). */
  readonly icon?: ReactNode;
  /** Required single-line heading. */
  readonly headline: string;
  /** Body content under the headline. */
  readonly children?: ReactNode;
  /** Optional single action button (use Dialog if you need ≥ 2 actions). */
  readonly action?: BannerAction;
  /** Show the `×` dismiss button. Default `true`. */
  readonly dismissible?: boolean;
  /** Fires when the user clicks dismiss. The host persists the dismissal. */
  readonly onDismiss?: () => void;
  /** Accessible label for the dismiss button (i18n). Default `"Dismiss"`. */
  readonly dismissLabel?: string;
  /** When set, drives the AnimatePresence enter/exit. Default `true`. */
  readonly open?: boolean;
  readonly className?: string;
  /** Test id passed through to the outer container. */
  readonly "data-testid"?: string;
}

export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner(
  {
    tone = "info",
    icon,
    headline,
    children,
    action,
    dismissible = true,
    onDismiss,
    dismissLabel = "Dismiss",
    open = true,
    className,
    "data-testid": testId,
  },
  ref,
) {
  const reduced = useReducedMotion();
  const initial = reduced ? { opacity: 0 } : { opacity: 0, y: -8 };
  const animate = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };
  const exit = reduced ? { opacity: 0 } : { opacity: 0, y: -4 };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          role="status"
          aria-live="polite"
          initial={initial}
          animate={animate}
          exit={exit}
          transition={{ duration: reduced ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative flex items-start gap-3",
            "rounded-[var(--radius-md)] border",
            "bg-[color:var(--surface-overlay)] backdrop-blur-[var(--surface-blur)]",
            "text-[color:var(--text-overlay)]",
            "shadow-[var(--shadow-overlay)]",
            "px-4 py-3",
            tone === "announcement"
              ? "border-[color:var(--accent-strong)]"
              : "border-[color:var(--surface-overlay-border)]",
            // Compositor hint — backdrop-filter can drop under a transforming
            // ancestor; this keeps the blur stable. [[feedback_backdrop_filter_under_transform]]
            "[transform:translateZ(0)] [will-change:backdrop-filter]",
            className,
          )}
          data-tone={tone}
          data-testid={testId}
        >
          {icon !== undefined ? (
            <span
              className={cn(
                "shrink-0 text-base leading-6",
                tone === "announcement"
                  ? "text-[color:var(--accent)]"
                  : "text-[color:var(--text-overlay-soft)]",
              )}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="m-0 text-sm font-medium leading-5 text-[color:var(--text-overlay)]">
              {headline}
            </p>
            {children !== undefined ? (
              <div className="text-sm leading-5 text-[color:var(--text-overlay-soft)]">
                {children}
              </div>
            ) : null}
            {action !== undefined ? (
              <button
                type="button"
                onClick={action.onAction}
                className={cn(
                  "mt-1 self-start",
                  "text-sm font-medium",
                  "text-[color:var(--accent)] hover:text-[color:var(--accent-strong)]",
                  "underline decoration-transparent hover:decoration-current",
                  "transition-[color,text-decoration-color] duration-[var(--motion-quick)]",
                  "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]",
                  "rounded-[var(--radius-xs)]",
                )}
              >
                {action.label}
              </button>
            ) : null}
          </div>

          {dismissible ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              className={cn(
                "shrink-0",
                "size-6 rounded-[var(--radius-xs)]",
                "flex items-center justify-center",
                "text-[color:var(--text-overlay-soft)] hover:text-[color:var(--text-overlay)]",
                "hover:bg-[color:var(--surface-overlay-2)]",
                "transition-colors duration-[var(--motion-quick)]",
                "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]",
              )}
            >
              <span aria-hidden className="text-base leading-none">
                ×
              </span>
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});
