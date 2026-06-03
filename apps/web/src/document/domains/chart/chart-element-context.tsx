// WI-078 (DR-035) — ChartElementSelection context. Bridges an intra-chart mark
// click (deep inside FrameSurface, in ChartBlock) to the editing surface
// (ChartSection in the contextual toolbar) without prop-drilling — the same
// React-context pattern as DatasetContext. The selection is NOT a weave item;
// it's a transient "which bar/slice is being emphasis-edited" pointer, keyed by
// the chart item id + the category (stable key for overrides).

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

export interface ChartElementRef {
  readonly chartItemId: string;
  /** DR-037 — selection level. `datum` = one bar/slice (mark click). `series` =
   *  a whole series (legend click) → edits apply to all its datums. (Category
   *  labels are NOT selected here — they are real text Items; see DR-035.) */
  readonly role: "series" | "datum";
  /** Series name (legend / series-override key). Set for both roles. */
  readonly seriesName?: string | undefined;
  /** Datum category (per-datum override key). Set for `datum`. */
  readonly category?: string | undefined;
  /** Dataset row index of the clicked mark. Set for `datum`. */
  readonly rowIndex?: number | undefined;
  readonly value?: number | undefined;
}

export interface ChartElementSelection {
  readonly selected: ChartElementRef | null;
  readonly select: (ref: ChartElementRef | null) => void;
}

const NULL_SELECTION: ChartElementSelection = { selected: null, select: () => undefined };

const ChartElementSelectionContext = createContext<ChartElementSelection>(NULL_SELECTION);

export function ChartElementSelectionProvider({ children }: { readonly children: ReactNode }) {
  const [selected, setSelected] = useState<ChartElementRef | null>(null);
  const value = useMemo<ChartElementSelection>(
    () => ({ selected, select: setSelected }),
    [selected],
  );
  return (
    <ChartElementSelectionContext.Provider value={value}>
      {children}
    </ChartElementSelectionContext.Provider>
  );
}

/** Safe outside a provider (returns the null selection). */
export function useChartElementSelection(): ChartElementSelection {
  return useContext(ChartElementSelectionContext);
}
