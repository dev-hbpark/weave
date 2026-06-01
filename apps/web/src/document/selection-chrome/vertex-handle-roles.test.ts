import { describe, expect, it } from "vitest";
import type { FrameGeom } from "./poly-vertex-geometry.js";
import {
  applyDragStrategy,
  classifyPointHandle,
  isModifierSensitive,
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

describe("role registry — polymorphic visual + strategy", () => {
  it("vertex ignores the modifier (always free-move, always round)", () => {
    const a = resolvePointHandle("vertex");
    expect(isModifierSensitive(a)).toBe(false);
    expect(resolveDragStrategy(a, false)).toBe("free-move");
    expect(resolveDragStrategy(a, true)).toBe("free-move");
    expect(a.visual(false)).toEqual({ borderRadius: "50%" });
    expect(a.visual(true)).toEqual({ borderRadius: "50%" });
  });

  it("endpoint switches strategy + shape on the modifier", () => {
    const a = resolvePointHandle("endpoint");
    expect(isModifierSensitive(a)).toBe(true);
    // no modifier → stretch (square)
    expect(resolveDragStrategy(a, false)).toBe("endpoint-stretch");
    expect(a.visual(false)).toEqual({ borderRadius: 2, mode: "stretch" });
    // modifier held → free-move (round, like an interior vertex)
    expect(resolveDragStrategy(a, true)).toBe("free-move");
    expect(a.visual(true)).toEqual({ borderRadius: "50%", mode: "free" });
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
