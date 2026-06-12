// WI-092 — unit tests for the PURE chart geometry kernel (the echarts-free
// algebra behind the weave-owned chart drag handles).

import { describe, expect, it } from "vitest";
import { nn } from "../../../lib/nn.js";
import {
  angleFromCenter,
  type ContainerBox,
  clientToContainer,
  containerToClient,
  distanceFromCenter,
  GAUGE_END_DEG,
  GAUGE_RADIUS_FRAC,
  GAUGE_START_DEG,
  gaugeAngleForValue,
  gaugeFracForValue,
  gaugeLayout,
  gaugeValueFromPoint,
  PIE_START_ANGLE_DEG,
  pieLayout,
  pieValueFromAngle,
  pointOnGauge,
  pointOnPie,
} from "./chart-geometry.js";

/** A box at client (100, 50), rendered at 2× zoom (200px client / 100px layout). */
const ZOOMED: ContainerBox = {
  left: 100,
  top: 50,
  width: 200,
  height: 200,
  offsetWidth: 100,
  offsetHeight: 100,
};

const UNIT: ContainerBox = {
  left: 0,
  top: 0,
  width: 400,
  height: 300,
  offsetWidth: 400,
  offsetHeight: 300,
};

describe("container ↔ client transform", () => {
  it("maps an internal pixel to client coords applying the zoom factor", () => {
    // internal (10, 20) at 2× → client (100 + 20, 50 + 40)
    expect(containerToClient(ZOOMED, 10, 20)).toEqual({ x: 120, y: 90 });
  });

  it("is the exact inverse of clientToContainer (round-trips under zoom)", () => {
    const internal = { x: 37, y: 81 };
    const client = containerToClient(ZOOMED, internal.x, internal.y);
    const back = clientToContainer(ZOOMED, client.x, client.y);
    expect(back.x).toBeCloseTo(internal.x, 9);
    expect(back.y).toBeCloseTo(internal.y, 9);
  });

  it("is identity (minus offset) at 1× zoom", () => {
    expect(clientToContainer(UNIT, 40, 30)).toEqual({ x: 40, y: 30 });
  });
});

describe("pieLayout", () => {
  it("starts the first sector at the configured start angle (12 o'clock)", () => {
    const layout = pieLayout([1, 1], 200, 200);
    expect(layout.sectors[0]?.startDeg).toBe(PIE_START_ANGLE_DEG);
  });

  it("splits two equal values into two 180° sweeps, going clockwise", () => {
    const layout = pieLayout([1, 1], 200, 200);
    // sector 0: 90° → -90° ; sector 1: -90° → -270°
    expect(layout.sectors[0]?.endDeg).toBeCloseTo(-90, 9);
    expect(layout.sectors[1]?.startDeg).toBeCloseTo(-90, 9);
    expect(layout.sectors[1]?.endDeg).toBeCloseTo(-270, 9);
    expect(layout.total).toBe(2);
  });

  it("computes center + radius from the un-zoomed layout size (radius 70%)", () => {
    const layout = pieLayout([1], 200, 160);
    expect(layout.cx).toBe(100);
    expect(layout.cy).toBe(80);
    expect(layout.r).toBeCloseTo((160 / 2) * 0.7, 9); // min side / 2 × 0.7
  });

  it("treats negative / non-finite values as 0", () => {
    const layout = pieLayout([3, -5, Number.NaN], 200, 200);
    expect(layout.total).toBe(3);
  });
});

describe("pointOnPie / angleFromCenter round-trip", () => {
  it("places the start angle at the top of the circle (screen-y down)", () => {
    const layout = pieLayout([1], 200, 200);
    const top = pointOnPie(layout, 90, layout.r);
    expect(top.x).toBeCloseTo(layout.cx, 9);
    expect(top.y).toBeCloseTo(layout.cy - layout.r, 9); // above center
  });

  it("recovers the angle of a placed point", () => {
    const layout = pieLayout([1], 200, 200);
    for (const deg of [90, 0, -45, -90, -179]) {
      const p = pointOnPie(layout, deg, layout.r);
      expect(angleFromCenter(layout, p.x, p.y)).toBeCloseTo(deg, 6);
    }
  });
});

describe("pieValueFromAngle (sweep → value inverse)", () => {
  it("returns the value that makes this sector occupy the swept fraction", () => {
    // Two equal slices (total 2, each 50%). Drag slice 0's trailing edge so its
    // sweep becomes 270° (75%): with restTotal = 1, v' = 0.75·1/0.25 = 3.
    const layout = pieLayout([1, 1], 200, 200);
    const sector = nn(layout.sectors[0]);
    const cursorDeg = sector.startDeg - 270; // 270° clockwise from the start edge
    const v = pieValueFromAngle(sector, layout.total - sector.value, cursorDeg);
    expect(v).toBeCloseTo(3, 6);
  });

  it("clamps tiny sweeps to a minimum fraction (slice never vanishes)", () => {
    const layout = pieLayout([1, 1], 200, 200);
    const sector = nn(layout.sectors[0]);
    const cursorDeg = sector.startDeg - 0.0001; // essentially zero sweep
    const v = pieValueFromAngle(sector, 1, cursorDeg, { minFrac: 0.05 });
    // f = 0.05 → v = 0.05·1/0.95
    expect(v).toBeCloseTo(0.05 / 0.95, 6);
  });

  it("returns null when there is no rest mass to proportion against", () => {
    const layout = pieLayout([5], 200, 200);
    const sector = nn(layout.sectors[0]);
    expect(pieValueFromAngle(sector, 0, sector.startDeg - 90)).toBeNull();
  });
});

describe("distanceFromCenter", () => {
  it("measures radial pixel distance from the pie center", () => {
    const layout = pieLayout([1], 200, 200); // center (100,100)
    expect(distanceFromCenter(layout, 100, 100)).toBeCloseTo(0, 9);
    expect(distanceFromCenter(layout, 130, 140)).toBeCloseTo(50, 9); // 3-4-5
  });
});

describe("gaugeLayout", () => {
  it("computes center + radius from the un-zoomed layout size (radius 75%)", () => {
    const layout = gaugeLayout(0, 100, 200, 160);
    expect(layout.cx).toBe(100);
    expect(layout.cy).toBe(80);
    expect(layout.r).toBeCloseTo((160 / 2) * GAUGE_RADIUS_FRAC, 9); // min side / 2 × 0.75
    expect(layout.min).toBe(0);
    expect(layout.max).toBe(100);
  });

  it("collapses a non-positive domain span to a usable [min, min+1]", () => {
    const layout = gaugeLayout(5, 5, 200, 200);
    expect(layout.min).toBe(5);
    expect(layout.max).toBe(6);
  });
});

describe("gaugeFracForValue", () => {
  it("maps min→0, mid→0.5, max→1 within the domain", () => {
    const layout = gaugeLayout(0, 200, 200, 200);
    expect(gaugeFracForValue(layout, 0)).toBeCloseTo(0, 9);
    expect(gaugeFracForValue(layout, 100)).toBeCloseTo(0.5, 9);
    expect(gaugeFracForValue(layout, 200)).toBeCloseTo(1, 9);
  });

  it("clamps out-of-domain values to [0, 1]", () => {
    const layout = gaugeLayout(0, 100, 200, 200);
    expect(gaugeFracForValue(layout, -50)).toBe(0);
    expect(gaugeFracForValue(layout, 300)).toBe(1);
  });
});

describe("gaugeAngleForValue / pointOnGauge", () => {
  it("anchors min at the start angle (225°, lower-left) and max at the end (−45°)", () => {
    const layout = gaugeLayout(0, 100, 200, 200);
    expect(gaugeAngleForValue(layout, 0)).toBeCloseTo(GAUGE_START_DEG, 9);
    expect(gaugeAngleForValue(layout, 100)).toBeCloseTo(GAUGE_END_DEG, 9);
  });

  it("places the mid value at the top of the dial (90°, screen-y up)", () => {
    const layout = gaugeLayout(0, 100, 200, 200);
    expect(gaugeAngleForValue(layout, 50)).toBeCloseTo(90, 9);
    const top = pointOnGauge(layout, gaugeAngleForValue(layout, 50));
    expect(top.x).toBeCloseTo(layout.cx, 9);
    expect(top.y).toBeCloseTo(layout.cy - layout.r, 9); // directly above center
  });
});

describe("gaugeValueFromPoint (cursor → value inverse)", () => {
  it("recovers the value of a point placed on the arc (round-trip)", () => {
    const layout = gaugeLayout(0, 100, 200, 200);
    for (const value of [0, 25, 50, 75, 100]) {
      const p = pointOnGauge(layout, gaugeAngleForValue(layout, value));
      expect(gaugeValueFromPoint(layout, p.x, p.y)).toBeCloseTo(value, 6);
    }
  });

  it("clamps the bottom opening (below the dial) to the nearer end", () => {
    const layout = gaugeLayout(0, 100, 200, 200); // center (100,100)
    // Straight down (270° math) is in the dial's bottom gap → clamps to max.
    expect(gaugeValueFromPoint(layout, 100, 180)).toBe(100);
  });
});
