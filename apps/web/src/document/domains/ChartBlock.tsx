// WI-077/078 — chart content View (DR-031 data / DR-032 ECharts / DR-035 items).
//
// WI-243 / DR-160 — split into ViewModel + pure View. ALL non-render concerns
// (dataset resolution, encoding migration, plottability, the drill-selection
// FSM, click→role intent) now live in `chart/chart-item-view-model.ts`. This
// file is the PURE View (`ChartView`, renders from `{ item, vm }` only — no
// Context, no store, no derivation) plus a thin `ChartBlock` shim that calls the
// hook. `ChartView` is exported so the Phase-0 spec facet (HANDOFF-002) can wire
// `view: ChartView` / `useViewModel: useChartItemViewModel` with no further edit.
//
// A `chart` owns no data: the VM resolves its dataset (referenced by
// `attrs.datasetId`) and derives the visual. Because the doc is immutable, a
// `weave.dataset.update` produces a new snapshot → a new resolver → the VM
// returns fresh `echartProps` → this View re-renders with new data. An
// empty/dangling `datasetId` or an empty encoding yields `status: "empty"` → the
// "데이터 없음" placeholder, never a crash (DR-031).
//
// Rendering: the data MARKS (bars/lines/slices) are drawn by ECharts
// (SVGRenderer, lazy-loaded). The category LABELS are real weave `text` child
// Items (DR-035), so this View stays a thin shell: placeholder + lazy ECharts +
// the VM-owned mark/legend/background click bridge.

import { type JSX, lazy, Suspense } from "react";
import type { AgoItem } from "../types.js";
import { type ChartItemVm, useChartItemViewModel } from "./chart/chart-item-view-model.js";
import { ChartErrorBoundary } from "./chart/ChartErrorBoundary.js";

// The ONLY reference to the echarts-backed renderer is this dynamic import, so
// echarts is code-split into a separate chunk loaded on first chart render.
const EChartView = lazy(() => import("./chart/echarts-renderer.js"));

interface ChartBlockProps {
  readonly item: AgoItem<"chart">;
}

function Placeholder({ opacity }: { readonly opacity: number }): JSX.Element {
  return (
    <div
      data-testid="chart-block"
      data-chart-empty="true"
      className="absolute inset-0 grid place-items-center rounded-[var(--radius-sm)] border border-dashed border-[color:var(--surface-2-border)] text-[color:var(--text-soft)]"
      style={{ opacity }}
    >
      <span className="text-[11px]">차트 — 데이터 없음</span>
    </div>
  );
}

/** Pure content View for a chart item — renders from `{ item, vm }` ONLY (no
 *  Context / store / derivation). `empty` → placeholder; `ready` → lazy ECharts
 *  wrapped in the per-item error boundary, with the VM's click intents. */
export function ChartView({
  item,
  vm,
}: {
  readonly item: AgoItem<"chart">;
  readonly vm: ChartItemVm;
}): JSX.Element {
  if (vm.status === "empty") return <Placeholder opacity={vm.opacity} />;

  return (
    <div
      data-testid="chart-block"
      data-chart-type={vm.echartProps.chartType}
      data-chart-rows={vm.echartProps.rows.length}
      className="absolute inset-0"
      style={{ opacity: vm.opacity }}
    >
      {/* WI-172 — boundary scopes a throwing chart to THIS item (placeholder)
          instead of unmounting the whole canvas tree and cascade-failing
          subsequent agent execs. */}
      <ChartErrorBoundary chartItemId={String(item.id)} opacity={vm.opacity}>
        <Suspense fallback={<div data-testid="chart-loading" className="absolute inset-0" />}>
          <EChartView
            {...vm.echartProps}
            onElementClick={vm.onElementClick}
            onLegendClick={vm.onLegendClick}
            onBackgroundClick={vm.onBackgroundClick}
          />
        </Suspense>
      </ChartErrorBoundary>
    </div>
  );
}

/** Registered renderer (FrameSurface looks this up by `item.kind`). Thin shim:
 *  resolve the ViewModel, then render the pure View. WI-243 transitional — the
 *  Phase-0 spec facet will register `useViewModel`/`view` and derive the renderer
 *  via `makeKindRenderer`, retiring this shim. */
export function ChartBlock({ item }: ChartBlockProps): JSX.Element {
  const vm = useChartItemViewModel(item);
  return <ChartView item={item} vm={vm} />;
}
