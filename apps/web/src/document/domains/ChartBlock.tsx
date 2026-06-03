// WI-077/078 — ChartBlock renderer (DR-031 data / DR-032 ECharts / DR-035 items).
//
// A `chart` owns no data: it resolves its dataset (referenced by
// `attrs.datasetId`) from the root-unit store via `useResolveDataset()` and
// derives the visual from the resolved rows at render time. Because the doc is
// immutable, a `weave.dataset.update` produces a new snapshot → a new resolver
// (DatasetProvider memo) → this component re-renders with fresh data.
//
// Graceful refs (DR-031): an empty/dangling `datasetId` or an empty encoding
// render the "데이터 없음" placeholder — never a crash.
//
// Rendering: the data MARKS (bars/lines/slices) are drawn by ECharts
// (SVGRenderer, lazy-loaded). The category LABELS are NOT drawn here — they are
// real weave `text` child Items, materialized + positioned by the
// `useChartLabelSync` controller (DR-035). ECharts' own category text is hidden
// (echarts-option). So ChartBlock is a thin shell: placeholder + lazy ECharts +
// the mark-click → element-selection bridge.

import { type JSX, lazy, Suspense } from "react";
import { useResolveDataset } from "../dataset/dataset-context.js";
import type { DatasetPayload } from "../dataset/dataset-store.js";
import type { AgoItem } from "../types.js";
import { useChartElementSelection } from "./chart/chart-element-context.js";
import { type ChartEncoding, type ChartType, migrateEncoding } from "./chart/chart-model.js";
import { legendSelection, markSelection } from "./chart/chart-selection.js";
import { requiredChannelsSatisfied } from "./chart/chart-types.js";

// The ONLY reference to the echarts-backed renderer is this dynamic import, so
// echarts is code-split into a separate chunk loaded on first chart render.
const EChartView = lazy(() => import("./chart/echarts-renderer.js"));

interface ChartBlockProps {
  readonly item: AgoItem<"chart">;
}

const DEFAULT_PALETTE: ReadonlyArray<string> = [
  "var(--accent)",
  "var(--domain-canvas-accent)",
  "var(--domain-media-accent)",
  "var(--domain-block-accent)",
];

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

/** Whether a resolved dataset + (migrated) encoding has anything plottable —
 *  i.e. the chart type's required channels are all bound. */
function isPlottable(
  data: DatasetPayload | undefined,
  chartType: ChartType,
  encoding: ChartEncoding,
): boolean {
  if (data === undefined) return false;
  if (data.rows.length === 0) return false;
  return requiredChannelsSatisfied(chartType, encoding);
}

export function ChartBlock({ item }: ChartBlockProps): JSX.Element {
  const a = item.attrs;
  const opacity = a.opacity ?? 1;
  const resolve = useResolveDataset();
  const { select } = useChartElementSelection();
  const data = a.datasetId === "" ? undefined : resolve(a.datasetId);
  // DR-036 — resolve the channel encoding (migrating legacy {category,values}).
  const encoding = migrateEncoding(a.encoding);

  if (!isPlottable(data, a.chartType, encoding)) {
    return <Placeholder opacity={opacity} />;
  }
  const dataset = data as DatasetPayload; // guarded by isPlottable.

  return (
    <div
      data-testid="chart-block"
      data-chart-type={a.chartType}
      data-chart-rows={dataset.rows.length}
      className="absolute inset-0"
      style={{ opacity }}
    >
      <Suspense fallback={<div data-testid="chart-loading" className="absolute inset-0" />}>
        <EChartView
          rows={dataset.rows}
          encoding={encoding}
          chartType={a.chartType}
          palette={a.palette ?? DEFAULT_PALETTE}
          showAxis={a.showAxis !== false}
          showLegend={a.showLegend !== false}
          overrides={a.overrides}
          onElementClick={(info) =>
            // DR-037 — the click→role mapping is a per-family registry (Rule 6),
            // not an inline chartType check: cartesian mark = datum, radar mark =
            // the whole polygon (series), etc.
            select({ chartItemId: String(item.id), ...markSelection(a.chartType, info) })
          }
          onLegendClick={(name) =>
            select({ chartItemId: String(item.id), ...legendSelection(a.chartType, name) })
          }
        />
      </Suspense>
    </div>
  );
}
