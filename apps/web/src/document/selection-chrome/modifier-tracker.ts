// WI-183 — live keyboard-modifier state for gesture paths that don't receive
// pointer events. `FrameMoveSnap.snapDelta(dx, dy)` carries no modifier flags
// (the agocraft interface is delta-only), so the move-modifier decorator
// (`move-modifiers.ts`) reads Shift/Alt here instead. Keydown/keyup keep the
// state current; pointermove re-syncs it (covers keys already held before the
// window had focus); window blur resets everything so a modifier can never
// stick across an app switch.
//
// Module-level singleton with lazy install — call `ensureModifierTracker()`
// once from any consumer (idempotent, SSR-safe no-op).

export interface LiveModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}

const NONE: LiveModifiers = Object.freeze({ shift: false, alt: false, meta: false, ctrl: false });

let state: LiveModifiers = NONE;
let installed = false;

function sync(e: KeyboardEvent | PointerEvent): void {
  state = { shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey };
}

export function ensureModifierTracker(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", sync, true);
  window.addEventListener("keyup", sync, true);
  window.addEventListener("pointermove", sync, { capture: true, passive: true });
  window.addEventListener("blur", () => {
    state = NONE;
  });
}

/** Synchronous read of the current modifier state. */
export function liveModifiers(): LiveModifiers {
  return state;
}
