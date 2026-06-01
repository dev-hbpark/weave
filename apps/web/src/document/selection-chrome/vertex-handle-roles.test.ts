import { describe, expect, it } from "vitest";
import type { FrameGeom } from "./poly-vertex-geometry.js";
import {
  applyDragStrategy,
  classifyPointHandle,
  handleBorderRadius,
  pointTypeOf,
  resolveDragStrategy,
  resolvePointHandle,
} from "./vertex-handle-roles.js";

const GEOM: FrameGeom = { cx: 100, cy: 100, w: 200, h: 200, theta: 0 };

describe("classifyPointHandle", () => {
  it("marks first/last of an OPEN poly as endpoints, interior as vertex", () => {
    expect(classifyPointHandle(0, 4, false)).toBe("endpoint");
    expect(classifyPointHandle(3, 4, false)).toBe("endpoint");
    expect(classifyPointHandle(1, 4, false)).toBe("vertex");
    expect(classifyPointHandle(2, 4, false)).toBe("vertex");
  });
  it("has NO endpoints on a closed ring", () => {
    expect(classifyPointHandle(0, 4, true)).toBe("vertex");
    expect(classifyPointHandle(3, 4, true)).toBe("vertex");
  });
});

describe("role registry — drag strategy", () => {
  it("vertex ignores the modifier (always free-move)", () => {
    const a = resolvePointHandle("vertex");
    expect(resolveDragStrategy(a, false)).toBe("free-move");
    expect(resolveDragStrategy(a, true)).toBe("free-move");
  });

  it("endpoint switches strategy on the modifier (stretch ↔ free-move)", () => {
    const a = resolvePointHandle("endpoint");
    expect(resolveDragStrategy(a, false)).toBe("endpoint-stretch");
    expect(resolveDragStrategy(a, true)).toBe("free-move");
  });
});

describe("DR-033 — point type (shape)", () => {
  it("pointTypeOf: own smooth wins, else global fallback", () => {
    expect(pointTypeOf(true, false)).toBe("smooth");
    expect(pointTypeOf(false, true)).toBe("corner");
    expect(pointTypeOf(undefined, true)).toBe("smooth"); // fallback to global
    expect(pointTypeOf(undefined, false)).toBe("corner");
  });
  it("handleBorderRadius: smooth → circle, corner → square", () => {
    expect(handleBorderRadius("smooth")).toBe("50%");
    expect(handleBorderRadius("corner")).toBe(2);
  });
});

describe("applyDragStrategy", () => {
  const base = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 },
  ];
  const baseScreen = base.map((p) => ({
    x: GEOM.cx - GEOM.w / 2 + p.x * GEOM.w,
    y: GEOM.cy - GEOM.h / 2 + p.y * GEOM.h,
  }));

  it("free-move moves ONLY the dragged point; others are untouched", () => {
    const out = applyDragStrategy("free-move", {
      basePoints: base,
      baseScreen,
      idx: 1,
      anchorIdx: 0,
      geom: GEOM,
      clientX: GEOM.cx, // → local (0.5, ...)
      clientY: GEOM.cy,
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ x: 0, y: 0 }); // unchanged
    expect(out[2]).toEqual({ x: 1, y: 1 }); // unchanged
    expect(out[1]).toEqual({ x: 0.5, y: 0.5 }); // moved to cursor (center → 0.5,0.5)
  });

  it("endpoint-stretch returns a full point set (similarity about the anchor)", () => {
    const out = applyDragStrategy("endpoint-stretch", {
      basePoints: base,
      baseScreen,
      idx: 0,
      anchorIdx: 2,
      geom: GEOM,
      clientX: GEOM.cx - GEOM.w, // drag the start far left
      clientY: GEOM.cy,
    });
    expect(out).toHaveLength(3);
    // The anchor (last point) is the similarity's fixed point → stays put.
    expect(out[2]?.x).toBeCloseTo(1);
    expect(out[2]?.y).toBeCloseTo(1);
  });
});
