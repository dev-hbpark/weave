// WI-074 — rotation snapping: Shift → 15° steps (WI-183/DR-119, was 10°);
// otherwise snap to the nearest cardinal (0/90/180/270) within threshold.

import { describe, expect, it } from "vitest";
import { CARDINAL_SNAP_THRESHOLD_RAD, ROTATION_STEP_RAD, snapRotation } from "./rotation-snap.js";

const deg = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

describe("snapRotation — cardinal snap (no Shift)", () => {
  it("snaps within threshold to 0/90/180/270", () => {
    expect(snapRotation(deg(3), false)).toMatchObject({ cardinalDeg: 0 });
    expect(toDeg(snapRotation(deg(3), false).rotation)).toBeCloseTo(0, 6);
    expect(snapRotation(deg(88), false)).toMatchObject({ cardinalDeg: 90 });
    expect(toDeg(snapRotation(deg(88), false).rotation)).toBeCloseTo(90, 6);
    expect(snapRotation(deg(178), false)).toMatchObject({ cardinalDeg: 180 });
    expect(snapRotation(deg(-92), false)).toMatchObject({ cardinalDeg: 270 });
  });

  it("does NOT snap outside threshold (free angle, no guide)", () => {
    const r = snapRotation(deg(30), false);
    expect(r.cardinalDeg).toBeNull();
    expect(toDeg(r.rotation)).toBeCloseTo(30, 6);
  });

  it("threshold boundary is exactly 5°", () => {
    expect(snapRotation(deg(5) - 1e-6, false).cardinalDeg).toBe(0);
    expect(snapRotation(deg(6), false).cardinalDeg).toBeNull();
    expect(CARDINAL_SNAP_THRESHOLD_RAD).toBeCloseTo(deg(5), 9);
  });
});

describe("snapRotation — Shift quantize to 15°", () => {
  it("rounds to the nearest 15°", () => {
    expect(toDeg(snapRotation(deg(50), true).rotation)).toBeCloseTo(45, 6);
    expect(toDeg(snapRotation(deg(53), true).rotation)).toBeCloseTo(60, 6);
    expect(toDeg(snapRotation(deg(127), true).rotation)).toBeCloseTo(120, 6);
    expect(ROTATION_STEP_RAD).toBeCloseTo(deg(15), 9);
  });

  it("lands on the 45° diagonal (the reason for 15° — DR-119)", () => {
    expect(toDeg(snapRotation(deg(44), true).rotation)).toBeCloseTo(45, 6);
  });

  it("reports a cardinal when a 15° step lands on a multiple of 90°", () => {
    expect(snapRotation(deg(88), true)).toMatchObject({ cardinalDeg: 90 });
    expect(snapRotation(deg(2), true)).toMatchObject({ cardinalDeg: 0 });
    expect(snapRotation(deg(182), true)).toMatchObject({ cardinalDeg: 180 });
    // 30° is a 15°-step but NOT a cardinal → no guide.
    expect(snapRotation(deg(32), true).cardinalDeg).toBeNull();
  });
});

describe("snapRotation — guards", () => {
  it("non-finite → 0", () => {
    expect(snapRotation(Number.NaN, false).rotation).toBe(0);
    expect(snapRotation(Number.POSITIVE_INFINITY, true).rotation).toBe(0);
  });
});
