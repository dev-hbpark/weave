// WI-048 — computeArrangedFrames pure-function tests. Arrange places items
// into uniform SQUARE cells (sized to the largest footprint) so every item
// fills an equal cell, rotated and unrotated alike, and repeated arranges are
// idempotent.

import { describe, expect, it } from "vitest";
import { type ArrangeInput, computeArrangedFrames } from "./layout-arrange.js";

function aabb(f: { width: number; height: number; rotation?: number }) {
  const r = f.rotation ?? 0;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: f.width * c + f.height * s, h: f.width * s + f.height * c };
}

describe("computeArrangedFrames", () => {
  it("passes through when fewer than 2 items", () => {
    const items: ArrangeInput[] = [{ id: "a", frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }];
    expect(computeArrangedFrames(items, "flex")).toEqual(items);
  });

  it("grid: every item fills an equal SQUARE cell sized to the largest footprint", () => {
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } },
      { id: "b", frame: { x: 0.5, y: 0.1, width: 0.2, height: 0.2 } }, // largest footprint 0.2
      { id: "c", frame: { x: 0.1, y: 0.5, width: 0.1, height: 0.1 } },
      { id: "d", frame: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } },
    ];
    const out = computeArrangedFrames(items, "grid");
    expect(out).toHaveLength(4);
    // cellSize = max footprint dim = 0.2 → every cell is a 0.2 square.
    for (const o of out) {
      expect(o.frame.width).toBeCloseTo(0.2, 6);
      expect(o.frame.height).toBeCloseTo(0.2, 6);
    }
    const round = (v: number) => Math.round(v * 1e6) / 1e6;
    expect(new Set(out.map((o) => round(o.frame.x))).size).toBe(2); // 2 columns
    expect(new Set(out.map((o) => round(o.frame.y))).size).toBe(2); // 2 rows
  });

  it("grid: a rotated item's OUTER bound equals the unrotated item's box (equal halves)", () => {
    const items: ArrangeInput[] = [
      { id: "flat", frame: { x: 0.3, y: 0.4, width: 0.2, height: 0.2, rotation: 0 } },
      { id: "tilt", frame: { x: 0.6, y: 0.4, width: 0.2, height: 0.2, rotation: Math.PI / 4 } },
    ];
    const out = computeArrangedFrames(items, "grid");
    const flat = out.find((o) => o.id === "flat")!.frame;
    const tilt = out.find((o) => o.id === "tilt")!.frame;
    // The rotated item keeps its rotation and its AABB equals the unrotated box.
    expect(tilt.rotation).toBeCloseTo(Math.PI / 4, 6);
    const flatAabb = aabb(flat);
    const tiltAabb = aabb(tilt);
    expect(tiltAabb.w).toBeCloseTo(flatAabb.w, 6);
    expect(tiltAabb.h).toBeCloseTo(flatAabb.h, 6);
    expect(flatAabb.w).toBeCloseTo(flatAabb.h, 6); // square cell
    // The 45° item's raw box is its AABB / √2 (it does NOT grow; the flat one
    // grew to the shared cell size instead).
    expect(tilt.width).toBeCloseTo(tiltAabb.w / Math.SQRT2, 6);
  });

  it("grid: repeated arrange is idempotent (no progressive growth/shrink)", () => {
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.3, y: 0.4, width: 0.2, height: 0.2, rotation: 0 } },
      { id: "b", frame: { x: 0.6, y: 0.4, width: 0.2, height: 0.2, rotation: Math.PI / 4 } },
    ];
    const p1 = computeArrangedFrames(items, "grid");
    const p2 = computeArrangedFrames(p1, "grid");
    const p3 = computeArrangedFrames(p2, "grid");
    for (const id of ["a", "b"]) {
      const a = p1.find((o) => o.id === id)!.frame;
      const b = p2.find((o) => o.id === id)!.frame;
      const c = p3.find((o) => o.id === id)!.frame;
      expect(b.width).toBeCloseTo(a.width, 9);
      expect(b.height).toBeCloseTo(a.height, 9);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
      expect(c.width).toBeCloseTo(a.width, 9); // stable after 3 presses
    }
  });

  it("grid: cells are square IN PIXELS on a non-square (16:9) design", () => {
    // 0.2×0.2 ratio on a 1920×1080 design is a 384×216 px rectangle — NOT a
    // square. The arranged outer bounds must be square in PIXELS (what the
    // user sees), and the rotated item's pixel AABB must equal the unrotated
    // item's pixel box.
    const W = 1920;
    const H = 1080;
    const items: ArrangeInput[] = [
      { id: "flat", frame: { x: 0.3, y: 0.4, width: 0.2, height: 0.2, rotation: 0 } },
      { id: "tilt", frame: { x: 0.6, y: 0.4, width: 0.2, height: 0.2, rotation: Math.PI / 4 } },
    ];
    const out = computeArrangedFrames(items, "grid", W, H);
    const pxAabb = (f: { width: number; height: number; rotation?: number }) => {
      const r = f.rotation ?? 0;
      const c = Math.abs(Math.cos(r));
      const s = Math.abs(Math.sin(r));
      const wp = f.width * W;
      const hp = f.height * H;
      return { w: wp * c + hp * s, h: wp * s + hp * c };
    };
    const flat = pxAabb(out.find((o) => o.id === "flat")!.frame);
    const tilt = pxAabb(out.find((o) => o.id === "tilt")!.frame);
    expect(flat.w).toBeCloseTo(flat.h, 6); // square in pixels
    expect(tilt.w).toBeCloseTo(tilt.h, 6); // square in pixels
    expect(tilt.w).toBeCloseTo(flat.w, 6); // equal halves (same pixel square)
  });

  it("flex: arranges into a single row of equal cells (same y, increasing x)", () => {
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.1, y: 0.5, width: 0.15, height: 0.1 } },
      { id: "b", frame: { x: 0.6, y: 0.2, width: 0.15, height: 0.2 } },
      { id: "c", frame: { x: 0.3, y: 0.7, width: 0.15, height: 0.15 } },
    ];
    const out = computeArrangedFrames(items, "flex");
    expect(out).toHaveLength(3);
    const xs = out.map((o) => o.frame.x);
    expect(xs[0]!).toBeLessThan(xs[1]!);
    expect(xs[1]!).toBeLessThan(xs[2]!);
    const ys = out.map((o) => o.frame.y);
    expect(Math.abs(ys[0]! - ys[1]!)).toBeLessThan(1e-9);
    expect(Math.abs(ys[1]! - ys[2]!)).toBeLessThan(1e-9);
  });
});
