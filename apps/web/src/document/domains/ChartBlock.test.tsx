// WI-077 — ChartBlock branching tests (DR-031 data / DR-032 lazy ECharts).
//
// ChartBlock is a thin shell: it resolves the dataset and decides
// placeholder-vs-chart, deferring the actual draw to the lazy echarts renderer.
// These SSR tests (renderToStaticMarkup) cover exactly that branching — the
// placeholder cases, and that a plottable chart renders the frame-filling
// container (with the test-facing data-attrs) + the Suspense fallback while the
// echarts chunk would load. The real ECharts visual is verified in the browser
// (e2e chart-item.spec). The echarts module is mocked so the unit test never
// pulls the heavy library.

import type { Document as AgocraftDocument, Unit as AgocraftUnit } from "@agocraft/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DatasetProvider } from "../dataset/dataset-context.js";
import { buildDatasetUnit, type DatasetPayload } from "../dataset/dataset-store.js";
import type { AgoItem, ChartAttrs } from "../types.js";
import { FULL_FRAME } from "../types.js";
import { ChartBlock } from "./ChartBlock.js";

// Keep the heavy echarts renderer out of the unit test; the lazy boundary still
// renders its Suspense fallback in SSR regardless.
vi.mock("./chart/echarts-renderer.js", () => ({
  default: () => null,
}));

const SALES: DatasetPayload = {
  name: "분기 매출",
  columns: [
    { name: "quarter", type: "nominal" },
    { name: "revenue", type: "quantitative" },
  ],
  rows: [
    { quarter: "Q1", revenue: 120 },
    { quarter: "Q2", revenue: 150 },
    { quarter: "Q3", revenue: 90 },
  ],
};

function chartItem(attrs: Partial<ChartAttrs>): AgoItem<"chart"> {
  return {
    id: "chart-1",
    kind: "chart",
    attrs: {
      frame: FULL_FRAME,
      datasetId: "",
      chartType: "bar",
      encoding: { category: "quarter", values: [] },
      ...attrs,
    },
  } as unknown as AgoItem<"chart">;
}

function docWithDataset(id: string, payload: DatasetPayload): AgocraftDocument {
  const unit: AgocraftUnit = buildDatasetUnit(id, payload);
  return { root: { units: [unit] } } as unknown as AgocraftDocument;
}

function renderWithDoc(item: AgoItem<"chart">, doc: AgocraftDocument): string {
  return renderToStaticMarkup(
    <DatasetProvider doc={doc}>
      <ChartBlock item={item} />
    </DatasetProvider>,
  );
}

describe("ChartBlock — placeholder (graceful refs)", () => {
  it("empty datasetId → placeholder", () => {
    const html = renderToStaticMarkup(<ChartBlock item={chartItem({ datasetId: "" })} />);
    expect(html).toContain('data-chart-empty="true"');
    expect(html).toContain("데이터 없음");
  });

  it("dangling datasetId (no such dataset) → placeholder", () => {
    const doc = docWithDataset("ds-1", SALES);
    const html = renderWithDoc(
      chartItem({
        datasetId: "ds-MISSING",
        encoding: { category: { field: "quarter" }, value: [{ field: "revenue" }] },
      }),
      doc,
    );
    expect(html).toContain('data-chart-empty="true"');
  });

  it("resolvable dataset but no value channel → placeholder", () => {
    const doc = docWithDataset("ds-1", SALES);
    const html = renderWithDoc(
      chartItem({ datasetId: "ds-1", encoding: { category: { field: "quarter" } } }),
      doc,
    );
    expect(html).toContain('data-chart-empty="true"');
  });
});

describe("ChartBlock — plottable → chart container + lazy boundary", () => {
  it("renders the chart container (NOT the placeholder) with type + row count", () => {
    const doc = docWithDataset("ds-1", SALES);
    const html = renderWithDoc(
      chartItem({
        datasetId: "ds-1",
        encoding: { category: { field: "quarter" }, value: [{ field: "revenue" }] },
      }),
      doc,
    );
    expect(html).not.toContain('data-chart-empty="true"');
    expect(html).toContain('data-chart-type="bar"');
    expect(html).toContain('data-chart-rows="3"');
    // The echarts renderer is lazy → its Suspense fallback shows in SSR.
    expect(html).toContain('data-testid="chart-loading"');
  });

  it("carries the chartType through to the container (dispatch is in the renderer)", () => {
    const doc = docWithDataset("ds-1", SALES);
    const enc = { category: { field: "quarter" }, value: [{ field: "revenue" }] };
    for (const chartType of ["bar", "line", "pie"] as const) {
      const html = renderWithDoc(chartItem({ datasetId: "ds-1", chartType, encoding: enc }), doc);
      expect(html).toContain(`data-chart-type="${chartType}"`);
    }
  });
});
