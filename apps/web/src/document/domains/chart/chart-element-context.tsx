// WI-078 (DR-035) — ChartElementSelection context. Bridges an intra-chart mark
// click (deep inside FrameSurface, in ChartBlock) to the editing surface
// (ChartSection in the contextual toolbar) without prop-drilling.
//
// WI-092 — the source of truth MOVED to the module-level `chartElementStore` so
// the (non-React) SelectionLayer view-model that draws per-datum drag handles
// reads the SAME selection the props panel does. This context is now a thin
// React adapter over that store (useSyncExternalStore), preserving the existing
// `{ selected, select }` API for ChartSection / ChartBlock.

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { type ChartElementRef, chartElementStore } from "./chart-element-store.js";

export type { ChartElementRef } from "./chart-element-store.js";

export interface ChartElementSelection {
  readonly selected: ChartElementRef | null;
  readonly select: (ref: ChartElementRef | null) => void;
}

const NULL_SELECTION: ChartElementSelection = { selected: null, select: () => undefined };

const ChartElementSelectionContext = createContext<ChartElementSelection | null>(null);

export function ChartElementSelectionProvider({ children }: { readonly children: ReactNode }) {
  const selected = useSyncExternalStore(
    chartElementStore.subscribe,
    chartElementStore.get,
    () => null,
  );
  const value = useMemo<ChartElementSelection>(
    () => ({ selected, select: chartElementStore.set }),
    [selected],
  );
  // DEV / e2e — expose the element-selection store (same gating as the other
  // `window.__weave*` diagnostics; stripped from production bundles) so a test
  // can drive the exact selection a real mark click produces.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __weaveChartElement?: typeof chartElementStore }).__weaveChartElement =
      chartElementStore;
  }, []);
  return (
    <ChartElementSelectionContext.Provider value={value}>
      {children}
    </ChartElementSelectionContext.Provider>
  );
}

/** Safe outside a provider — reads the shared store directly so the toolbar and
 *  the view-model always agree even if a consumer mounts without the provider. */
export function useChartElementSelection(): ChartElementSelection {
  const ctx = useContext(ChartElementSelectionContext);
  const selected = useSyncExternalStore(
    chartElementStore.subscribe,
    chartElementStore.get,
    () => null,
  );
  return ctx ?? { ...NULL_SELECTION, selected, select: chartElementStore.set };
}
