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
