// WI-092 — the currently selected intra-chart ELEMENT (one per editor), held in
// a tiny subscribable store (NOT React state) — the same pattern as
// `vertexSelection` (WI-069). Two readers need the SAME source of truth:
//
//   • React: ChartSection / ChartElementEditor (the props panel) read it via the
//     `useChartElementSelection` context, which is now backed by this store.
//   • Non-React: the chart-element SelectionLayer view-model (registered
//     imperatively, can't use React context) reads it to decide WHICH datum's
//     drag handle to render — exactly as the poly-vertex handle reads
//     `vertexSelection`.
//
// Keeping it outside React means the portal'd SelectionLayer handle re-renders on
// element-selection change without depending on a parent re-render.

import { useSyncExternalStore } from "react";

export interface ChartElementRef {
  readonly chartItemId: string;
  /** DR-037 — selection level. `datum` = one bar/slice (mark click). `series` =
   *  a whole series (legend click) → edits apply to all its datums. */
  readonly role: "series" | "datum";
  /** Series name (legend / series-override key). Set for both roles. */
  readonly seriesName?: string | undefined;
  /** Datum category (per-datum override key). Set for `datum`. */
  readonly category?: string | undefined;
  /** Dataset row index of the clicked mark. Set for `datum`. */
  readonly rowIndex?: number | undefined;
  readonly value?: number | undefined;
}

function sameRef(a: ChartElementRef | null, b: ChartElementRef | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.chartItemId === b.chartItemId &&
    a.role === b.role &&
    a.seriesName === b.seriesName &&
    a.category === b.category &&
    a.rowIndex === b.rowIndex &&
    a.value === b.value
  );
}

let current: ChartElementRef | null = null;
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

export const chartElementStore = {
  get: (): ChartElementRef | null => current,
  set: (v: ChartElementRef | null): void => {
    if (sameRef(current, v)) return;
    current = v;
    emit();
  },
  /** Clear iff the selected element belongs to `itemId` (chart deselected). */
  clearItem: (itemId: string): void => {
    if (current?.chartItemId === itemId) {
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

/** Reactive: the selected element of `chartItemId`, or null. Used by the
 *  view-model's handle render (via `useSyncExternalStore`) so handles track the
 *  live element selection. */
export function useSelectedChartElement(chartItemId: string): ChartElementRef | null {
  const sel = useSyncExternalStore(chartElementStore.subscribe, chartElementStore.get, () => null);
  return sel?.chartItemId === chartItemId ? sel : null;
}
