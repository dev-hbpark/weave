// WI-146 — one-shot "re-run text auto-height fit" signal.
//
// Agent generation runs in a batched transaction (round-grouping editor). During
// the round the auto-height ResizeObserver's fit can be grouped in and clobbered
// by later writes (setLayout child frames, etc.), and because the inner content
// size doesn't change afterwards the observer never re-fires — so generated text
// can stay at an un-settled (overlapping / oversized) height until the user
// manually edits it (which triggers the edit-exit reconcile that fixes it).
//
// This module lets the round-grouping editor PULSE a reconcile at ROUND END, so
// every mounted auto-height text re-runs the SAME fit a manual edit-exit would —
// the generated design settles on its own, no edit required. Each TextBlock
// subscribes; the fit is idempotent (threshold-guarded, no-ops in Fixed / while
// editing / during history replay), so a pulse with nothing to do is harmless.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to autofit pulses. Returns an unsubscribe. */
export function onTextAutofitRequest(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Pulse: ask every mounted auto-height text to re-run its fit. */
export function requestTextAutofit(): void {
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch {
      // a single listener throwing must not block the rest
    }
  }
}

// WI-216 / DR-053 — suppress the auto-height fit DURING a handle-drag layout
// gesture, then re-settle ONCE at the end.
//
// Why: while a flex/grid container is resized, the agocraft engine owns the
// children's sizes for the duration of the gesture (the frozen-baseline session,
// DR-053 (d)). If a child text has a `%` (ratio) font, the font scales with the
// container height every frame → its rendered content height changes → the
// auto-height ResizeObserver tries to grow the box → but the engine session is
// holding the box at its preserve-absolute size → the two fight every frame →
// visible layout JITTER. Suppressing the observer's commit while the gesture is
// active lets the engine win cleanly; a debounced end pulse re-runs the fit once
// the drag settles, so the final content height is correct.
let gestureActive = false;
let endTimer: ReturnType<typeof setTimeout> | null = null;
/** Idle gap after the last frame-commit that counts as "gesture ended". A
 *  pointermove drag commits far more often than this, so the flag stays set
 *  for the whole drag and clears shortly after pointer-up. */
const GESTURE_IDLE_MS = 140;

/** True while a handle-drag layout gesture is in progress (auto-fit suppressed). */
export function isLayoutGestureActive(): boolean {
  return gestureActive;
}

/** Mark layout-gesture activity (called on each frame-commit of a drag). Sets the
 *  active flag and (re)arms the idle timer; when the drag stops the timer clears
 *  the flag and pulses a single re-settle. No-op if `setTimeout` is unavailable. */
export function markLayoutGestureActivity(): void {
  gestureActive = true;
  if (typeof setTimeout !== "function") return;
  if (endTimer !== null) clearTimeout(endTimer);
  endTimer = setTimeout(() => {
    gestureActive = false;
    endTimer = null;
    requestTextAutofit();
  }, GESTURE_IDLE_MS);
}
