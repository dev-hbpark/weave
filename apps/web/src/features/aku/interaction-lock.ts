// 아쿠 — interaction lock mechanics (WI-105 / DR-072).
//
// While the agent is streaming, only the Aku surface (panel/launcher) may be
// operated. Pointer is blocked by the scrim overlay + #root `inert`; this module
// owns the parts inert alone can't cover:
//   - #root `inert` (focus / tab-order / a11y),
//   - a window CAPTURE guard for keydown/keyup/wheel that swallows events whose
//     target is outside the Aku surface — neutralizing the editor's window-level
//     hotkeys (input-bus) + wheel-zoom centrally, without touching editor code.
// Pure DOM (no React) so it's unit-testable in jsdom.

/** True when the event target sits inside the Aku panel or launcher (exempt). */
export function isAkuSurface(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest("[data-aku-panel],[data-aku-launcher]") !== null
  );
}

const GUARDED_EVENTS = ["keydown", "keyup", "wheel"] as const;

export interface InteractionLockOptions {
  /** The app root to make inert (everything except the body-portaled Aku). */
  readonly rootEl: HTMLElement | null;
  /** Returns true for targets that stay interactive (the Aku surface). */
  readonly isExempt: (target: EventTarget | null) => boolean;
}

/** Engage the lock; returns a cleanup that fully reverses it. */
export function installInteractionLock(opts: InteractionLockOptions): () => void {
  const { rootEl, isExempt } = opts;
  rootEl?.setAttribute("inert", "");

  const guard = (e: Event): void => {
    if (isExempt(e.target)) return;
    e.stopImmediatePropagation();
    // wheel must be cancelable to suppress the default (zoom/scroll); keys too.
    if (e.cancelable) e.preventDefault();
  };

  for (const type of GUARDED_EVENTS) {
    // capture phase + non-passive so preventDefault works (esp. wheel).
    window.addEventListener(type, guard, { capture: true, passive: false });
  }

  return () => {
    rootEl?.removeAttribute("inert");
    for (const type of GUARDED_EVENTS) {
      window.removeEventListener(type, guard, { capture: true } as EventListenerOptions);
    }
  };
}
