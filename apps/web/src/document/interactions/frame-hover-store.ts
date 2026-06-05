// The frame the pointer is hovering, in a tiny subscribable store (mirrors
// `chart-hover-store` / `chartElementStore`). It exists so that during a
// MULTI-selection each selected item's SelectionLayer chrome (outline +
// resize/rotate handles) stays HIDDEN until its frame is hovered — then only
// that frame's chrome reveals, the same way the chart's per-bar width handles
// stay hidden until a bar is hovered (`useHoveredBarIndex`).
//
// The host (DesignPage) bridges `useHoverContext` into this store; NestedFrame
// reads it through `useIsFrameHovered`. Keeping it outside React means the
// per-frame subscription re-renders ONLY the frame whose hover boolean flips
// (the one being left and the one being entered), not the whole tree.

import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

export const frameHoverStore = {
  get: (): string | null => current,
  set: (v: string | null): void => {
    if (current === v) return;
    current = v;
    emit();
  },
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Reactive: is `itemId` the currently hovered frame? The snapshot is the
 *  boolean itself, so only the frame whose value flips re-renders on a hover
 *  transition. */
export function useIsFrameHovered(itemId: string): boolean {
  return useSyncExternalStore(
    frameHoverStore.subscribe,
    () => current === itemId,
    () => false,
  );
}
