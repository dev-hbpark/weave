// WI-077 Phase 6 — agent schema contract for chart + dataset commands.
//
// The agent bridge auto-exposes every registered weave command as a tool;
// these schemas are the argument contracts. This guard pins the chart/dataset
// surface: the four new commands are present with the right shape, and
// weave.item.add deliberately EXCLUDES "chart" from its kind enum so the agent
// is steered to weave.chart.add (which seeds data) instead of creating an empty
// placeholder.

import { describe, expect, it } from "vitest";
import { WEAVE_COMMAND_LABELS, WEAVE_COMMAND_SCHEMAS } from "./weave-command-schemas.js";

function props(name: string): Record<string, unknown> {
  const spec = WEAVE_COMMAND_SCHEMAS[name];
  const schema = spec?.inputSchema as { properties?: Record<string, unknown> } | undefined;
  return schema?.properties ?? {};
}
function required(name: string): ReadonlyArray<string> {
  const spec = WEAVE_COMMAND_SCHEMAS[name];
  const schema = spec?.inputSchema as { required?: ReadonlyArray<string> } | undefined;
  return schema?.required ?? [];
}

describe("agent schemas — chart + dataset commands", () => {
  it("exposes the four new commands with labels", () => {
    for (const name of [
      "weave.chart.add",
      "weave.dataset.add",
      "weave.dataset.update",
      "weave.dataset.remove",
    ]) {
      expect(WEAVE_COMMAND_SCHEMAS[name], name).toBeDefined();
      expect(WEAVE_COMMAND_LABELS[name], name).toBeTruthy();
    }
  });

  it("weave.chart.add advertises chartType + dataset, all optional", () => {
    const p = props("weave.chart.add");
    expect(Object.keys(p)).toEqual(
      expect.arrayContaining([
        "containerId",
        "frame",
        "chartType",
        "encoding",
        "variant",
        "dataset",
      ]),
    );
    // DR-036 — all 14 chart types are advertised (was bar/line/pie only).
    expect((p.chartType as { enum: string[] }).enum).toEqual([
      "bar",
      "line",
      "area",
      "pie",
      "funnel",
      "gauge",
      "scatter",
      "bubble",
      "radar",
      "heatmap",
      "candlestick",
      "boxplot",
      "treemap",
      "sankey",
    ]);
    expect(required("weave.chart.add")).toEqual([]); // sample data seeded when omitted
  });

  it("weave.dataset.update requires id (declarative `dataset` only — no patch fn)", () => {
    const p = props("weave.dataset.update");
    expect(Object.keys(p)).toEqual(expect.arrayContaining(["id", "dataset"]));
    expect(p).not.toHaveProperty("patch");
    expect(required("weave.dataset.update")).toEqual(["id"]);
  });

  it("weave.dataset.remove is destructive and requires id", () => {
    expect(WEAVE_COMMAND_SCHEMAS["weave.dataset.remove"]?.destructive).toBe(true);
    expect(required("weave.dataset.remove")).toEqual(["id"]);
  });

  it("weave.item.add's kind enum EXCLUDES chart (steers to weave.chart.add)", () => {
    const kind = props("weave.item.add").kind as { enum: string[] };
    expect(kind.enum).not.toContain("chart");
    // sanity: it still lists the other data-driven kind (qr)
    expect(kind.enum).toContain("qr");
  });
});
