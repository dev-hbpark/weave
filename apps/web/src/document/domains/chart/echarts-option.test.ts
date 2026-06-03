// WI-077 — pure ECharts option builder tests (DR-032). echarts-free: asserts
// the config object the renderer hands to setOption.

import { describe, expect, it } from "vitest";
import { buildChartOption } from "./chart-types.js";
import { type ChartRenderInput, type EChartsOptionLike, toNumber } from "./echarts-option.js";

function input(over: Partial<ChartRenderInput>): ChartRenderInput {
  return {
    rows: [
      { q: "Q1", a: 10, b: 5 },
      { q: "Q2", a: 20, b: 15 },
    ],
    encoding: { category: { field: "q" }, value: [{ field: "a" }] },
    chartType: "bar",
    palette: ["#a", "#b", "#c"],
    showAxis: true,
    showLegend: true,
    ...over,
  };
}

/** Build an encoding from a category + value column names (test convenience). */
function enc(category: string, values: ReadonlyArray<string>): ChartRenderInput["encoding"] {
  return { category: { field: category }, value: values.map((field) => ({ field })) };
}

// Narrow helper for reading the loose option object in tests.
function series(opt: EChartsOptionLike): ReadonlyArray<Record<string, unknown>> {
  return opt.series as ReadonlyArray<Record<string, unknown>>;
}

describe("toNumber", () => {
  it("coerces; non-numeric → 0", () => {
    expect(toNumber(12)).toBe(12);
    expect(toNumber("34")).toBe(34);
    expect(toNumber("x")).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
});

describe("buildChartOption — bar / line (cartesian)", () => {
  it("bar: one series per value column, category axis from the category column", () => {
    const opt = buildChartOption(input({ encoding: enc("q", ["a", "b"]) }));
    expect((opt.xAxis as { data: string[] }).data).toEqual(["Q1", "Q2"]);
    const s = series(opt);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ name: "a", type: "bar", data: [10, 20] });
    expect(s[1]).toMatchObject({ name: "b", type: "bar", data: [5, 15] });
    expect(opt.color).toEqual(["#a", "#b", "#c"]);
  });

  it("line: same skeleton, series type 'line'", () => {
    const opt = buildChartOption(input({ chartType: "line" }));
    expect(series(opt)[0]).toMatchObject({ type: "line", data: [10, 20] });
  });

  it("aggregate: sum/mean collapse repeated categories to one bar each", () => {
    const rows = [
      { c: "A", v: 10 },
      { c: "A", v: 20 },
      { c: "B", v: 30 },
    ];
    const sum = buildChartOption(
      input({
        chartType: "bar",
        rows,
        encoding: { category: { field: "c" }, value: [{ field: "v", aggregate: "sum" }] },
      }),
    );
    expect((sum.xAxis as { data: string[] }).data).toEqual(["A", "B"]);
    expect(series(sum)[0]?.data).toEqual([30, 30]); // A: 10+20, B: 30

    const mean = buildChartOption(
      input({
        chartType: "bar",
        rows,
        encoding: { category: { field: "c" }, value: [{ field: "v", aggregate: "mean" }] },
      }),
    );
    expect(series(mean)[0]?.data).toEqual([15, 30]); // A: mean(10,20)
  });

  it("aggregate: per-field — each value column uses its OWN aggregate", () => {
    const opt = buildChartOption(
      input({
        chartType: "bar",
        rows: [
          { c: "A", 매출: 10, 가격: 100 },
          { c: "A", 매출: 20, 가격: 200 },
          { c: "B", 매출: 5, 가격: 50 },
        ],
        encoding: {
          category: { field: "c" },
          value: [
            { field: "매출", aggregate: "sum" },
            { field: "가격", aggregate: "mean" },
          ],
        },
      }),
    );
    const s = series(opt);
    expect(s[0]).toMatchObject({ name: "매출", data: [30, 5] }); // sum
    expect(s[1]).toMatchObject({ name: "가격", data: [150, 50] }); // mean
  });

  it("aggregate + series: collapses by (category, group)", () => {
    const opt = buildChartOption(
      input({
        chartType: "bar",
        rows: [
          { 월: "1월", 지역: "서울", 매출: 10 },
          { 월: "1월", 지역: "서울", 매출: 30 },
          { 월: "1월", 지역: "부산", 매출: 5 },
          { 월: "2월", 지역: "서울", 매출: 20 },
        ],
        encoding: {
          category: { field: "월" },
          value: [{ field: "매출", aggregate: "sum" }],
          series: { field: "지역" },
        },
      }),
    );
    expect((opt.xAxis as { data: string[] }).data).toEqual(["1월", "2월"]);
    const s = series(opt);
    expect(s[0]).toMatchObject({ name: "서울", data: [40, 20] }); // 1월=10+30, 2월=20
    expect(s[1]).toMatchObject({ name: "부산", data: [5, 0] });
  });

  it("long format: a `series` channel splits one value column into a series per group", () => {
    const opt = buildChartOption(
      input({
        chartType: "bar",
        rows: [
          { 월: "1월", 지역: "서울", 매출: 10 },
          { 월: "1월", 지역: "부산", 매출: 20 },
          { 월: "2월", 지역: "서울", 매출: 15 },
          { 월: "2월", 지역: "부산", 매출: 25 },
        ],
        encoding: {
          category: { field: "월" },
          value: [{ field: "매출" }],
          series: { field: "지역" },
        },
      }),
    );
    // x-axis = DISTINCT categories (not one-per-row)
    expect((opt.xAxis as { data: string[] }).data).toEqual(["1월", "2월"]);
    const s = series(opt);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ name: "서울", data: [10, 15] });
    expect(s[1]).toMatchObject({ name: "부산", data: [20, 25] });
  });

  it("showAxis=false hides both axes", () => {
    const opt = buildChartOption(input({ showAxis: false }));
    expect((opt.xAxis as { show: boolean }).show).toBe(false);
    expect((opt.yAxis as { show: boolean }).show).toBe(false);
  });

  it("showLegend toggles the legend", () => {
    expect(buildChartOption(input({ showLegend: false })).legend).toBeUndefined();
    expect(buildChartOption(input({ showLegend: true })).legend).toBeDefined();
  });
});

describe("buildChartOption — pie", () => {
  it("slices the first series by row, labelled by category; no axes", () => {
    const opt = buildChartOption(input({ chartType: "pie", encoding: enc("q", ["a"]) }));
    expect(opt.xAxis).toBeUndefined();
    const s = series(opt);
    expect(s[0]).toMatchObject({ type: "pie" });
    expect(s[0]?.data).toEqual([
      { name: "Q1", value: 10 },
      { name: "Q2", value: 20 },
    ]);
  });
});

describe("buildChartOption — radar (polar)", () => {
  it("rows → indicators (per-axis max), each value column → a series polygon", () => {
    const opt = buildChartOption(input({ chartType: "radar", encoding: enc("q", ["a", "b"]) }));
    expect(opt.xAxis).toBeUndefined();
    // indicators come from the category column; max = largest value across series
    expect((opt.radar as { indicator: Array<{ name: string; max: number }> }).indicator).toEqual([
      { name: "Q1", max: 10 },
      { name: "Q2", max: 20 },
    ]);
    const s = series(opt) as ReadonlyArray<{
      type: string;
      data: Array<{ name: string; value: number[] }>;
    }>;
    expect(s[0]?.type).toBe("radar");
    expect(s[0]?.data).toEqual([
      { name: "a", value: [10, 20] },
      { name: "b", value: [5, 15] },
    ]);
  });

  it("DR-037: a series override styles the matching polygon (line + symbol), others bare", () => {
    const opt = buildChartOption(
      input({
        chartType: "radar",
        encoding: enc("q", ["a", "b"]),
        overrides: { series: { a: { color: "#f00", borderWidth: 3 } } },
      }),
    );
    const data = (
      series(opt)[0] as {
        data: Array<{
          name: string;
          itemStyle?: { color?: string };
          lineStyle?: { color?: string; width?: number };
        }>;
      }
    ).data;
    expect(data[0]).toMatchObject({
      name: "a",
      itemStyle: { color: "#f00" },
      lineStyle: { color: "#f00", width: 3 },
    });
    expect(data[1]?.itemStyle).toBeUndefined(); // polygon "b" untouched
    expect(data[1]?.lineStyle).toBeUndefined();
  });
});

describe("buildChartOption — area / funnel / gauge (DR-036)", () => {
  it("area: a line series with an areaStyle", () => {
    const s = series(buildChartOption(input({ chartType: "area" })));
    expect(s[0]).toMatchObject({ type: "line" });
    expect(s[0]?.areaStyle).toBeDefined();
  });
  it("funnel: one {name,value} per row, descending; white on-fill label", () => {
    const opt = buildChartOption(input({ chartType: "funnel" }));
    expect(series(opt)[0]).toMatchObject({ type: "funnel", sort: "descending" });
    expect((series(opt)[0]?.data as unknown[])[0]).toEqual({ name: "Q1", value: 10 });
    expect(series(opt)[0]?.label).toMatchObject({ color: "#ffffff" });
  });
  it("gauge: first row's value, nice-ceil max", () => {
    const opt = buildChartOption(input({ chartType: "gauge" }));
    const s = series(opt)[0] as { type: string; max: number; data: Array<{ value: number }> };
    expect(s.type).toBe("gauge");
    expect(s.data[0]?.value).toBe(10);
    expect(s.max).toBe(20); // niceCeil(max value 20)
  });
});

describe("buildChartOption — scatter / bubble (cartesian x·y)", () => {
  it("scatter: [x,y] points from the x/y channels", () => {
    const opt = buildChartOption(
      input({ chartType: "scatter", encoding: { x: { field: "a" }, y: { field: "b" } } }),
    );
    const s = series(opt)[0] as { type: string; data: number[][]; symbolSize?: unknown };
    expect(s.type).toBe("scatter");
    expect(s.data).toEqual([
      [10, 5],
      [20, 15],
    ]);
    expect(s.symbolSize).toBeUndefined(); // no size channel
  });
  it("bubble: adds the size dimension + a symbolSize function", () => {
    const opt = buildChartOption(
      input({
        chartType: "bubble",
        encoding: { x: { field: "a" }, y: { field: "b" }, size: { field: "a" } },
      }),
    );
    const s = series(opt)[0] as { data: number[][]; symbolSize?: unknown };
    expect(s.data[0]).toEqual([10, 5, 10]);
    expect(typeof s.symbolSize).toBe("function");
  });
});

describe("buildChartOption — heatmap / candlestick / boxplot (DR-036)", () => {
  it("heatmap: category axes indexed + a visualMap over the value", () => {
    const opt = buildChartOption(
      input({
        chartType: "heatmap",
        rows: [
          { x: "A", y: "P", v: 1 },
          { x: "B", y: "P", v: 2 },
        ],
        encoding: { x: { field: "x" }, y: { field: "y" }, value: { field: "v" } },
      }),
    );
    expect((opt.xAxis as { data: string[] }).data).toEqual(["A", "B"]);
    expect((opt.yAxis as { data: string[] }).data).toEqual(["P"]);
    expect(opt.visualMap).toBeDefined();
    expect((series(opt)[0]?.data as number[][])[0]).toEqual([0, 0, 1]); // [xIdx,yIdx,value]
  });
  it("candlestick: [open,close,low,high] datum order", () => {
    const opt = buildChartOption(
      input({
        chartType: "candlestick",
        rows: [{ d: "D1", o: 1, h: 4, l: 0, c: 3 }],
        encoding: {
          category: { field: "d" },
          open: { field: "o" },
          high: { field: "h" },
          low: { field: "l" },
          close: { field: "c" },
        },
      }),
    );
    expect((series(opt)[0]?.data as number[][])[0]).toEqual([1, 3, 0, 4]);
  });
  it("boxplot: [lower,q1,median,q3,upper] datum order", () => {
    const opt = buildChartOption(
      input({
        chartType: "boxplot",
        rows: [{ c: "A", lo: 1, q1: 2, m: 3, q3: 4, up: 5 }],
        encoding: {
          category: { field: "c" },
          lower: { field: "lo" },
          q1: { field: "q1" },
          median: { field: "m" },
          q3: { field: "q3" },
          upper: { field: "up" },
        },
      }),
    );
    expect((series(opt)[0]?.data as number[][])[0]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("buildChartOption — treemap / sankey (structural, DR-036)", () => {
  it("treemap: flat (id,parent,value) folds into a nested tree", () => {
    const opt = buildChartOption(
      input({
        chartType: "treemap",
        rows: [
          { id: "root", parent: "", v: 0 },
          { id: "a", parent: "root", v: 10 },
          { id: "b", parent: "root", v: 20 },
        ],
        encoding: { id: { field: "id" }, parent: { field: "parent" }, value: { field: "v" } },
      }),
    );
    // A single wrapping root is unwrapped → its children become the top tiles.
    const data = series(opt)[0]?.data as Array<{ name: string; value: number }>;
    expect(data.map((d) => d.name)).toEqual(["a", "b"]);
    expect(data.map((d) => d.value)).toEqual([10, 20]);
    expect(series(opt)[0]?.label).toMatchObject({ color: "#ffffff" }); // white on tiles
  });
  it("sankey: (source,target,value) → node set + links", () => {
    const opt = buildChartOption(
      input({
        chartType: "sankey",
        rows: [
          { s: "A", t: "B", v: 5 },
          { s: "B", t: "C", v: 3 },
        ],
        encoding: { source: { field: "s" }, target: { field: "t" }, value: { field: "v" } },
      }),
    );
    const s = series(opt)[0] as { data: Array<{ name: string }>; links: unknown[] };
    expect(s.data.map((n) => n.name)).toEqual(["A", "B", "C"]);
    expect(s.links).toHaveLength(2);
  });
});

describe("buildChartOption — unknown type", () => {
  it("falls back to bar", () => {
    const opt = buildChartOption(input({ chartType: "weird" as unknown as "bar" }));
    expect(series(opt)[0]).toMatchObject({ type: "bar" });
  });
});
