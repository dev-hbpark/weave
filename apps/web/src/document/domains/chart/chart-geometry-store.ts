// WI-092 — registry of live chart GEOMETRY PROVIDERS, keyed by chart item id.
//
// Each mounted `EChartView` publishes a provider closing over its laid-out
// echarts instance + container element (the only place that can answer "where on
// screen is this bar's top?" and "what value is the cursor at?"). The
// SelectionLayer view-model — which has no access to the echarts instance — reads
// the provider for the selected chart item to place + drive its drag handles.
//
// Subscribable (like `vertexSelection`) so a handle re-renders the moment a
// chart's geometry becomes available (first layout) or changes (resize / data
// edit), without a parent re-render. The provider's own methods read live state
// at call time, so re-registration is only needed when the instance is replaced.

import { useSyncExternalStore } from "react";
import type { ChartElementRef } from "./chart-element-store.js";

/** What a handle's drag controls — the view-model routes the write by this
 *  (Rule 6: a strategy per kind, no switch in the drag loop):
 *    • `value`            — the datum's dataset cell (bar height / line point / pie sweep / gauge dial)
 *    • `point`            — a scatter/bubble point's (x, y) dataset cells (2-D drag)
 *    • `bar-width`        — the chart's `barWidth` attr (bar thickness; all bars)
 *    • `pie-inner-radius` — the chart's `variant.innerRadius` (donut hole). */
export type ChartHandleKind =
  | "value"
  | "point"
  | "bar-width"
  | "global-bar-width"
  | "pie-inner-radius";

/** What a single drag move resolves to: a scalar (value / fraction / dial) for
 *  the 1-D handles, or an `{x, y}` pair for the 2-D `point` (scatter) handle.
 *  Discriminated by `typeof` at the write site (no per-kind branch in the geometry). */
export type ChartHandleValue = number | { readonly x: number; readonly y: number };

/** A weave-owned drag handle's anchor in CLIENT (screen) coordinates, plus the
 *  axis the drag is constrained to (drives the cursor + the value mapping). */
export interface ChartHandleAnchor {
  readonly x: number;
  readonly y: number;
  /** `y` — cartesian vertical value drag (bar/line/area height). `x` — horizontal
   *  bar-thickness drag. `angular` — pie sweep / gauge dial around the arc.
   *  `radial` — pie donut inner-radius (toward / away from the center). `free` —
   *  unconstrained 2-D drag (a scatter point moves in both x and y). */
  readonly axis: "y" | "x" | "angular" | "radial" | "free";
}

/** One weave-owned handle for the selected element: where it sits + what a drag
 *  maps to. `valueAtClient` reads the LIVE geometry at call time (fresh during a
 *  drag), so the spec stays correct as the chart moves. */
export interface ChartHandleSpec {
  readonly kind: ChartHandleKind;
  readonly anchor: ChartHandleAnchor;
  /** Which bar this handle is for (chart-level `global-bar-width` handles use it
   *  to reveal only the hovered bar's handle). */
  readonly rowIndex?: number;
  /** Map a live drag client position to this handle's new value — a scalar
   *  (dataset value / `barWidth` fraction / dial value) or an `{x, y}` pair (the
   *  scatter `point` handle); null when not resolvable. */
  valueAtClient(clientX: number, clientY: number): ChartHandleValue | null;
}

/** The selected element's bounding box in CLIENT coordinates — the outline that
 *  wraps the mark (the "바운드"), with the handles sitting on its edges. Only
 *  families with a rectangular mark (bar) report one; pie slices / line points
 *  return null (they keep handles without a box). */
export interface ChartElementBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ChartGeometryProvider {
  /** Every weave-owned handle for `ref`, in render order; empty when the element
   *  can't be resolved (not found / chart not laid out / family has none). */
  handles(ref: ChartElementRef): ReadonlyArray<ChartHandleSpec>;
  /** The selected mark's bounding box (client coords) for the selection outline,
   *  or null when the family has no rectangular bound. */
  bounds(ref: ChartElementRef): ChartElementBounds | null;
  /** WI-092 — CHART-level width handles: one per bar (single-series bar only),
   *  each dragging the GLOBAL `barWidth`. Shown when the chart item is selected
   *  but no single bar is drilled into. Empty for non-bar / grouped charts. */
  barWidthHandles(): ReadonlyArray<ChartHandleSpec>;
}

const providers = new Map<string, ChartGeometryProvider>();
const listeners = new Set<() => void>();
let version = 0;
function emit(): void {
  version++;
  for (const l of listeners) l();
}

export const chartGeometryStore = {
  /** Publish (or replace) the provider for a chart item. Returns a disposer that
   *  removes exactly this provider (no-op if already replaced). */
  register(itemId: string, provider: ChartGeometryProvider): () => void {
    providers.set(itemId, provider);
    emit();
    return () => {
      if (providers.get(itemId) === provider) {
        providers.delete(itemId);
        emit();
      }
    };
  },
  get(itemId: string): ChartGeometryProvider | undefined {
    return providers.get(itemId);
  },
  /** Signal that an existing provider's geometry changed (resize / re-layout) so
   *  subscribed handles reposition. */
  invalidate(): void {
    emit();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  getVersion(): number {
    return version;
  },
};

/** Reactive accessor: the provider for `itemId`, re-read whenever any provider
 *  registers / disposes / invalidates. */
export function useChartGeometry(itemId: string): ChartGeometryProvider | undefined {
  useSyncExternalStore(chartGeometryStore.subscribe, chartGeometryStore.getVersion, () => 0);
  return chartGeometryStore.get(itemId);
}
