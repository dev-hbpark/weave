// WI-073 follow-up — grid snap setting. A tiny subscribable store (like
// `vertex-selection.ts`) holding whether move-drag snaps to a fixed pixel grid
// and the grid step. Read non-reactively by `frame-move-snap` at each drag's
// `begin`; toggled by a UI control via `useGridSnap`.

import { useSyncExternalStore } from "react";

export interface GridSnapState {
  readonly enabled: boolean;
  /** Grid step in screen px (viewport), anchored to the design host's top-left. */
  readonly step: number;
}

let current: GridSnapState = { enabled: false, step: 8 };
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

export const gridSnap = {
  get: (): GridSnapState => current,
  set: (next: Partial<GridSnapState>): void => {
    const merged = { ...current, ...next };
    if (merged.enabled === current.enabled && merged.step === current.step) return;
    current = merged;
    emit();
  },
  toggle: (): void => {
    current = { ...current, enabled: !current.enabled };
    emit();
  },
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Reactive read of the grid-snap state (for the toggle control). */
export function useGridSnap(): GridSnapState {
  return useSyncExternalStore(gridSnap.subscribe, gridSnap.get, () => current);
}
