// Pure-function tests for `computeAlignedFrames`. The host wiring
// (selection read → resizeMulti dispatch → patch round-trip) is covered
// by the e2e; here we focus on the math.

import { describe, expect, it } from "vitest";
import {
  ALIGN_OPS_ORDER,
  type AlignInput,
  computeAlignedFrames,
} from "./align-ops.js";

function frame(x: number, y: number, w: number, h: number) {
  return { x, y, width: w, height: h };
}

function item(id: string, x: number, y: number, w = 0.1, h = 0.1): AlignInput {
  return { id, frame: frame(x, y, w, h) };
}

describe("computeAlignedFrames — registry", () => {
  it("exposes all 8 ops in ALIGN_OPS_ORDER", () => {
    expect(ALIGN_OPS_ORDER).toHaveLength(8);
    expect(new Set(ALIGN_OPS_ORDER).size).toBe(8); // no duplicates
  });

  it("returns the input untouched for an empty selection", () => {
    expect(computeAlignedFrames([], "align-left")).toEqual([]);
    expect(computeAlignedFrames([], "distribute-horizontal")).toEqual([]);
  });

  it("preserves input order in the output for every op (host can splice by index)", () => {
    const inp = [item("c", 0.3, 0.1), item("a", 0.1, 0.2), item("b", 0.5, 0.4)];
    for (const op of ALIGN_OPS_ORDER) {
      const out = computeAlignedFrames(inp, op);
      expect(out.map((o) => o.id)).toEqual(["c", "a", "b"]);
    }
  });
});

describe("computeAlignedFrames — align horizontal", () => {
  it("align-left snaps every x to the leftmost x", () => {
    const inp = [item("a", 0.2, 0.1), item("b", 0.5, 0.2), item("c", 0.1, 0.3)];
    const out = computeAlignedFrames(inp, "align-left");
    expect(out.map((o) => o.frame.x)).toEqual([0.1, 0.1, 0.1]);
    // y / width / height untouched.
    expect(out.map((o) => o.frame.y)).toEqual([0.1, 0.2, 0.3]);
    expect(out.map((o) => o.frame.width)).toEqual([0.1, 0.1, 0.1]);
  });

  it("align-right snaps every right edge to the rightmost right edge", () => {
    const inp = [
      item("a", 0.2, 0.1, 0.1),
      item("b", 0.5, 0.2, 0.2), // right edge = 0.7
      item("c", 0.1, 0.3, 0.1),
    ];
    const out = computeAlignedFrames(inp, "align-right");
    // Right edge target = 0.7. Each item.x = 0.7 - width.
    expect(out[0]!.frame.x).toBeCloseTo(0.6, 10);
    expect(out[1]!.frame.x).toBeCloseTo(0.5, 10); // unchanged (it set the target)
    expect(out[2]!.frame.x).toBeCloseTo(0.6, 10);
  });

  it("align-horizontal-center centers items about the bbox center", () => {
    const inp = [
      item("a", 0.1, 0.1, 0.1), // bbox spans 0.1..0.6 (a) + 0.4..0.6 (b) = 0.1..0.6
      item("b", 0.4, 0.2, 0.2),
    ];
    const out = computeAlignedFrames(inp, "align-horizontal-center");
    // bbox center = (0.1 + 0.6) / 2 = 0.35
    // a: 0.35 - 0.1/2 = 0.30
    // b: 0.35 - 0.2/2 = 0.25
    expect(out[0]!.frame.x).toBeCloseTo(0.3, 10);
    expect(out[1]!.frame.x).toBeCloseTo(0.25, 10);
  });
});

describe("computeAlignedFrames — align vertical", () => {
  it("align-top snaps every y to the topmost y", () => {
    const inp = [item("a", 0.1, 0.3), item("b", 0.2, 0.1), item("c", 0.3, 0.2)];
    const out = computeAlignedFrames(inp, "align-top");
    expect(out.map((o) => o.frame.y)).toEqual([0.1, 0.1, 0.1]);
  });

  it("align-bottom snaps every bottom edge to the bottommost bottom edge", () => {
    const inp = [
      item("a", 0.1, 0.3, 0.1, 0.1), // bottom = 0.4
      item("b", 0.2, 0.1, 0.1, 0.2), // bottom = 0.3
      item("c", 0.3, 0.2, 0.1, 0.3), // bottom = 0.5 ← target
    ];
    const out = computeAlignedFrames(inp, "align-bottom");
    expect(out[0]!.frame.y).toBeCloseTo(0.4, 10); // 0.5 - 0.1
    expect(out[1]!.frame.y).toBeCloseTo(0.3, 10); // 0.5 - 0.2
    expect(out[2]!.frame.y).toBeCloseTo(0.2, 10); // unchanged
  });

  it("align-vertical-center centers items about the bbox vertical center", () => {
    const inp = [
      item("a", 0.1, 0.1, 0.1, 0.1), // top=0.1, bottom=0.2
      item("b", 0.2, 0.4, 0.1, 0.2), // top=0.4, bottom=0.6
    ];
    const out = computeAlignedFrames(inp, "align-vertical-center");
    // bbox: top=0.1, bottom=0.6, center=0.35
    // a: 0.35 - 0.1/2 = 0.3
    // b: 0.35 - 0.2/2 = 0.25
    expect(out[0]!.frame.y).toBeCloseTo(0.3, 10);
    expect(out[1]!.frame.y).toBeCloseTo(0.25, 10);
  });
});

describe("computeAlignedFrames — distribute", () => {
  it("distribute-horizontal places equal gaps between items along x", () => {
    // Span 0..1.0. Three items of width 0.1 each → total 0.3.
    // Gap = (1.0 - 0.3) / (3 - 1) = 0.35.
    const inp = [
      item("a", 0.0, 0.2, 0.1, 0.1),
      item("b", 0.6, 0.3, 0.1, 0.1),
      item("c", 0.9, 0.4, 0.1, 0.1),
    ];
    const out = computeAlignedFrames(inp, "distribute-horizontal");
    expect(out[0]!.frame.x).toBeCloseTo(0.0, 10); // first untouched
    expect(out[1]!.frame.x).toBeCloseTo(0.45, 10); // 0 + 0.1 + 0.35
    expect(out[2]!.frame.x).toBeCloseTo(0.9, 10); // last untouched
  });

  it("distribute-vertical places equal gaps along y", () => {
    const inp = [
      item("a", 0.2, 0.0, 0.1, 0.1),
      item("b", 0.3, 0.6, 0.1, 0.1),
      item("c", 0.4, 0.9, 0.1, 0.1),
    ];
    const out = computeAlignedFrames(inp, "distribute-vertical");
    expect(out[0]!.frame.y).toBeCloseTo(0.0, 10);
    expect(out[1]!.frame.y).toBeCloseTo(0.45, 10);
    expect(out[2]!.frame.y).toBeCloseTo(0.9, 10);
  });

  it("distribute is a no-op for n < 3", () => {
    const two = [item("a", 0.1, 0.1), item("b", 0.7, 0.7)];
    expect(computeAlignedFrames(two, "distribute-horizontal")).toEqual(two);
    expect(computeAlignedFrames(two, "distribute-vertical")).toEqual(two);
    const one = [item("a", 0.1, 0.1)];
    expect(computeAlignedFrames(one, "distribute-horizontal")).toEqual(one);
  });

  it("distribute-horizontal sorts internally and still returns input order", () => {
    // Items handed in NOT sorted by x.
    const inp = [
      item("c", 0.9, 0.4, 0.1, 0.1),
      item("a", 0.0, 0.2, 0.1, 0.1),
      item("b", 0.6, 0.3, 0.1, 0.1),
    ];
    const out = computeAlignedFrames(inp, "distribute-horizontal");
    // Output order = input order, but x values match the SORTED roles.
    expect(out.map((o) => o.id)).toEqual(["c", "a", "b"]);
    // c is the rightmost → last → x=0.9 unchanged
    expect(out[0]!.frame.x).toBeCloseTo(0.9, 10);
    // a is the leftmost → first → x=0.0 unchanged
    expect(out[1]!.frame.x).toBeCloseTo(0.0, 10);
    // b is the middle → x=0.45
    expect(out[2]!.frame.x).toBeCloseTo(0.45, 10);
  });

  it("distribute keeps y / width / height untouched (axis-only operation)", () => {
    const inp = [
      item("a", 0.0, 0.2, 0.1, 0.1),
      item("b", 0.6, 0.3, 0.15, 0.15),
      item("c", 0.9, 0.4, 0.1, 0.1),
    ];
    const out = computeAlignedFrames(inp, "distribute-horizontal");
    expect(out.map((o) => o.frame.y)).toEqual([0.2, 0.3, 0.4]);
    expect(out.map((o) => o.frame.width)).toEqual([0.1, 0.15, 0.1]);
    expect(out.map((o) => o.frame.height)).toEqual([0.1, 0.15, 0.1]);
  });
});

describe("computeAlignedFrames — degenerate inputs", () => {
  it("single-item align is a positional no-op (within FP tolerance)", () => {
    const one = [item("a", 0.3, 0.4, 0.1, 0.1)];
    // align-right re-derives x as `max(x+w) - w` — FP round-trip leaves
    // ≤ ε drift. The visual result is unchanged; assert with tolerance.
    expect(computeAlignedFrames(one, "align-left")[0]!.frame.x).toBeCloseTo(0.3, 10);
    expect(computeAlignedFrames(one, "align-right")[0]!.frame.x).toBeCloseTo(0.3, 10);
    expect(computeAlignedFrames(one, "align-horizontal-center")[0]!.frame.x).toBeCloseTo(
      0.3,
      10,
    );
  });

  it("already-aligned items survive without drift", () => {
    const inp = [item("a", 0.1, 0.1), item("b", 0.1, 0.3), item("c", 0.1, 0.5)];
    const out = computeAlignedFrames(inp, "align-left");
    expect(out.map((o) => o.frame.x)).toEqual([0.1, 0.1, 0.1]);
  });
});
