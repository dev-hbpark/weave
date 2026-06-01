// WI-070 — transient snap feedback (one active snap per editor). The drag
// consumer pushes the live `SnapResult` here on every move while a snap is held,
// and clears it on commit / cancel. Two readers subscribe:
//   • SnapFeedbackLayer — renders the guide geometry (`result.guides`).
//   • VertexHandle — highlights the endpoint that is the active snap TARGET.
// Held in a tiny subscribable store (not React state) like `vertex-selection.ts`,
// so the portal'd selection chrome re-renders on snap change without a parent
// re-render.

import type { SnapResult } from "@agocraft/core";
import { useSyncExternalStore } from "react";

let current: SnapResult | null = null;
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

function sameResult(a: SnapResult | null, b: SnapResult | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.dx === b.dx &&
    a.dy === b.dy &&
    a.hits.length === b.hits.length &&
    a.guides.length === b.guides.length
  );
}

export const snapFeedback = {
  get: (): SnapResult | null => current,
  set: (r: SnapResult | null): void => {
    // Show feedback on a real lock: either a hit (endpoint point-snap) OR active
    // guide lines (move-drag alignment/bounds/grid/spacing). WI-072+ move-snap
    // publishes guides with no hits, so gate on EITHER being non-empty.
    const next = r !== null && (r.hits.length > 0 || r.guides.length > 0) ? r : null;
    if (sameResult(current, next)) return;
    current = next;
    emit();
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

/** Reactive: the live snap result, or null when nothing is snapped. */
export function useSnapFeedback(): SnapResult | null {
  return useSyncExternalStore(snapFeedback.subscribe, snapFeedback.get, () => null);
}

/** Reactive: is endpoint `(itemId, index)` the active snap TARGET (so its handle
 *  should show the will-fuse highlight)? Keys off the `opposite-endpoint` source
 *  tag the endpoint provider emits. */
export function useSnapTargetEndpoint(itemId: string, index: number): boolean {
  const r = useSyncExternalStore(snapFeedback.subscribe, snapFeedback.get, () => null);
  if (r === null) return false;
  return r.hits.some(
    (h) =>
      h.target.source.type === "opposite-endpoint" &&
      h.target.source.itemId === itemId &&
      (h.target.source.meta as { anchorIndex?: number } | undefined)?.anchorIndex === index,
  );
}
