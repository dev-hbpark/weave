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

import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { init, use } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { type JSX, useEffect, useRef } from "react";
import type { ChartType } from "./chart-model.js";
import { buildChartOption } from "./chart-types.js";
import type { ChartClickInfo, ChartRenderInput } from "./echarts-option.js";

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

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
  /** Fired when a mark (bar / slice) is clicked. */
  readonly onElementClick?: (info: ChartClickInfo) => void;
  /** DR-037 — fired when a legend item is clicked (the legend acts as a series
   *  selector, not a visibility toggle). */
  readonly onLegendClick?: (name: string) => void;
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

  // Mount once: init the SVG-rendered instance + track frame resizes + wire the
  // mark-click → onElementClick bridge.
  useEffect(() => {
    const el = elRef.current;
    if (el === null) return;
    const chart = init(el, null, { renderer: "svg" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    chart.on("click", (p: unknown) => {
      const param = p as {
        name?: string;
        seriesName?: string;
        value?: unknown;
        dataIndex?: number;
      };
      const value = typeof param.value === "number" ? param.value : Number(param.value);
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
    return () => {
      ro.disconnect();
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
    props.overrides,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the
  // serialized digest of every option input; depending on it is the intent.
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
