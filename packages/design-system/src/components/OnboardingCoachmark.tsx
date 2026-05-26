// DR-design-010 — OnboardingCoachmark primitive (Grew × 3, last of 3
// launch-comm primitives).
//
// First-time hint anchored to a specific UI element. Renders once per
// `persistKey`; subsequent mounts are silent. Uses the existing `Popover`
// primitive (Radix Popover under the hood) for positioning, arrow, and a11y;
// adds:
//   - localStorage persist (`weave.coachmark.<persistKey>` = `"shown"`).
//   - auto-open on first mount.
//   - dedicated headline + dismiss button layout.
//
// Anatomy:
//                         ▲
//   ┌─────────────────────────────────────┐
//   │ [icon] Headline                     │
//   │        Body (children)              │
//   │                          [dismiss]  │
//   └─────────────────────────────────────┘
//                         ▲ anchor
//
// Distinct from `Tooltip` (hover/focus + transient) and `Banner` (top-of-app
// region + dismissible). A coachmark is anchor-attached and one-shot.
//
// a11y:
//   - Radix Popover provides `aria-haspopup`, `aria-expanded`, Esc dismiss,
//     outside-click dismiss.
//   - `focus` does NOT auto-move to the popover (deliberately non-blocking).
//   - Dismiss button is reachable via Tab.
//   - Motion respects `prefers-reduced-motion`.

import { motion, useReducedMotion } from "motion/react";
import {
  forwardRef,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { cn } from "../cn.js";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.js";

const STORAGE_PREFIX = "weave.coachmark.";

function readPersisted(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === "shown";
  } catch {
    // localStorage may throw under Safari private-mode quirks; default to
    // "not shown" so the coachmark behaves correctly even when persistence
    // is unavailable.
    return false;
  }
}

function writePersisted(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, "shown");
  } catch {
    // Same Safari quirk as above; silently drop. The coachmark will reappear
    // on next mount, which is the safer failure mode.
  }
}

export interface OnboardingCoachmarkProps {
  /** Unique key under which the dismissal is persisted. localStorage
   *  `weave.coachmark.<persistKey>` is set to `"shown"` after the user
   *  dismisses; on subsequent mounts the coachmark stays silent. */
  readonly persistKey: string;
  /** Anchor element — must be a single React element so the Radix trigger
   *  can attach event handlers. */
  readonly anchor: ReactElement;
  /** Optional decorative icon (passed `aria-hidden` automatically). */
  readonly icon?: ReactNode;
  /** Required heading. */
  readonly headline: string;
  /** Body content under the headline. */
  readonly children?: ReactNode;
  /** Dismiss button label (i18n). Default `"Got it"`. */
  readonly dismissLabel?: string;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly align?: "start" | "center" | "end";
  /** Fires the first time the coachmark becomes visible. */
  readonly onShown?: () => void;
  /** Fires when the user dismisses it. */
  readonly onDismissed?: () => void;
  /** Bypass persistence — for tests / storybooks. */
  readonly forceShow?: boolean;
  readonly className?: string;
}

export const OnboardingCoachmark = forwardRef<HTMLDivElement, OnboardingCoachmarkProps>(
  function OnboardingCoachmark(
    {
      persistKey,
      anchor,
      icon,
      headline,
      children,
      dismissLabel = "Got it",
      side = "bottom",
      align = "center",
      onShown,
      onDismissed,
      forceShow = false,
      className,
    },
    ref,
  ) {
    const [open, setOpen] = useState<boolean>(false);
    const reduced = useReducedMotion();

    useEffect(() => {
      if (forceShow) {
        setOpen(true);
        onShown?.();
        return;
      }
      if (readPersisted(persistKey)) return;
      setOpen(true);
      onShown?.();
    }, [persistKey, forceShow, onShown]);

    const dismiss = useCallback(() => {
      setOpen(false);
      writePersisted(persistKey);
      onDismissed?.();
    }, [persistKey, onDismissed]);

    const initial = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 };
    const animate = reduced ? { opacity: 1 } : { opacity: 1, scale: 1 };

    return (
      <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
        <PopoverTrigger asChild>{anchor}</PopoverTrigger>
        <PopoverContent
          ref={ref}
          side={side}
          align={align}
          className={cn(
            "max-w-[320px] p-0",
            "border-[color:var(--accent-strong)]",
            className,
          )}
          // Coachmark is non-blocking — don't steal focus on open.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <motion.div
            initial={initial}
            animate={animate}
            transition={{
              duration: reduced ? 0 : 0.16,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex flex-col gap-2 p-3"
          >
            <div className="flex items-start gap-2">
              {icon !== undefined ? (
                <span
                  className="shrink-0 text-base leading-6 text-[color:var(--accent)]"
                  aria-hidden
                >
                  {icon}
                </span>
              ) : null}
              <p className="m-0 text-sm font-medium leading-5 text-[color:var(--text-overlay)]">
                {headline}
              </p>
            </div>
            {children !== undefined ? (
              <div className="text-sm leading-5 text-[color:var(--text-overlay-soft)]">
                {children}
              </div>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={dismiss}
                className={cn(
                  "text-xs font-medium",
                  "px-2 py-1 rounded-[var(--radius-xs)]",
                  "text-[color:var(--text-overlay)]",
                  "bg-[color:var(--accent-soft)] hover:bg-[color:var(--accent)]",
                  "hover:text-[color:var(--text-on-accent,white)]",
                  "transition-colors duration-[var(--motion-quick)]",
                  "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]",
                )}
              >
                {dismissLabel}
              </button>
            </div>
          </motion.div>
        </PopoverContent>
      </Popover>
    );
  },
);
