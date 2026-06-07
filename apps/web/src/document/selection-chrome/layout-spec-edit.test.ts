// WI-146 — core layout-edit math: track resolve/boundaries + spec edits.
import { createAutoFlexSpec, createAutoGridChildPolicy, trackFr, trackRatio } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { boundaryOffsets, resolveTrackSizes } from "./layout-handle-geometry.js";
import {
  clampGap,
  clampSpan,
  MAX_GAP,
  MIN_TRACK,
  resizeGridTrackBoundary,
  setFlexGap,
  setGridSpan,
} from "./layout-spec-edit.js";

const close = (a: number | undefined, b: number, eps = 1e-9) =>
  a !== undefined && Math.abs(a - b) < eps;

describe("resolveTrackSizes", () => {
  it("splits fr tracks evenly over the free space (no gap)", () => {
    const s = resolveTrackSizes([trackFr(1), trackFr(1)], 0, 1);
    expect(s.map((v) => Number(v.toFixed(4)))).toEqual([0.5, 0.5]);
  });

  it("accounts for gaps in the free space", () => {
    const s = resolveTrackSizes([trackFr(1), trackFr(1)], 0.1, 1); // free = 0.9
    expect(close(s[0], 0.45)).toBe(true);
    expect(close(s[1], 0.45)).toBe(true);
  });

  it("fixed ratio tracks keep their size; fr shares the remainder", () => {
    const s = resolveTrackSizes([trackRatio(0.6), trackFr(1)], 0, 1);
    expect(close(s[0], 0.6)).toBe(true);
    expect(close(s[1], 0.4)).toBe(true);
  });

  it("auto behaves as fr:1", () => {
    const s = resolveTrackSizes([{ kind: "auto" }, trackFr(3)], 0, 1);
    expect(close(s[0], 0.25)).toBe(true);
    expect(close(s[1], 0.75)).toBe(true);
  });

  it("empty list → []", () => {
    expect(resolveTrackSizes([], 0, 1)).toEqual([]);
  });
});

describe("boundaryOffsets", () => {
  it("returns n-1 gap-centre positions", () => {
    const b = boundaryOffsets([0.5, 0.5], 0); // boundary at 0.5
    expect(b).toEqual([0.5]);
  });
  it("centres each boundary inside the gap", () => {
    const b = boundaryOffsets([0.4, 0.4], 0.2); // first track ends 0.4, gap centre 0.5
    expect(close(b[0], 0.5)).toBe(true);
  });
});

describe("clampGap / setFlexGap", () => {
  it("clamps to [0, MAX_GAP]", () => {
    expect(clampGap(-1)).toBe(0);
    expect(clampGap(9)).toBe(MAX_GAP);
    expect(clampGap(0.1)).toBe(0.1);
    expect(clampGap(Number.NaN)).toBe(0);
  });
  it("setFlexGap returns a new spec with clamped gap", () => {
    const spec = createAutoFlexSpec({ direction: "row", gap: 0.05 });
    expect(setFlexGap(spec, 0.2).gap).toBe(0.2);
    expect(setFlexGap(spec, 5).gap).toBe(MAX_GAP);
  });
});

describe("resizeGridTrackBoundary", () => {
  it("preserves the pair's combined size and converts both to ratio", () => {
    const tracks = [trackFr(1), trackFr(1)]; // resolved 0.5 / 0.5
    const next = resizeGridTrackBoundary(tracks, 0, 1, 0, 0.7); // move boundary to 0.7
    expect(next[0]?.kind).toBe("ratio");
    expect(next[1]?.kind).toBe("ratio");
    expect(close((next[0] as { value: number }).value, 0.7)).toBe(true);
    expect(close((next[1] as { value: number }).value, 0.3)).toBe(true);
  });

  it("clamps so neither track drops below MIN_TRACK", () => {
    const tracks = [trackFr(1), trackFr(1)];
    const next = resizeGridTrackBoundary(tracks, 0, 1, 0, 5); // way past end
    const a = (next[0] as { value: number }).value;
    const b = (next[1] as { value: number }).value;
    expect(close(a, 1 - MIN_TRACK)).toBe(true);
    expect(close(b, MIN_TRACK)).toBe(true);
  });

  it("leaves OTHER tracks untouched", () => {
    const tracks = [trackFr(1), trackFr(1), trackRatio(0.3)];
    const next = resizeGridTrackBoundary(tracks, 0, 1, 0, 0.2);
    expect(next[2]).toEqual(trackRatio(0.3)); // third track unchanged
  });

  it("no-ops an out-of-range boundary index", () => {
    const tracks = [trackFr(1), trackFr(1)];
    expect(resizeGridTrackBoundary(tracks, 0, 1, 5, 0.3)).toEqual(tracks);
  });
});

describe("clampSpan / setGridSpan", () => {
  it("clamps span to [1, maxFromStart] and rounds", () => {
    expect(clampSpan(0, 4)).toBe(1);
    expect(clampSpan(9, 3)).toBe(3);
    expect(clampSpan(2.4, 4)).toBe(2);
  });

  it("merges columns within bounds (column 2 of 4 → max span 3)", () => {
    const policy = createAutoGridChildPolicy({ column: 2, row: 1, columnSpan: 1, rowSpan: 1 });
    const merged = setGridSpan(policy, { columnSpan: 5 }, 4, 3);
    expect(merged.columnSpan).toBe(3); // 4 - (2-1) = 3
    expect(merged.rowSpan).toBe(1); // unchanged
  });

  it("merges rows and leaves columns when only rowSpan given", () => {
    const policy = createAutoGridChildPolicy({ column: 1, row: 1, columnSpan: 2, rowSpan: 1 });
    const merged = setGridSpan(policy, { rowSpan: 2 }, 3, 3);
    expect(merged.rowSpan).toBe(2);
    expect(merged.columnSpan).toBe(2);
  });
});
