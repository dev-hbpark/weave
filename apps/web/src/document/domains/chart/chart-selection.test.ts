// DR-037 — per-family click→role mapping.

import { describe, expect, it } from "vitest";
import { legendSelection, markSelection } from "./chart-selection.js";
import type { ChartClickInfo } from "./echarts-option.js";

const info = (over: Partial<ChartClickInfo> = {}): ChartClickInfo => ({
  category: "팀A",
  seriesName: "매출",
  value: 42,
  dataIndex: 1,
  ...over,
});

describe("markSelection — a mark click resolves to a role per family", () => {
  it("cartesian: a bar is one DATUM (keeps category + series + value + row)", () => {
    expect(markSelection("bar", info())).toEqual({
      role: "datum",
      category: "팀A",
      seriesName: "매출",
      value: 42,
      rowIndex: 1,
    });
  });

  it("cartesian: omits seriesName when the click carried none (single series)", () => {
    const sel = markSelection("bar", info({ seriesName: undefined }));
    expect(sel).toEqual({ role: "datum", category: "팀A", value: 42, rowIndex: 1 });
    expect("seriesName" in sel).toBe(false);
  });

  it("part-to-whole: a pie slice is a DATUM", () => {
    expect(markSelection("pie", info())).toMatchObject({ role: "datum", category: "팀A" });
  });

  it("polar: a radar polygon is a whole SERIES, identified by the data-item name", () => {
    // radar reports the polygon's name in `category` (param.name), not seriesName.
    expect(markSelection("radar", info({ category: "팀A", seriesName: "" }))).toEqual({
      role: "series",
      seriesName: "팀A",
    });
  });
});

describe("legendSelection — a legend click resolves to a role per family", () => {
  it("cartesian / polar: the legend lists SERIES", () => {
    expect(legendSelection("bar", "매출")).toEqual({ role: "series", seriesName: "매출" });
    expect(legendSelection("radar", "팀A")).toEqual({ role: "series", seriesName: "팀A" });
  });

  it("part-to-whole: the legend lists CATEGORIES → a datum", () => {
    expect(legendSelection("pie", "Q1")).toEqual({ role: "datum", category: "Q1" });
    expect(legendSelection("funnel", "단계1")).toEqual({ role: "datum", category: "단계1" });
  });

  it("hierarchy / flow: the legend lists names → a datum", () => {
    expect(legendSelection("treemap", "루트")).toMatchObject({ role: "datum" });
    expect(legendSelection("sankey", "노드")).toMatchObject({ role: "datum" });
  });
});
