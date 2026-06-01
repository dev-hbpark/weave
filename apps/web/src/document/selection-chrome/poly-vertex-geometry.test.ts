import { describe, expect, it } from "vitest";
import {
  endpointSimilarityScreen,
  type FrameGeom,
  localToScreen,
  type PolyFrame,
  parseRotationFromTransform,
  recoverUnrotatedSize,
  refitFrameToPoints,
  screenToLocal,
} from "./poly-vertex-geometry.js";

describe("parseRotationFromTransform", () => {
  it("returns 0 for none / empty / unparseable", () => {
    expect(parseRotationFromTransform("none")).toBe(0);
    expect(parseRotationFromTransform("")).toBe(0);
    expect(parseRotationFromTransform(null)).toBe(0);
    expect(parseRotationFromTransform("translateX(10px)")).toBe(0);
  });

  it("extracts the angle from a 2D matrix", () => {
    const deg = 30;
    const rad = (deg * Math.PI) / 180;
    const a = Math.cos(rad);
    const b = Math.sin(rad);
    const t = `matrix(${a}, ${b}, ${-b}, ${a}, 0, 0)`;
    expect(parseRotationFromTransform(t)).toBeCloseTo(rad);
  });
});

describe("recoverUnrotatedSize", () => {
  it("returns the AABB-implied size unchanged at θ=0 (denom = r)", () => {
    // r = 2, aabbWidth = 200 → h = 200/2 = 100, w = 200.
    const { w, h } = recoverUnrotatedSize(200, 2, 0, { w: 0, h: 0 });
    expect(w).toBeCloseTo(200);
    expect(h).toBeCloseTo(100);
  });

  it("is exact at 45° where the AABB-only solve is singular", () => {
    // Square (r=1) rotated 45°: AABBw = W·√2 → W = AABBw/√2.
    const aabb = 141.421356; // 100·√2
    const { w, h } = recoverUnrotatedSize(aabb, 1, Math.PI / 4, { w: 0, h: 0 });
    expect(w).toBeCloseTo(100, 3);
    expect(h).toBeCloseTo(100, 3);
  });

  it("falls back when the aspect ratio yields a degenerate denominator", () => {
    const fallback = { w: 7, h: 9 };
    expect(recoverUnrotatedSize(100, 0, 0, fallback)).toEqual(fallback);
  });
});

describe("localToScreen / screenToLocal", () => {
  const g: FrameGeom = { cx: 500, cy: 300, w: 200, h: 100, theta: 0 };

  it("maps frame center (0.5,0.5) to the geom center", () => {
    expect(localToScreen(g, 0.5, 0.5)).toEqual({ x: 500, y: 300 });
  });

  it("round-trips local → screen → local (axis-aligned)", () => {
    const local = { x: 0.2, y: 0.8 };
    const screen = localToScreen(g, local.x, local.y);
    const back = screenToLocal(g, screen.x, screen.y);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
  });

  it("round-trips under rotation", () => {
    const rg: FrameGeom = { ...g, theta: Math.PI / 5 };
    const local = { x: 0.1, y: 0.65 };
    const screen = localToScreen(rg, local.x, local.y);
    const back = screenToLocal(rg, screen.x, screen.y);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
  });
});

describe("refitFrameToPoints", () => {
  const frame: PolyFrame = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 };

  it("refits an axis-aligned frame to tightly contain the points and renormalizes", () => {
    const pts = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.75 },
    ];
    const out = refitFrameToPoints(pts, frame, 0);
    expect(out.frame).toBeDefined();
    // new x = frame.x + minX*frame.width = 0.1 + 0.25*0.4 = 0.2
    expect(out.frame?.x).toBeCloseTo(0.2);
    expect(out.frame?.width).toBeCloseTo(0.5 * 0.4); // span 0.5 * old width
    // points renormalize to the [0,1] corners of the new box
    expect(out.points[0]).toEqual({ x: 0, y: 0 });
    expect(out.points[1]).toEqual({ x: 1, y: 1 });
  });

  it("leaves a rotated frame unchanged and just clamps points (legacy)", () => {
    const pts = [
      { x: -0.2, y: 0.5 },
      { x: 1.3, y: 0.5 },
    ];
    const out = refitFrameToPoints(pts, frame, Math.PI / 6);
    expect(out.frame).toBeUndefined();
    expect(out.points[0]).toEqual({ x: 0, y: 0.5 }); // clamped to [0,1]
    expect(out.points[1]).toEqual({ x: 1, y: 0.5 });
  });

  it("keeps a hairline dimension and centers a collapsed (straight-line) axis", () => {
    const pts = [
      { x: 0.2, y: 0.5 },
      { x: 0.8, y: 0.5 }, // identical Y → collapsed vertical axis
    ];
    const out = refitFrameToPoints(pts, frame, 0);
    expect(out.frame?.height).toBeGreaterThan(0); // hairline, not zero
    expect(out.frame?.height).toBeCloseTo(1e-3 * frame.height);
    expect(out.points[0]?.y).toBe(0.5); // collapsed axis centers points
    expect(out.points[1]?.y).toBe(0.5);
  });
});

describe("endpointSimilarityScreen", () => {
  it("scales the whole polyline uniformly about the anchor", () => {
    // anchor at index 0; dragging index 1 from (10,0) to (20,0) → ×2 scale.
    const baseScreen = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const out = endpointSimilarityScreen(baseScreen, 0, 20, 0, 1);
    expect(out).not.toBeNull();
    expect(out?.[0]).toEqual({ x: 0, y: 0 }); // anchor fixed
    expect(out?.[1]?.x).toBeCloseTo(20);
    expect(out?.[1]?.y).toBeCloseTo(0);
  });

  it("rotates as well as scales (similarity preserves shape)", () => {
    // drag (10,0) to (0,10): a 90° rotation about the anchor.
    const baseScreen = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const out = endpointSimilarityScreen(baseScreen, 0, 0, 10, 1);
    expect(out?.[1]?.x).toBeCloseTo(0);
    expect(out?.[1]?.y).toBeCloseTo(10);
  });

  it("returns null for a degenerate (zero-length) base endpoint vector", () => {
    const baseScreen = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(endpointSimilarityScreen(baseScreen, 0, 99, 99, 1)).toBeNull();
  });
});
