// 아쿠 — interaction lock UI (WI-105 / DR-072 · WI-110 spotlight).
//
// While the agent is streaming (`locked`), dims + blocks the whole app so only the
// Aku panel/launcher is operable (correctness: the agent reads the doc/selection
// and edits via editor.exec — concurrent user edits would corrupt its snapshot +
// the undo stack). Rendered inside AkuAssistant's body portal, so the scrim is a
// <body> child (sibling of #root) at z-47 — below the Aku surface (z-48), above
// all app chrome. Effects engage #root `inert` + the window keyboard/wheel guard;
// everything reverses when `locked` goes false (status → idle), so it never traps.
//
// WI-110 — `spotlight`: while the roaming Aku is working (panel closed), a clear
// circle (radius ≈ 2× the Aku height) follows it so you can see what it's editing
// sharply, while the rest stays dim+blurred. Implemented as an alpha radial-gradient
// MASK on the dim/blur layer (transparent center → opaque outside): masked-out
// pixels paint nothing, so backdrop-blur isn't applied there. A rAF loop tracks the
// launcher's REAL (gliding) position via CSS vars so the hole stays glued to it.

import { useEffect, useRef } from "react";
import { installInteractionLock, isAkuSurface } from "./interaction-lock.js";

// Clear out to ~2× the 120px Aku height (240px), feathering to fully blurred at 300px.
const SPOTLIGHT_MASK =
  "radial-gradient(circle at var(--aku-spot-x, -999px) var(--aku-spot-y, -999px), transparent 0, transparent 240px, #000 300px)";

export function AkuInteractionLock({
  locked,
  spotlight = false,
}: {
  readonly locked: boolean;
  readonly spotlight?: boolean;
}): JSX.Element | null {
  const blurRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!locked) return;
    return installInteractionLock({
      rootEl: typeof document !== "undefined" ? document.getElementById("root") : null,
      isExempt: isAkuSurface,
    });
  }, [locked]);

  // Glue the clear circle to the launcher's real (animated) center each frame.
  useEffect(() => {
    if (!locked || !spotlight) return;
    let raf = 0;
    const tick = (): void => {
      const el = blurRef.current;
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
    <div data-aku-lock className="fixed inset-0 z-[47] flex items-start justify-center">
      <div
        ref={blurRef}
        aria-hidden="true"
        className="absolute inset-0 bg-[color:var(--bg)]/45 backdrop-blur-[2px]"
        style={
          spotlight ? { maskImage: SPOTLIGHT_MASK, WebkitMaskImage: SPOTLIGHT_MASK } : undefined
        }
      />
      <div
        role="status"
        aria-live="polite"
        className="relative mt-20 rounded-[var(--radius-full)] border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay)] px-3.5 py-1.5 text-[12px] font-medium text-[color:var(--text-overlay)] shadow-[var(--shadow-overlay)] backdrop-blur-[var(--surface-blur)]"
      >
        아쿠가 편집 중…
      </div>
    </div>
  );
}
