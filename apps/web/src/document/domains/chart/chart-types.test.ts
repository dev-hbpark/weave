// WI-079 / DR-036 — ChartTypeSpec registry shape + dispatch.

import { describe, expect, it } from "vitest";
import type { DatasetColumn } from "../../dataset/dataset-store.js";
import {
  autoEncode,
  availableChartTypes,
  buildChartOption,
  CHART_TYPE_REGISTRY,
  chartTypeSpec,
  requiredChannelsSatisfied,
} from "./chart-types.js";
import type { ChartRenderInput } from "./echarts-option.js";

function input(over: Partial<ChartRenderInput>): ChartRenderInput {
  return {
    rows: [
      { q: "Q1", a: 10 },
      { q: "Q2", a: 20 },
    ],
    encoding: { category: { field: "q" }, value: [{ field: "a" }] },
    chartType: "bar",
    palette: ["#a", "#b"],
    showAxis: true,
    showLegend: false,
    ...over,
  };
}

describe("CHART_TYPE_REGISTRY", () => {
  it("every entry is well-formed: matching type key, required slots, valid accepts", () => {
    for (const [key, spec] of Object.entries(CHART_TYPE_REGISTRY)) {
      if (spec === undefined) continue;
      expect(spec.type).toBe(key);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.channels.length).toBeGreaterThan(0);
      expect(spec.channels.some((c) => c.required)).toBe(true);
      for (const slot of spec.channels) {
        expect(slot.accepts.length).toBeGreaterThan(0);
      }
      expect(typeof spec.buildOption).toBe("function");
      expect(spec.echartsModules.length).toBeGreaterThan(0);
    }
  });

  it("chartTypeSpec / availableChartTypes expose the implemented set", () => {
    expect(chartTypeSpec("bar")?.family).toBe("cartesian");
    expect(chartTypeSpec("pie")?.family).toBe("part-to-whole");
    expect(chartTypeSpec("radar")?.family).toBe("polar");
    expect(chartTypeSpec("heatmap")?.family).toBe("matrix");
    expect(chartTypeSpec("sankey")?.family).toBe("flow");
    // all 14 base types are registered (DR-036)
    expect(availableChartTypes()).toHaveLength(14);
  });

  it("requiredChannelsSatisfied gates on the spec's required channels", () => {
    // scatter needs x AND y
    expect(requiredChannelsSatisfied("scatter", { x: { field: "a" } })).toBe(false);
    expect(requiredChannelsSatisfied("scatter", { x: { field: "a" }, y: { field: "b" } })).toBe(
      true,
    );
    // bar needs category AND value
    expect(requiredChannelsSatisfied("bar", { category: { field: "c" } })).toBe(false);
    expect(requiredChannelsSatisfied("bar", { value: [{ field: "v" }] })).toBe(false);
    expect(
      requiredChannelsSatisfied("bar", { category: { field: "c" }, value: [{ field: "v" }] }),
    ).toBe(true);
  });
});

describe("autoEncode (type-switch channel mapping)", () => {
  const cols: ReadonlyArray<DatasetColumn> = [
    { name: "월", type: "temporal" },
    { name: "지역", type: "nominal" },
    { name: "매출", type: "quantitative" },
    { name: "비용", type: "quantitative" },
  ];

  it("scatter picks the first two quantitative columns for x/y", () => {
    expect(autoEncode("scatter", cols)).toEqual({
      x: { field: "매출" },
      y: { field: "비용" },
    });
  });

  it("bar maps category(temporal/nominal) + value(first quantitative)", () => {
    expect(autoEncode("bar", cols)).toEqual({
      category: { field: "월" },
      value: [{ field: "매출" }],
    });
  });

  it("keeps compatible previous bindings, fills the rest", () => {
    // bar → line keeps category + value; switching value stays
    const prev = { category: { field: "지역" }, value: [{ field: "비용" }] };
    expect(autoEncode("line", cols, prev)).toEqual({
      category: { field: "지역" },
      value: [{ field: "비용" }],
    });
  });

  it("candlestick fills category + the 4 OHLC quantitative slots (distinct columns)", () => {
    const ohlc: ReadonlyArray<DatasetColumn> = [
      { name: "d", type: "temporal" },
      { name: "o", type: "quantitative" },
      { name: "h", type: "quantitative" },
      { name: "l", type: "quantitative" },
      { name: "c", type: "quantitative" },
    ];
    expect(autoEncode("candlestick", ohlc)).toEqual({
      category: { field: "d" },
      open: { field: "o" },
      high: { field: "h" },
      low: { field: "l" },
      close: { field: "c" },
    });
  });

  it("leaves a required slot unbound when no column fits", () => {
    // scatter needs 2 quantitative; only one available → y unbound → placeholder
    const one: ReadonlyArray<DatasetColumn> = [{ name: "v", type: "quantitative" }];
    expect(autoEncode("scatter", one)).toEqual({ x: { field: "v" } });
    expect(requiredChannelsSatisfied("scatter", autoEncode("scatter", one))).toBe(false);
  });
});

describe("buildChartOption (registry dispatch)", () => {
  it("dispatches by chartType; unimplemented type falls back to bar", () => {
    expect((buildChartOption(input({ chartType: "bar" })).series as unknown[]).length).toBe(1);
    expect(
      buildChartOption(
        input({
          chartType: "pie",
          encoding: { category: { field: "q" }, value: [{ field: "a" }] },
        }),
      ).xAxis,
    ).toBeUndefined();
    // all 14 types are implemented; an UNKNOWN type still renders as bar
    const fb = buildChartOption(input({ chartType: "weird" as unknown as "bar" }));
    expect((fb.series as ReadonlyArray<{ type: string }>)[0]?.type).toBe("bar");
  });
});
