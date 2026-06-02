// WI-074 — transient rotation snap guide (one active at a time). The rotate sink
// (FrameStage) publishes the item center (viewport px) + the locked angle while a
// cardinal snap is held, and clears it on commit / cancel. RotationSnapLayer draws
// an axis crosshair + a degree badge. Tiny subscribable store (not React state),
// same pattern as snap-feedback.ts / vertex-selection.ts.

import { useSyncExternalStore } from "react";

export interface RotationSnapState {
  /** Item center, viewport px (crosshair origin). */
  readonly cx: number;
  readonly cy: number;
  /** Locked cardinal degree (0/90/180/270) — shown in the badge. */
  readonly deg: number;
  /** Locked rotation, radians — the crosshair orientation. */
  readonly rad: number;
}

let current: RotationSnapState | null = null;
const listeners = new Set<() => void>();

function same(a: RotationSnapState | null, b: RotationSnapState | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.cx === b.cx && a.cy === b.cy && a.deg === b.deg && a.rad === b.rad;
}

export const rotationSnapFeedback = {
  get: (): RotationSnapState | null => current,
  set: (s: RotationSnapState | null): void => {
    if (same(current, s)) return;
    current = s;
    for (const l of listeners) l();
  },
  clear: (): void => {
    if (current !== null) {
      current = null;
      for (const l of listeners) l();
    }
  },
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Reactive: the live rotation snap, or null when nothing is locked. */
export function useRotationSnap(): RotationSnapState | null {
  return useSyncExternalStore(rotationSnapFeedback.subscribe, rotationSnapFeedback.get, () => null);
}
