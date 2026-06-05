// WI-092 — the bar the pointer is hovering inside a chart, in a tiny subscribable
// store (the `chartElementStore` / `vertexSelection` pattern). It exists so the
// CHART-level width handles (one per bar, shown when the chart item is selected
// but no bar is drilled in) can stay HIDDEN until the user hovers a bar — then
// only that bar's handle reveals. The hover is reported by EChartView bridging
// ECharts' `mouseover` / `mouseout` mark events; the handle view-model reads it.

import { useSyncExternalStore } from "react";

export interface HoveredBar {
  readonly chartItemId: string;
  readonly rowIndex: number;
}

let current: HoveredBar | null = null;
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

export const chartHoverStore = {
  get: (): HoveredBar | null => current,
  set: (v: HoveredBar | null): void => {
    if (current?.chartItemId === v?.chartItemId && current?.rowIndex === v?.rowIndex) return;
    current = v;
    emit();
  },
  /** Clear iff the hovered bar belongs to `itemId` (pointer left that chart). */
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

/** Reactive: the hovered bar index for `chartItemId`, or null. */
export function useHoveredBarIndex(chartItemId: string): number | null {
  const h = useSyncExternalStore(chartHoverStore.subscribe, chartHoverStore.get, () => null);
  return h?.chartItemId === chartItemId ? h.rowIndex : null;
}
