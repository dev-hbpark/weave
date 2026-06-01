// WI-074 Step 5 (DR-029 D5) — global "an image crop is active" gate.
//
// While crop mode is open, the inline crop editor (ImageBlock) owns pointer +
// keyboard. The editor hotkeys (Delete / R-T-F tools / clipboard) and selection
// gestures must NOT fire — otherwise dragging the crop window with the straighten
// slider unfocused would let a stray Delete remove the image, etc.
//
// Held in a tiny subscribable store (NOT React state), mirroring
// `snap-feedback.ts` / `vertex-selection.ts`, so:
//   • the imperative hotkey gate reads it synchronously via `isCroppingNow()`,
//   • React surfaces subscribe via `useIsCropping()`.
// Single active crop at a time (an `activeId`); entering a second crop supersedes
// the first, exiting only clears when the id matches (StrictMode-safe double-fire).

import { useSyncExternalStore } from "react";

let activeId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const croppingState = {
  enter: (id: string): void => {
    if (activeId !== id) {
      activeId = id;
      emit();
    }
  },
  exit: (id: string): void => {
    if (activeId === id) {
      activeId = null;
      emit();
    }
  },
  isActive: (): boolean => activeId !== null,
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Synchronous read for imperative gates (editor hotkeys, window keydown). */
export function isCroppingNow(): boolean {
  return activeId !== null;
}

/** React-reactive read for UI surfaces. */
export function useIsCropping(): boolean {
  return useSyncExternalStore(croppingState.subscribe, croppingState.isActive, () => false);
}
