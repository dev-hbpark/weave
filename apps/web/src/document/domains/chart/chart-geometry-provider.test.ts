// WI-193 — unit tests for the chart geometry PROVIDER's family dispatch + the
// scatter 2-D `point` handle. The provider closes over an echarts instance; here
// we feed a deterministic fake (convertToPixel / convertFromPixel as identity) so
// the family selection + the point handle's data→client→data mapping are pinned
// without the heavy library or a real layout. The cartesian/pie/gauge handle
// geometry is covered purely in chart-geometry.test.ts.

import { describe, expect, it } from "vitest";
import type { ChartElementRef } from "./chart-element-store.js";
import { createChartGeometryProvider, type EchartsLike } from "./chart-geometry-provider.js";

/** A 200×200 box at the origin, rendered 1× (client === container px). */
const EL = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
  offsetWidth: 200,
  offsetHeight: 200,
} as unknown as HTMLElement;

/** Identity convert: data coords ARE pixel coords (1× box at origin). */
function fakeChart(series: ReadonlyArray<Record<string, unknown>>): EchartsLike {
  return {
    convertToPixel: (_finder, value) => value as number[],
    convertFromPixel: (_finder, value) => value as number[],
    getOption: () => ({ series }),
  };
}

function providerFor(series: ReadonlyArray<Record<string, unknown>>) {
  return createChartGeometryProvider({ getChart: () => fakeChart(series), getEl: () => EL });
}

const datum = (rowIndex: number): ChartElementRef => ({
  chartItemId: "c1",
  role: "datum",
  rowIndex,
});

describe("family dispatch (laid-out series type → handle family)", () => {
  it("a scatter series offers exactly one `point` handle", () => {
    const provider = providerFor([
      {
        type: "scatter",
        data: [
          [10, 20],
          [30, 40],
        ],
      },
    ]);
    const specs = provider.handles(datum(0));
    expect(specs.map((s) => s.kind)).toEqual(["point"]);
    expect(specs[0]?.anchor.axis).toBe("free");
  });

  it("a bar series still offers value (+ width) handles — no regression", () => {
    const provider = providerFor([{ type: "bar", data: [10, 20] }]);
    const kinds = provider.handles(datum(0)).map((s) => s.kind);
    expect(kinds).toContain("value");
    expect(kinds).toContain("bar-width"); // single-series bar
  });

  it("an unregistered family (e.g. heatmap) offers no handles", () => {
    const provider = providerFor([{ type: "heatmap", data: [[0, 0, 5]] }]);
    expect(provider.handles(datum(0))).toEqual([]);
  });
});

describe("scatter point handle (2-D)", () => {
  it("anchors at the selected point's converted client position", () => {
    const provider = providerFor([
      {
        type: "scatter",
        data: [
          [10, 20],
          [30, 40],
        ],
      },
    ]);
    const spec = provider.handles(datum(1))[0]; // second point = [30, 40]
    // Identity convert + 1× box at origin → client === data coords.
    expect(spec?.anchor.x).toBeCloseTo(30, 6);
    expect(spec?.anchor.y).toBeCloseTo(40, 6);
  });

  it("maps a drag client position back to an {x, y} data pair", () => {
    const provider = providerFor([{ type: "scatter", data: [[10, 20]] }]);
    const spec = provider.handles(datum(0))[0];
    const v = spec?.valueAtClient(55, 66);
    expect(v).toEqual({ x: 55, y: 66 });
  });

  it("returns no point handle when the datum shape isn't a usable pair", () => {
    const provider = providerFor([{ type: "scatter", data: [42] }]); // not [x, y]
    expect(provider.handles(datum(0))).toEqual([]);
  });

  it("bubble (scatter series with a size slot) still resolves the x·y point", () => {
    const provider = providerFor([{ type: "scatter", data: [[10, 20, 99]] }]); // [x, y, size]
    const spec = provider.handles(datum(0))[0];
    expect(spec?.kind).toBe("point");
    expect(spec?.anchor.x).toBeCloseTo(10, 6);
    expect(spec?.anchor.y).toBeCloseTo(20, 6);
  });
});
