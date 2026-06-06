// WI-077/078 — lazy ECharts renderer (DR-032 / DR-035). This module is the ONLY
// place echarts is imported, and it is reached exclusively through a dynamic
// import (React.lazy in ChartBlock), so the ~150KB+ chart library lands in its
// own chunk and never touches the main bundle — it loads on demand the first
// time a chart actually renders.
//
// SVGRenderer (not canvas) so the chart scales crisply under weave's
// CSS-transform canvas zoom, matching every other vector primitive.
//
// WI-087 — only the CORE series (bar/line/area/pie + grid/legend/tooltip) are
// registered statically here. The other 10 families' modules load on demand via
// `import("./echarts-advanced")` (a separate lazy chunk) the first time one is
// rendered, so common-chart designs download a smaller echarts bundle.
//
// WI-078: clicking a mark (bar / slice) reports `{ category, seriesName, value }`
// so the host can select + emphasis-edit that element.

import { BarChart, CustomChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { init, use } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { type JSX, useEffect, useRef } from "react";
import { createChartGeometryProvider, type EchartsLike } from "./chart-geometry-provider.js";
import { chartGeometryStore } from "./chart-geometry-store.js";
import { chartHoverStore } from "./chart-hover-store.js";
import type { ChartType } from "./chart-model.js";
import { buildChartOption } from "./chart-types.js";
import {
  barFracFor,
  type ChartClickInfo,
  type ChartRenderInput,
  DEFAULT_BAR_FRAC,
} from "./echarts-option.js";

// WI-092 — CustomChart powers the per-bar-width single-series bar (renderItem).
use([
  BarChart,
  CustomChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);

// Chart types whose modules are statically registered above. Everything else
// needs the on-demand advanced chunk before `setOption`.
const CORE_TYPES: ReadonlySet<ChartType> = new Set(["bar", "line", "area", "pie"]);

// Resolves once the advanced module chunk has registered its series (module-
// level, shared across all chart instances). `undefined` until first requested.
let advancedLoad: Promise<void> | undefined;
function ensureAdvanced(): Promise<void> {
  advancedLoad ??= import("./echarts-advanced.js").then(() => undefined);
  return advancedLoad;
}

export type EChartViewProps = ChartRenderInput & {
  /** WI-092 — the owning chart item's id, so this view can publish its geometry
   *  provider (handle placement / value mapping) into the shared store keyed by
   *  item id. Omitted only in isolated option-builder tests. */
  readonly chartItemId?: string;
  /** Fired when a mark (bar / slice) is clicked. */
  readonly onElementClick?: (info: ChartClickInfo) => void;
  /** DR-037 — fired when a legend item is clicked (the legend acts as a series
   *  selector, not a visibility toggle). */
  readonly onLegendClick?: (name: string) => void;
  /** WI-092 — fired when the chart's BLANK area (not a mark) is clicked, so the
   *  host can drop the datum (bar) selection and return to the whole-chart level
   *  while keeping the chart item itself selected. */
  readonly onBackgroundClick?: () => void;
};

/** Default export so `React.lazy(() => import("./echarts-renderer.js"))` works.
 *  Owns an echarts instance on a frame-filling div; rebuilds the option on data
 *  change and resizes with the frame. */
export default function EChartView(props: EChartViewProps): JSX.Element {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof init> | null>(null);
  // Latest click handlers, read by the once-registered echarts listeners.
  const onClickRef = useRef(props.onElementClick);
  onClickRef.current = props.onElementClick;
  const onLegendRef = useRef(props.onLegendClick);
  onLegendRef.current = props.onLegendClick;
  const onBgRef = useRef(props.onBackgroundClick);
  onBgRef.current = props.onBackgroundClick;
  // WI-092 — live overrides + chart-wide default, read by the geometry provider's
  // `barFracAt` so the width handle/bound track the SELECTED bar's per-datum width.
  const geomRef = useRef({ overrides: props.overrides, barWidth: props.barWidth });
  geomRef.current = { overrides: props.overrides, barWidth: props.barWidth };
  // Read by the mount-once effect so a late-arriving id still registers correctly.
  const itemIdRef = useRef(props.chartItemId);
  itemIdRef.current = props.chartItemId;

  // Mount once: init the SVG-rendered instance + track frame resizes + wire the
  // mark-click → onElementClick bridge.
  useEffect(() => {
    const el = elRef.current;
    if (el === null) return;
    const chart = init(el, null, { renderer: "svg" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => {
      chart.resize();
      // The plot area moved → any drag handle anchored to it must reposition.
      chartGeometryStore.invalidate();
    });
    ro.observe(el);
    // WI-092 — publish this chart's geometry provider so the SelectionLayer
    // view-model can place + drive weave-owned drag handles. The provider reads
    // the live instance + element at call time, so it survives data re-renders.
    const itemId = itemIdRef.current;
    const unregister =
      itemId !== undefined
        ? chartGeometryStore.register(
            itemId,
            createChartGeometryProvider({
              getChart: () => chartRef.current as EchartsLike | null,
              getEl: () => elRef.current,
              barFracAt: (ref) => {
                const g = geomRef.current;
                const globalFrac =
                  g.barWidth !== undefined && g.barWidth > 0
                    ? Math.min(1, g.barWidth)
                    : DEFAULT_BAR_FRAC;
                return barFracFor(
                  ref.seriesName ?? "",
                  ref.category ?? "",
                  g.overrides,
                  globalFrac,
                );
              },
            }),
          )
        : undefined;
    // DEV / e2e — expose the geometry store (same gating as the other
    // `window.__weave*` diagnostics; stripped from production).
    if (import.meta.env.DEV) {
      (
        window as unknown as { __weaveChartGeometry?: typeof chartGeometryStore }
      ).__weaveChartGeometry = chartGeometryStore;
    }
    chart.on("click", (p: unknown) => {
      const param = p as {
        name?: string;
        seriesName?: string;
        value?: unknown;
        dataIndex?: number;
      };
      // WI-092 — the custom (per-bar-width) bar series carries `value` as the
      // `[catIndex, value]` tuple; the normal series carries a scalar. Take the
      // magnitude from the last element either way.
      const raw = Array.isArray(param.value) ? param.value[param.value.length - 1] : param.value;
      const value = typeof raw === "number" ? raw : Number(raw);
      onClickRef.current?.({
        category: String(param.name ?? ""),
        seriesName: param.seriesName,
        value: Number.isFinite(value) ? value : 0,
        dataIndex: typeof param.dataIndex === "number" ? param.dataIndex : -1,
      });
    });
    // DR-037 — legend click selects the series (not toggles visibility): report
    // it, then restore all items so nothing is hidden.
    chart.on("legendselectchanged", (p: unknown) => {
      const name = (p as { name?: string }).name;
      if (name === undefined) return;
      onLegendRef.current?.(name);
      chart.dispatchAction({ type: "legendAllSelect" });
    });
    // WI-092 — a click on the BLANK plot (zrender click with no shape target;
    // the high-level `chart.on("click")` above only fires for marks) drops the
    // datum selection → back to the whole-chart level.
    chart.getZr().on("click", (e: { target?: unknown }) => {
      if (e.target === undefined || e.target === null) onBgRef.current?.();
    });
    // WI-092 — hover a mark → publish the hovered bar so the chart-level width
    // handle for THAT bar reveals (handles stay hidden otherwise). A short
    // debounce on `mouseout` lets a bar→bar move (out then over) not flicker and
    // lets a handle's own hover pin it before the clear fires.
    let hoverClear: ReturnType<typeof setTimeout> | undefined;
    chart.on("mouseover", (p: unknown) => {
      const di = (p as { dataIndex?: number }).dataIndex;
      const id = itemIdRef.current;
      if (id === undefined || typeof di !== "number" || di < 0) return;
      clearTimeout(hoverClear);
      chartHoverStore.set({ chartItemId: id, rowIndex: di });
    });
    chart.on("mouseout", () => {
      const id = itemIdRef.current;
      if (id === undefined) return;
      clearTimeout(hoverClear);
      hoverClear = setTimeout(() => chartHoverStore.clearItem(id), 60);
    });
    return () => {
      ro.disconnect();
      unregister?.();
      clearTimeout(hoverClear);
      if (itemIdRef.current !== undefined) chartHoverStore.clearItem(itemIdRef.current);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Re-apply the option whenever the resolved data / encoding / overrides change.
  // `notMerge` = true so removing a series/row doesn't leave a ghost. Keyed on a
  // stable serialization to avoid redundant setOption on unrelated re-renders.
  const key = JSON.stringify([
    props.chartType,
    props.encoding,
    props.rows,
    props.palette,
    props.showAxis,
    props.showLegend,
    props.barWidth,
    props.innerRadius,
    props.overrides,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the
  // serialized digest of every option input; depending on it is the intent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  useEffect(() => {
    let cancelled = false;
    const apply = (): void => {
      const chart = chartRef.current;
      const el = elRef.current;
      if (cancelled || chart === null || el === null) return;
      // Theme the ECharts-drawn text to match weave. The SVG renderer can't
      // resolve CSS vars, so read the RESOLVED font + colour off the (themed)
      // container and pass literals; also resolve the palette / visualMap ramp
      // `var(--token)` colours. (Theme switches reflect on the next re-render.)
      const cs = getComputedStyle(el);
      const resolveVar = (raw: unknown): unknown => {
        if (typeof raw !== "string") return raw;
        const token = raw.match(/^var\((--[^),]+)\)$/)?.[1];
        if (token === undefined) return raw;
        const v = cs.getPropertyValue(token).trim();
        return v !== "" ? v : raw;
      };
      const opt = buildChartOption(props);
      if (Array.isArray(opt.color)) opt.color = opt.color.map(resolveVar);
      const vm = opt.visualMap as { inRange?: { color?: unknown[] } } | undefined;
      if (vm?.inRange?.color !== undefined && Array.isArray(vm.inRange.color)) {
        vm.inRange.color = vm.inRange.color.map(resolveVar);
      }
      opt.textStyle = { fontFamily: cs.fontFamily, color: cs.color };
      chart.setOption(opt, true);
      // New layout (bars/slices moved) → reposition any live drag handle.
      chartGeometryStore.invalidate();
    };
    // Advanced types need their modules registered first (WI-087) — load the
    // on-demand chunk, then render; core types render immediately.
    if (CORE_TYPES.has(props.chartType)) {
      apply();
    } else {
      void ensureAdvanced().then(apply);
    }
    return () => {
      cancelled = true;
    };
  }, [key]);

  return <div ref={elRef} data-testid="chart-echarts" className="absolute inset-0" />;
}
