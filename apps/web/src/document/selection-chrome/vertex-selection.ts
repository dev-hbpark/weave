// WI-069 — the currently SELECTED vertex (one per editor). A vertex click
// selects it; Delete/Backspace removes it; the matching handle renders
// highlighted. Held in a tiny subscribable store (not React state) so the
// handle — rendered inside the portal'd SelectionLayer — re-renders on
// selection change WITHOUT relying on a parent re-render, and DesignPage's
// keydown handler reads the same source.

import { useSyncExternalStore } from "react";

export interface VertexRef {
  readonly itemId: string;
  readonly index: number;
}

let current: VertexRef | null = null;
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

export const vertexSelection = {
  get: (): VertexRef | null => current,
  set: (v: VertexRef | null): void => {
    if (current?.itemId === v?.itemId && current?.index === v?.index) return;
    current = v;
    emit();
  },
  /** Clear iff the selected vertex belongs to `itemId` (item deselected/changed). */
  clearItem: (itemId: string): void => {
    if (current?.itemId === itemId) {
      current = null;
      emit();
    }
  },
  clear: (): void => {
    if (current !== null) {
      current = null;
      emit();
    }
  },
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Reactive: is `(itemId, index)` the selected vertex? */
export function useVertexSelected(itemId: string, index: number): boolean {
  const sel = useSyncExternalStore(vertexSelection.subscribe, vertexSelection.get, () => null);
  return sel?.itemId === itemId && sel.index === index;
}
