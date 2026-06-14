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
import { pointerWithinRects } from "../../interactions/handle-hysteresis.js";

/** Viewport rects of this chart's currently-visible datum handles. Chart
 *  handles are portaled `<button data-chart-handle="<id>">` elements that
 *  drop `data-handle-hidden` while revealed. Used by the hover-clear path
 *  for handle-area hysteresis (parity with the general selection handles
 *  in `handle-hysteresis`): the hovered datum is kept while the pointer is
 *  still within reach of its handles, so the user can travel from the mark
 *  onto a handle without it vanishing first. */
function visibleChartHandleRects(chartItemId: string): DOMRect[] {
  if (typeof document === "undefined") return [];
  const esc =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(chartItemId)
      : chartItemId;
  const rects: DOMRect[] = [];
  document
    .querySelectorAll(`[data-chart-handle="${esc}"]:not([data-handle-hidden])`)
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push(r);
    });
  return rects;
}

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

/** WI-195 — the per-bar-width CUSTOM bar series is `silent` (a non-silent custom
 *  series re-invokes renderItem on every hover → whole-chart flicker), so its
 *  marks emit no ECharts mouse events. weave hit-tests them at the zrender level
 *  instead. Given a container-pixel point, returns the hit bar's click info, or
 *  null when the series isn't custom / the point is outside a bar. The full
 *  category band is the hit area (clicking the column selects that bar), bounded
 *  vertically to the bar's value extent so the empty plot above stays "blank". */
function customBarHitAt(
  chart: ReturnType<typeof init>,
  x: number,
  y: number,
): ChartClickInfo | null {
  const opt = chart.getOption() as {
    series?: ReadonlyArray<{ type?: string; name?: string; data?: unknown }>;
  };
  const s0 = opt.series?.[0];
  if (s0?.type !== "custom") return null;
  if (!chart.containPixel({ gridIndex: 0 }, [x, y])) return null;
  const coord = chart.convertFromPixel({ seriesIndex: 0 }, [x, y]);
  if (!Array.isArray(coord)) return null;
  const idx = Math.round(coord[0] ?? -1);
  const yVal = coord[1] ?? Number.NaN;
  const item = (s0.data as ReadonlyArray<{ name?: string; value?: unknown }> | undefined)?.[idx];
  if (item === undefined || item === null) return null;
  const raw = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value;
  const barVal = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(barVal) || !Number.isFinite(yVal)) return null;
  // Inside the bar's vertical span (0..value), not the blank plot above it.
  if (yVal < Math.min(0, barVal) || yVal > Math.max(0, barVal)) return null;
  return {
    category: String(item.name ?? ""),
    seriesName: s0.name,
    value: barVal,
    dataIndex: idx,
  };
}

/** True when the laid-out chart uses the silent custom (per-bar-width) series. */
function isCustomBarChart(chart: ReturnType<typeof init>): boolean {
  const opt = chart.getOption() as { series?: ReadonlyArray<{ type?: string }> };
  return opt.series?.[0]?.type === "custom";
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
  // Latest pointer position in viewport coords, fed to the hover-clear
  // hysteresis so it can tell whether the pointer drifted onto a handle.
  const pointerRef = useRef({ x: 0, y: 0 });

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
    // WI-092 — hover a mark → publish the hovered bar so the chart-level width
    // handle for THAT bar reveals (handles stay hidden otherwise). A short
    // debounce on `mouseout` lets a bar→bar move (out then over) not flicker and
    // lets a handle's own hover pin it before the clear fires.
    let hoverClear: ReturnType<typeof setTimeout> | undefined;
    // Track the pointer in viewport coords so the clear path can run the
    // handle-area hysteresis (chart handles are position:fixed, i.e. in
    // client coords).
    const trackPointer = (e: PointerEvent): void => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", trackPointer, { passive: true, capture: true });
    // The pointer leaving the viewport entirely (not onto a portaled
    // handle, which stays inside the document) must drop the hover at once
    // — the hysteresis poll below would otherwise keep re-evaluating a
    // stale pointer position. Moving onto a handle button does NOT fire
    // this, so it does not defeat the hysteresis.
    const forceClear = (): void => {
      const id = itemIdRef.current;
      if (id === undefined) return;
      clearTimeout(hoverClear);
      chartHoverStore.clearItem(id);
    };
    document.documentElement.addEventListener("pointerleave", forceClear);
    const clearHoverSoon = (): void => {
      const id = itemIdRef.current;
      if (id === undefined) return;
      clearTimeout(hoverClear);
      // Handle-area hysteresis: while the pointer is still within reach of
      // THIS chart's visible handles, defer the clear (re-poll) instead of
      // dropping the hovered datum — otherwise the handle unmounts the
      // instant the pointer leaves the mark and can never be clicked
      // (user report 2026-06-14, parity with the general selection
      // handles). Once the pointer fully leaves the handle area the poll
      // finds no rect in reach and clears. The handle's own pointerEnter
      // `pin` takes over once it is actually reached.
      const tick = (): void => {
        const cid = itemIdRef.current;
        if (cid === undefined) return;
        const p = pointerRef.current;
        if (pointerWithinRects(p.x, p.y, visibleChartHandleRects(cid))) {
          hoverClear = setTimeout(tick, 60);
          return;
        }
        chartHoverStore.clearItem(cid);
      };
      hoverClear = setTimeout(tick, 60);
    };
    // WI-092 — a click on the BLANK plot (zrender click with no shape target;
    // the high-level `chart.on("click")` above only fires for marks) drops the
    // datum selection → back to the whole-chart level.
    // WI-195 — the silent custom (per-bar-width) bars emit no high-level mark
    // click, so hit-test them here too: a click inside a custom bar drills it.
    chart.getZr().on("click", (e: { target?: unknown; offsetX?: number; offsetY?: number }) => {
      const hit = customBarHitAt(chart, e.offsetX ?? 0, e.offsetY ?? 0);
      if (hit !== null) {
        onClickRef.current?.(hit);
        return;
      }
      // No bar hit: a press on blank space (no target, or inside a custom chart's
      // empty plot) drops the datum selection.
      if (
        e.target === undefined ||
        e.target === null ||
        (isCustomBarChart(chart) &&
          chart.containPixel({ gridIndex: 0 }, [e.offsetX ?? 0, e.offsetY ?? 0]))
      ) {
        onBgRef.current?.();
      }
    });
    chart.on("mouseover", (p: unknown) => {
      const di = (p as { dataIndex?: number }).dataIndex;
      const id = itemIdRef.current;
      if (id === undefined || typeof di !== "number" || di < 0) return;
      clearTimeout(hoverClear);
      chartHoverStore.set({ chartItemId: id, rowIndex: di });
    });
    chart.on("mouseout", clearHoverSoon);
    // WI-195 — silent custom bars emit no `mouseover`, so publish the hovered bar
    // via a zrender-level hit-test (only for the custom-bar charts; normal series
    // keep the high-level path above). `globalout` clears when the pointer leaves.
    chart.getZr().on("mousemove", (e: { offsetX?: number; offsetY?: number }) => {
      const id = itemIdRef.current;
      if (id === undefined || !isCustomBarChart(chart)) return;
      const hit = customBarHitAt(chart, e.offsetX ?? 0, e.offsetY ?? 0);
      if (hit !== null && hit.dataIndex >= 0) {
        clearTimeout(hoverClear);
        chartHoverStore.set({ chartItemId: id, rowIndex: hit.dataIndex });
      } else {
        clearHoverSoon();
      }
    });
    chart.getZr().on("globalout", clearHoverSoon);
    return () => {
      ro.disconnect();
      unregister?.();
      clearTimeout(hoverClear);
      window.removeEventListener("pointermove", trackPointer, { capture: true });
      document.documentElement.removeEventListener("pointerleave", forceClear);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the serialized digest of every option input — depending on the digest (not each field) is the intent
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
      // WI-172 — ECharts validates lazily inside setOption; a poisoned option
      // (e.g. "Invalid data provider") thrown from an effect would unmount the
      // ENTIRE canvas tree and cascade-fail every subsequent agent exec. Catch
      // it here: clear the instance (blank chart beats a dead editor), log the
      // failing option so the next report carries the exact shape, and let the
      // ChartErrorBoundary in ChartBlock remain the backstop for anything else.
      try {
        chart.setOption(opt, true);
      } catch (err) {
        chart.clear();
        console.error("[chart] setOption failed — rendering blank", err, opt);
        return;
      }
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
