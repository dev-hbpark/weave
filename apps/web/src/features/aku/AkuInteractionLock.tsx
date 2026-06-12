// 아쿠 — interaction lock UI (WI-105 / DR-072 · WI-110/WI-115 spotlight).
//
// While the agent is streaming (`locked`), dims + blocks the whole app so only the
// Aku panel/launcher is operable (correctness: the agent reads the doc/selection
// and edits via editor.exec — concurrent user edits would corrupt its snapshot +
// the undo stack). The "아쿠가 편집 중…" status pill (with a stop button) is the
// MINIMIZED face of a running edit: shown only when the panel is CLOSED (`showStatus`)
// — closing the panel mid-run minimizes to this pill rather than ending the run, and
// the panel's own progress + stop take over when it is open. Rendered inside
// AkuAssistant's body portal, so the scrim is a
// <body> child (sibling of #root) at z-47 — below the Aku surface (z-48), above
// all app chrome. Effects engage #root `inert` + the window keyboard/wheel guard;
// everything reverses when `locked` goes false (status → idle), so it never traps.
//
// WI-110/WI-115 — `spotlight`: while the working Aku is on the canvas (whether the
// panel is open or closed — WI-127 keeps the launcher alive while streaming), a
// circle around it stays sharp + BRIGHT while the rest is blurred + DARKENED:
//   - DIM layer  — blur + brightness↓ + dark tint, masked to EXCLUDE the centre
//     (masked-out pixels paint nothing → no blur/dim over Aku).
//   - BRIGHT layer — backdrop brightness↑ + a soft glow, masked to ONLY the centre
//     so the slide Aku is editing reads brighter than the dimmed surround.
// A rAF loop tracks the launcher's REAL (gliding) centre into CSS vars on the
// container; both layers inherit them so the hole stays glued to Aku.

import { IconButton } from "@weave/design-system";
import { useEffect, useRef } from "react";
import { installInteractionLock, isAkuSurface } from "./interaction-lock.js";

const SPOT = "var(--aku-spot-x, -999px) var(--aku-spot-y, -999px)";
// Outside ~210px → blurred + dark; the centre is cut clear for the bright layer.
const DIM_MASK = `radial-gradient(circle at ${SPOT}, transparent 0, transparent 210px, #000 300px)`;
// Brighten only the inner ~180px around Aku, feathering out by 260px.
const BRIGHT_MASK = `radial-gradient(circle at ${SPOT}, #000 0, #000 180px, transparent 260px)`;
const BRIGHT_GLOW = `radial-gradient(circle at ${SPOT}, rgba(255,255,255,0.10) 0, rgba(255,255,255,0) 200px)`;

export function AkuInteractionLock({
  locked,
  spotlight = false,
  showStatus = true,
  onStop,
  onOpen,
}: {
  readonly locked: boolean;
  readonly spotlight?: boolean;
  /** Show the "아쿠가 편집 중…" status pill. Gated to panel-CLOSED only — while the
   *  panel is open it shows its own streaming progress + stop button, so the
   *  floating pill would be redundant (the lock scrim itself stays regardless). */
  readonly showStatus?: boolean;
  /** Stop the in-flight run from the pill (mirrors the panel composer's stop). */
  readonly onStop?: (() => void) | undefined;
  /** Re-open the panel by clicking the pill text — parity with tapping the
   *  launcher Aku (the pill is the minimized face of the same surface). */
  readonly onOpen?: (() => void) | undefined;
}): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!locked) return;
    return installInteractionLock({
      rootEl: typeof document !== "undefined" ? document.getElementById("root") : null,
      isExempt: isAkuSurface,
    });
  }, [locked]);

  // Glue the bright/clear circle to the launcher's real (animated) center each
  // frame — write the vars on the container so both mask layers inherit them.
  useEffect(() => {
    if (!locked || !spotlight) return;
    let raf = 0;
    const tick = (): void => {
      const el = rootRef.current;
      const aku = document.querySelector("[data-aku-launcher]");
      if (el !== null && aku !== null) {
        const r = aku.getBoundingClientRect();
        el.style.setProperty("--aku-spot-x", `${r.left + r.width / 2}px`);
        el.style.setProperty("--aku-spot-y", `${r.top + r.height / 2}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [locked, spotlight]);

  if (!locked) return null;

  return (
    <div
      ref={rootRef}
      data-aku-lock
      className="fixed inset-0 z-[47] flex items-start justify-center"
    >
      {/* DIM — blur + darken everything (masked to leave the Aku circle clear). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[color:var(--bg)]/55 backdrop-blur-[3px] backdrop-brightness-[0.5]"
        style={spotlight ? { maskImage: DIM_MASK, WebkitMaskImage: DIM_MASK } : undefined}
      />
      {/* BRIGHT — lift the Aku circle above normal (engaged whenever streaming). */}
      {spotlight ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 backdrop-brightness-[1.22] backdrop-saturate-[1.1]"
          style={{
            background: BRIGHT_GLOW,
            maskImage: BRIGHT_MASK,
            WebkitMaskImage: BRIGHT_MASK,
          }}
        />
      ) : null}
      {/* Status pill — panel-CLOSED only (WI: minimized edit indicator). Carries
          the same stop control as the panel composer so the run can be halted
          without re-opening the panel. */}
      {showStatus ? (
        <div
          role="status"
          aria-live="polite"
          className="relative mt-20 flex items-center gap-1.5 rounded-[var(--radius-full)] border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay)] py-1 pl-3.5 pr-1 text-[12px] font-medium text-[color:var(--text-overlay)] shadow-[var(--shadow-overlay)] backdrop-blur-[var(--surface-blur)]"
        >
          {/* Clicking the text re-opens the panel — same affordance as tapping the
              launcher Aku. A real <button> so it's keyboard-reachable. */}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label="아쿠 패널 열기"
              className="rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              아쿠가 편집 중…
            </button>
          ) : (
            <span>아쿠가 편집 중…</span>
          )}
          {onStop ? (
            <IconButton aria-label="중지" variant="subtle" size="sm" onClick={onStop}>
              <span className="block w-2.5 h-2.5 rounded-[2px] bg-current" aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
