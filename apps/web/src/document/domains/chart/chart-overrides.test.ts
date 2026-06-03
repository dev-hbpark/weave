// WI-078 — per-element override helpers + ECharts injection.

import { describe, expect, it } from "vitest";
import type { ChartOverrides } from "../../types.js";
import {
  datumOverride,
  datumOverrideKey,
  seriesOverride,
  setDatumOverride,
  setSeriesOverride,
} from "./chart-overrides.js";
import { buildChartOption } from "./chart-types.js";
import type { ChartRenderInput, EChartsOptionLike } from "./echarts-option.js";

describe("setSeriesOverride (DR-037) + two-layer preservation", () => {
  it("sets/reads a series override; datum & series coexist and don't clobber", () => {
    let o = setDatumOverride(undefined, "Q1", { color: "#f00" });
    o = setSeriesOverride(o, "매출", { color: "#0f0", borderWidth: 2 });
    expect(o).toEqual({
      datum: { Q1: { color: "#f00" } },
      series: { 매출: { color: "#0f0", borderWidth: 2 } },
    });
    expect(seriesOverride(o, "매출")).toEqual({ color: "#0f0", borderWidth: 2 });
    expect(seriesOverride(o, "없음")).toEqual({});
  });

  it("clearing one map preserves the other; both empty → undefined", () => {
    let o = setDatumOverride(undefined, "Q1", { color: "#f00" });
    o = setSeriesOverride(o, "매출", { color: "#0f0" });
    // clear the series override → datum survives
    o = setSeriesOverride(o, "매출", { color: undefined });
    expect(o).toEqual({ datum: { Q1: { color: "#f00" } } });
    // clear the last datum → undefined
    expect(setDatumOverride(o, "Q1", { color: undefined })).toBeUndefined();
  });
});

describe("setDatumOverride", () => {
  it("creates an override for a category", () => {
    const out = setDatumOverride(undefined, "Q1", { color: "#f00" });
    expect(out).toEqual({ datum: { Q1: { color: "#f00" } } });
  });

  it("merges into an existing category override", () => {
    const base: ChartOverrides = { datum: { Q1: { color: "#f00" } } };
    expect(setDatumOverride(base, "Q1", { borderWidth: 3 })).toEqual({
      datum: { Q1: { color: "#f00", borderWidth: 3 } },
    });
  });

  it("clears a field with undefined; drops the category when empty", () => {
    const base: ChartOverrides = { datum: { Q1: { color: "#f00" } } };
    expect(setDatumOverride(base, "Q1", { color: undefined })).toBeUndefined();
  });

  it("keeps other categories when one is cleared", () => {
    const base: ChartOverrides = { datum: { Q1: { color: "#f00" }, Q2: { offset: 10 } } };
    expect(setDatumOverride(base, "Q1", { color: undefined })).toEqual({
      datum: { Q2: { offset: 10 } },
    });
  });

  it("datumOverride reads current or empty", () => {
    const base: ChartOverrides = { datum: { Q1: { color: "#f00" } } };
    expect(datumOverride(base, "Q1")).toEqual({ color: "#f00" });
    expect(datumOverride(base, "Q9")).toEqual({});
  });
});

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
function series0Data(opt: EChartsOptionLike): ReadonlyArray<unknown> {
  const s = opt.series as ReadonlyArray<{ data: ReadonlyArray<unknown> }>;
  return s[0]?.data ?? [];
}

describe("buildChartOption — override injection", () => {
  it("bar: a category override becomes a {value,itemStyle} datum; others stay bare", () => {
    const opt = buildChartOption(
      input({ overrides: { datum: { Q1: { color: "#f00", borderWidth: 2 } } } }),
    );
    const data = series0Data(opt);
    expect(data[0]).toEqual({
      value: 10,
      itemStyle: { color: "#f00", borderWidth: 2, borderColor: "#ffffff" },
    });
    expect(data[1]).toBe(20); // untouched → bare value
  });

  it("pie: offset marks the slice selected and sets the series selectedOffset", () => {
    const opt = buildChartOption(
      input({ chartType: "pie", overrides: { datum: { Q2: { offset: 12 } } } }),
    );
    const s = opt.series as ReadonlyArray<{
      data: ReadonlyArray<{ name: string; selected?: boolean }>;
      selectedOffset?: number;
    }>;
    expect(s[0]?.selectedOffset).toBe(12);
    expect(s[0]?.data[1]).toMatchObject({ name: "Q2", selected: true });
    expect(s[0]?.data[0]).not.toHaveProperty("selected");
  });

  it("no overrides → all bare values (no itemStyle)", () => {
    const data = series0Data(buildChartOption(input({})));
    expect(data).toEqual([10, 20]);
  });

  const TWO_SERIES = [
    { q: "Q1", a: 10, b: 5 },
    { q: "Q2", a: 20, b: 15 },
  ];
  it("WI-088: a per-(series,category) datum override styles ONE series only", () => {
    const opt = buildChartOption(
      input({
        rows: TWO_SERIES,
        encoding: { category: { field: "q" }, value: [{ field: "a" }, { field: "b" }] },
        overrides: { datum: { [datumOverrideKey("a", "Q1")]: { color: "#f00" } } },
      }),
    );
    const s = opt.series as ReadonlyArray<{ name: string; data: ReadonlyArray<unknown> }>;
    // series "a" Q1 styled; series "b" Q1 untouched (bare value)
    expect((s[0]?.data[0] as { itemStyle?: { color?: string } }).itemStyle?.color).toBe("#f00");
    expect(s[1]?.data[0]).toBe(5);
  });

  it("WI-088: a BARE-category datum override applies to all series (legacy shared)", () => {
    const opt = buildChartOption(
      input({
        rows: TWO_SERIES,
        encoding: { category: { field: "q" }, value: [{ field: "a" }, { field: "b" }] },
        overrides: { datum: { Q1: { color: "#0f0" } } },
      }),
    );
    const s = opt.series as ReadonlyArray<{
      data: ReadonlyArray<{ itemStyle?: { color?: string } }>;
    }>;
    expect(s[0]?.data[0]?.itemStyle?.color).toBe("#0f0");
    expect(s[1]?.data[0]?.itemStyle?.color).toBe("#0f0");
  });

  it("DR-037: a SERIES override sets the series itemStyle; a datum override wins on top", () => {
    const opt = buildChartOption(
      input({
        overrides: {
          series: { a: { color: "#00f", borderWidth: 3 } },
          datum: { Q1: { color: "#f00" } },
        },
      }),
    );
    const s = (opt.series as ReadonlyArray<{ itemStyle?: { color?: string }; data: unknown[] }>)[0];
    // whole-series style (legend selection)
    expect(s?.itemStyle).toMatchObject({ color: "#00f", borderWidth: 3 });
    // the Q1 datum still carries its own override (ECharts: datum wins)
    const d0 = (s?.data as ReadonlyArray<{ itemStyle?: { color?: string } }>)[0];
    expect(d0?.itemStyle?.color).toBe("#f00");
  });
});
