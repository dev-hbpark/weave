// WI-048 — computeArrangedFrames pure-function tests. The flex/grid placement
// math is owned by the agocraft adapter; these assert the host-side coordinate
// mapping (bbox in → bbox out) and the structural shape of each arrangement.

import { describe, expect, it } from "vitest";
import { type ArrangeInput, computeArrangedFrames } from "./layout-arrange.js";

const within = (v: number, lo: number, hi: number): boolean => v >= lo - 1e-6 && v <= hi + 1e-6;

function bbox(
  items: ReadonlyArray<{ frame: { x: number; y: number; width: number; height: number } }>,
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.frame.x);
    minY = Math.min(minY, it.frame.y);
    maxX = Math.max(maxX, it.frame.x + it.frame.width);
    maxY = Math.max(maxY, it.frame.y + it.frame.height);
  }
  return { minX, minY, maxX, maxY };
}

describe("computeArrangedFrames", () => {
  it("passes through when fewer than 2 items", () => {
    const items: ArrangeInput[] = [{ id: "a", frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }];
    expect(computeArrangedFrames(items, "flex")).toEqual(items);
  });

  it("flex: arranges items in a single row inside the original bounding box", () => {
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.1, y: 0.5, width: 0.15, height: 0.1 } },
      { id: "b", frame: { x: 0.6, y: 0.2, width: 0.15, height: 0.2 } },
      { id: "c", frame: { x: 0.3, y: 0.7, width: 0.15, height: 0.15 } },
    ];
    const box = bbox(items);
    const out = computeArrangedFrames(items, "flex");
    expect(out).toHaveLength(3);
    // Every output stays within the original bounding box.
    for (const o of out) {
      expect(within(o.frame.x, box.minX, box.maxX)).toBe(true);
      expect(within(o.frame.y, box.minY, box.maxY)).toBe(true);
      expect(within(o.frame.x + o.frame.width, box.minX, box.maxX)).toBe(true);
    }
    // A row → distinct, increasing x by output id order a,b,c.
    const xs = out.map((o) => o.frame.x);
    expect(xs[0]!).toBeLessThan(xs[1]!);
    expect(xs[1]!).toBeLessThan(xs[2]!);
    // align: start → all share the top edge (same y).
    const ys = out.map((o) => o.frame.y);
    expect(Math.abs(ys[0]! - ys[1]!)).toBeLessThan(1e-6);
    expect(Math.abs(ys[1]! - ys[2]!)).toBeLessThan(1e-6);
  });

  it("grid: arranges 4 items into a 2×2 (two distinct columns and rows)", () => {
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } },
      { id: "b", frame: { x: 0.5, y: 0.1, width: 0.1, height: 0.1 } },
      { id: "c", frame: { x: 0.1, y: 0.5, width: 0.1, height: 0.1 } },
      { id: "d", frame: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } },
    ];
    const box = bbox(items);
    const out = computeArrangedFrames(items, "grid");
    expect(out).toHaveLength(4);
    for (const o of out) {
      expect(within(o.frame.x, box.minX, box.maxX)).toBe(true);
      expect(within(o.frame.y, box.minY, box.maxY)).toBe(true);
    }
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const distinctX = new Set(out.map((o) => round(o.frame.x))).size;
    const distinctY = new Set(out.map((o) => round(o.frame.y))).size;
    expect(distinctX).toBe(2);
    expect(distinctY).toBe(2);
    // Stretch tiling: every cell is half the bbox in each axis (no gaps), and
    // the 2×2 covers the whole bounding box edge-to-edge.
    const halfW = (box.maxX - box.minX) / 2;
    const halfH = (box.maxY - box.minY) / 2;
    for (const o of out) {
      expect(o.frame.width).toBeCloseTo(halfW, 5);
      expect(o.frame.height).toBeCloseTo(halfH, 5);
    }
    const xs = [...new Set(out.map((o) => round(o.frame.x)))].sort((a, b) => a - b);
    const ys = [...new Set(out.map((o) => round(o.frame.y)))].sort((a, b) => a - b);
    expect(xs[0]!).toBeCloseTo(box.minX, 5);
    expect(xs[1]!).toBeCloseTo(box.minX + halfW, 5);
    expect(ys[0]!).toBeCloseTo(box.minY, 5);
    expect(ys[1]!).toBeCloseTo(box.minY + halfH, 5);
  });
});
