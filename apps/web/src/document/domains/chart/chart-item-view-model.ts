// WI-243 / DR-160 — chart content ViewModel (per-item, content surface).
//
// Owns everything the chart's content View needs that is NOT pure render:
//   • Model resolution — attrs + the referenced dataset store (a chart owns no
//     data of its own; DR-031). doc is immutable, so a dataset update yields a
//     fresh resolver → a fresh `data` → a re-render with new rows.
//   • Derivation — encoding migration, plottability → an `empty | ready` status
//     the View switches on (a plain view-state string, NOT a kind/role/mode
//     discriminant — Rule 6 safe).
//   • Drill-selection FSM — an inner mark/legend is selectable only once the
//     chart ITEM is already selected (WI-092). The pre-click selection is read
//     IMPERATIVELY from the editor vm (no reactive subscription), which still
//     sees the pre-click state because ECharts' direct listener fires before
//     React's delegated onClick that selects the chart.
//   • Intent — the three click handlers, mapping click→role via the per-family
//     registries (`markSelection` / `legendSelection`, DR-037).
//
// This hook touches NO DOM and NO echarts instance (that is echarts-renderer's
// job) → it is `renderHook`-testable with a fake `resolve` + a fake selection
// vm, with no canvas. The paired pure View lives in ChartBlock.tsx.
//
// NOTE (WI-243 transitional): until the Phase-0 spec-facet scaffold lands
// (HANDOFF-002 → WI-241 session: required `useViewModel` + `view` on
// DomainKindSpec, renderer derived via makeKindRenderer), ChartBlock stays the
// registered renderer and calls this hook directly. The flip to
// `useViewModel: useChartItemViewModel, view: ChartView` is then a one-line
// SPECS edit with no change here.

import { useCallback, useContext, useMemo } from "react";
import { useResolveDataset } from "../../dataset/dataset-context.js";
import type { DatasetPayload } from "../../dataset/dataset-store.js";
import { SelectionVmContext } from "../../interactions/selection-context.js";
import type { AgoItem } from "../../types.js";
import { useChartElementSelection } from "./chart-element-context.js";
import { type ChartEncoding, migrateEncoding } from "./chart-model.js";
import { legendSelection, markSelection } from "./chart-selection.js";
import { requiredChannelsSatisfied } from "./chart-types.js";
import type { ChartClickInfo } from "./echarts-option.js";
import type { EChartViewProps } from "./echarts-renderer.js";

const DEFAULT_PALETTE: ReadonlyArray<string> = [
  "var(--accent)",
  "var(--domain-canvas-accent)",
  "var(--domain-media-accent)",
  "var(--domain-block-accent)",
];

/** The render-input bundle the View spreads onto `<EChartView>` — every prop
 *  except the three click handlers (carried as their own VM fields). */
export type ChartEChartProps = Omit<
  EChartViewProps,
  "onElementClick" | "onLegendClick" | "onBackgroundClick"
>;

/** View-state for a chart item. `empty` → placeholder; `ready` → the marks +
 *  the click intents. A plain status discriminant, deliberately not `role`. */
export type ChartItemVm =
  | { readonly status: "empty"; readonly opacity: number }
  | {
      readonly status: "ready";
      readonly opacity: number;
      readonly echartProps: ChartEChartProps;
      readonly onElementClick: (info: ChartClickInfo) => void;
      readonly onLegendClick: (name: string) => void;
      readonly onBackgroundClick: () => void;
    };

/** Imperative, SSR-safe read of whether `id` is (among) the selected item(s).
 *  Reads the vm store directly — no reactive subscription (so it neither needs a
 *  server snapshot nor re-renders), and at ECharts-click time it still reflects
 *  the pre-click selection. (Moved verbatim from ChartBlock — WI-243.) */
function isChartSelected(vm: unknown, id: string): boolean {
  const get = (
    vm as
      | {
          itemSelection?: {
            state?: { get?: () => { kind: string; itemId?: unknown; items?: Iterable<unknown> } };
          };
        }
      | undefined
  )?.itemSelection?.state?.get;
  if (typeof get !== "function") return false;
  const s = get();
  if (s.kind === "single") return String(s.itemId) === id;
  if (s.kind === "multi" && s.items !== undefined) {
    for (const it of s.items) if (String(it) === id) return true;
  }
  return false;
}

export function useChartItemViewModel(item: AgoItem<"chart">): ChartItemVm {
  const a = item.attrs;
  const id = String(item.id);
  const opacity = a.opacity ?? 1;
  const chartType = a.chartType;

  // ── Model resolution: attrs + referenced dataset store ──
  const resolve = useResolveDataset();
  const data = a.datasetId === "" ? undefined : resolve(a.datasetId);
  // DR-036 — resolve the channel encoding (migrating legacy {category,values}).
  const encoding = useMemo<ChartEncoding>(() => migrateEncoding(a.encoding), [a.encoding]);

  // ── DI: element-selection intent sink + (drill) current-selection vm ──
  const { select } = useChartElementSelection();
  const selectionVm = useContext(SelectionVmContext);

  // ── Drill FSM + click intents (all hooks unconditional, before any return) ──
  const drillReady = useCallback(() => isChartSelected(selectionVm, id), [selectionVm, id]);
  const onElementClick = useCallback(
    (info: ChartClickInfo) => {
      if (!drillReady()) return;
      select({ chartItemId: id, ...markSelection(chartType, info) });
    },
    [drillReady, select, id, chartType],
  );
  const onLegendClick = useCallback(
    (name: string) => {
      if (!drillReady()) return;
      select({ chartItemId: id, ...legendSelection(chartType, name) });
    },
    [drillReady, select, id, chartType],
  );
  const onBackgroundClick = useCallback(() => select(null), [select]);

  // ── Derivation: plottability → status ──
  const plottable =
    data !== undefined && data.rows.length > 0 && requiredChannelsSatisfied(chartType, encoding);

  if (!plottable) return { status: "empty", opacity };

  const dataset = data as DatasetPayload; // guarded by `plottable`.
  const echartProps: ChartEChartProps = {
    chartItemId: id,
    rows: dataset.rows,
    encoding,
    chartType,
    palette: a.palette ?? DEFAULT_PALETTE,
    showAxis: a.showAxis !== false,
    showLegend: a.showLegend !== false,
    ...(a.barWidth !== undefined ? { barWidth: a.barWidth } : {}),
    ...(a.variant?.innerRadius !== undefined ? { innerRadius: a.variant.innerRadius } : {}),
    ...(a.overrides !== undefined ? { overrides: a.overrides } : {}),
  };

  return {
    status: "ready",
    opacity,
    echartProps,
    onElementClick,
    onLegendClick,
    onBackgroundClick,
  };
}
