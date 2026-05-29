// WI-048 — computeArrangedFrames pure-function tests. Arrange divides the
// items' rubber-band (their current outer-bounds union) into cols × rows equal
// RECTANGULAR cells and resizes each item so its outer bounds fill its cell.
// The band is preserved exactly: the arranged union equals the band — it never
// grows past it nor collapses to a strip inside it. Equal cells give equal
// footprints; a rotated item solves for the raw box whose AABB fills the cell.

import { describe, expect, it } from "vitest";
import { type ArrangeInput, computeArrangedFrames } from "./layout-arrange.js";

type F = { x: number; y: number; width: number; height: number; rotation?: number };

/** Pixel-space AABB of a frame on a W×H design. */
function aabb(f: F, W = 1, H = 1) {
  const r = f.rotation ?? 0;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const wp = f.width * W;
  const hp = f.height * H;
  return { w: wp * c + hp * s, h: wp * s + hp * c };
}

/** Pixel-space union of the items' outer bounds — the rubber-band. */
function bandOf(frames: F[], W = 1, H = 1) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const f of frames) {
    const a = aabb(f, W, H);
    const cx = (f.x + f.width / 2) * W;
    const cy = (f.y + f.height / 2) * H;
    minX = Math.min(minX, cx - a.w / 2);
    minY = Math.min(minY, cy - a.h / 2);
    maxX = Math.max(maxX, cx + a.w / 2);
    maxY = Math.max(maxY, cy + a.h / 2);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

describe("computeArrangedFrames", () => {
  it("passes through when fewer than 2 items", () => {
    const items: ArrangeInput[] = [{ id: "a", frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }];
    expect(computeArrangedFrames(items, "flex")).toEqual(items);
  });

  it("grid: tiles the band with equal rectangular cells (union == band)", () => {
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } },
      { id: "b", frame: { x: 0.5, y: 0.1, width: 0.2, height: 0.2 } },
      { id: "c", frame: { x: 0.1, y: 0.5, width: 0.1, height: 0.1 } },
      { id: "d", frame: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } },
    ];
    const band0 = bandOf(items.map((it) => it.frame));
    const out = computeArrangedFrames(items, "grid");
    // Band: x 0.1..0.7 (w 0.6), y 0.1..0.6 (h 0.5). 2×2 → cell 0.3 × 0.25.
    for (const o of out) {
      expect(o.frame.width).toBeCloseTo(0.3, 6);
      expect(o.frame.height).toBeCloseTo(0.25, 6);
    }
    // The arranged union exactly fills the original band — no grow, no collapse.
    const band1 = bandOf(out.map((o) => o.frame));
    expect(band1.x).toBeCloseTo(band0.x, 6);
    expect(band1.y).toBeCloseTo(band0.y, 6);
    expect(band1.w).toBeCloseTo(band0.w, 6);
    expect(band1.h).toBeCloseTo(band0.h, 6);
  });

  it("grid: a rotated item's outer bound equals the unrotated item's (equal halves, fills band)", () => {
    const items: ArrangeInput[] = [
      { id: "flat", frame: { x: 0.3, y: 0.4, width: 0.2, height: 0.2, rotation: 0 } },
      { id: "tilt", frame: { x: 0.6, y: 0.4, width: 0.2, height: 0.2, rotation: Math.PI / 6 } },
    ];
    const band0 = bandOf(items.map((it) => it.frame));
    const out = computeArrangedFrames(items, "grid");
    const flat = out.find((o) => o.id === "flat")!.frame;
    const tilt = out.find((o) => o.id === "tilt")!.frame;
    // Rotation preserved; the rotated item's AABB equals the unrotated box —
    // both fill an equal half of the band.
    expect(tilt.rotation).toBeCloseTo(Math.PI / 6, 6);
    const fa = aabb(flat);
    const ta = aabb(tilt);
    expect(ta.w).toBeCloseTo(fa.w, 6);
    expect(ta.h).toBeCloseTo(fa.h, 6);
    // Union still equals the band.
    const band1 = bandOf(out.map((o) => o.frame));
    expect(band1.w).toBeCloseTo(band0.w, 6);
    expect(band1.h).toBeCloseTo(band0.h, 6);
  });

  it("grid: repeated arrange is idempotent (no progressive growth/shrink)", () => {
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.3, y: 0.4, width: 0.2, height: 0.2, rotation: 0 } },
      { id: "b", frame: { x: 0.6, y: 0.4, width: 0.2, height: 0.2, rotation: Math.PI / 6 } },
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

  it("flex: many items fill the band height — no collapse to a center strip", () => {
    // The bug: a wide flex row of small items shrank to tiny squares in a thin
    // center strip. Each item must now fill the full band height (cellH = bandH).
    const items: ArrangeInput[] = [
      { id: "a", frame: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 } },
      { id: "b", frame: { x: 0.3, y: 0.5, width: 0.1, height: 0.1 } },
      { id: "c", frame: { x: 0.5, y: 0.1, width: 0.1, height: 0.1 } },
      { id: "d", frame: { x: 0.7, y: 0.6, width: 0.1, height: 0.1 } },
      { id: "e", frame: { x: 0.85, y: 0.3, width: 0.1, height: 0.1 } },
    ];
    const band0 = bandOf(items.map((it) => it.frame)); // w 0.85, h 0.6
    const out = computeArrangedFrames(items, "flex");
    for (const o of out) {
      expect(o.frame.height).toBeCloseTo(band0.h, 6); // fills band height
      expect(o.frame.width).toBeCloseTo(band0.w / 5, 6); // one of 5 columns
    }
    const band1 = bandOf(out.map((o) => o.frame));
    expect(band1.w).toBeCloseTo(band0.w, 6);
    expect(band1.h).toBeCloseTo(band0.h, 6); // NOT collapsed
  });

  it("fills the band in PIXELS on a non-square (16:9) design", () => {
    const W = 1920;
    const H = 1080;
    const items: ArrangeInput[] = [
      { id: "flat", frame: { x: 0.3, y: 0.4, width: 0.2, height: 0.2, rotation: 0 } },
      { id: "tilt", frame: { x: 0.6, y: 0.4, width: 0.2, height: 0.2, rotation: Math.PI / 6 } },
    ];
    const band0 = bandOf(items.map((it) => it.frame), W, H);
    const out = computeArrangedFrames(items, "grid", W, H);
    const flat = aabb(out.find((o) => o.id === "flat")!.frame, W, H);
    const tilt = aabb(out.find((o) => o.id === "tilt")!.frame, W, H);
    expect(tilt.w).toBeCloseTo(flat.w, 4); // equal halves in pixels
    expect(tilt.h).toBeCloseTo(flat.h, 4);
    const band1 = bandOf(out.map((o) => o.frame), W, H);
    expect(band1.w).toBeCloseTo(band0.w, 3);
    expect(band1.h).toBeCloseTo(band0.h, 3);
  });

  it("flex: arranges into a single row of cells (same y, increasing x)", () => {
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
