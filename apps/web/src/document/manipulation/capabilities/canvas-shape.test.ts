import { describe, expect, it, vi } from "vitest";
import { FULL_FRAME } from "../../types.js";
import type { CanvasShape, Item } from "../../types.js";
import type { HandleDir } from "../types.js";
import { canvasShapeTargetFor, createCanvasShapeCapability } from "./canvas-shape.js";

function makeShape(overrides: Partial<CanvasShape> = {}): CanvasShape {
  return {
    id: "s1",
    x: 20,
    y: 30,
    width: 40,
    height: 20,
    rotation: 0,
    hue: "#ff00ff",
    ...overrides,
  };
}

function makeItem(shapes: CanvasShape[]): Item<"canvas-design"> {
  return {
    id: "item-1",
    kind: "canvas-design",
    attrs: { frame: FULL_FRAME, summary: "test", shapes },
    behaviors: [],
    createdAt: "t",
  };
}

function setup(initial: CanvasShape) {
  const captured: Partial<CanvasShape>[] = [];
  const updateShape = vi.fn((_itemId: string, _shapeId: string, patch: Partial<CanvasShape>) => {
    captured.push(patch);
  });
  const removeShape = vi.fn();
  const capability = createCanvasShapeCapability({ updateShape, removeShape });
  const item = makeItem([initial]);
  const target = canvasShapeTargetFor(item, initial);
  return { capability, target, captured, updateShape, removeShape };
}

describe("canvas-shape resize — corner / edge anchored", () => {
  it.each<[HandleDir, { dw: number; dh: number }, Partial<CanvasShape>]>([
    // E drag right by 5 → only width grows
    ["e", { dw: 5, dh: 0 }, { x: 20, y: 30, width: 45, height: 20 }],
    // E drag left by 5 → only width shrinks
    ["e", { dw: -5, dh: 0 }, { x: 20, y: 30, width: 35, height: 20 }],
    // W drag right by 5 → left edge moves right (x advances, width shrinks). Right edge fixed.
    ["w", { dw: 5, dh: 0 }, { x: 25, y: 30, width: 35, height: 20 }],
    // W drag left by 5 → left edge moves left (x retreats, width grows). Right edge fixed.
    ["w", { dw: -5, dh: 0 }, { x: 15, y: 30, width: 45, height: 20 }],
    // N drag down by 5 → top edge moves down (y advances, height shrinks). Bottom fixed.
    ["n", { dw: 0, dh: 5 }, { x: 20, y: 35, width: 40, height: 15 }],
    // S drag down by 5 → height grows. Top fixed.
    ["s", { dw: 0, dh: 5 }, { x: 20, y: 30, width: 40, height: 25 }],
    // NE drag right+up — top edge moves up (y retreats, height grows), right edge moves right.
    // Wait — N + dh > 0 means pointer moved DOWN. For "up" the dh would be negative.
    // Drag NE: pointer right (+dw) + up (-dh).
    ["ne", { dw: 5, dh: -5 }, { x: 20, y: 25, width: 45, height: 25 }],
    // SW drag left+down — left moves left, bottom moves down.
    ["sw", { dw: -5, dh: 5 }, { x: 15, y: 30, width: 45, height: 25 }],
    // NW drag right+down — left moves right (x advances), top moves down (y advances).
    ["nw", { dw: 5, dh: 5 }, { x: 25, y: 35, width: 35, height: 15 }],
    // SE drag right+down — right moves right, bottom moves down.
    ["se", { dw: 5, dh: 5 }, { x: 20, y: 30, width: 45, height: 25 }],
  ])("%s handle with %j produces %j", (dir, delta, expected) => {
    const initial = makeShape();
    const { capability, target, captured } = setup(initial);
    capability.resize?.apply(target, { ...delta, dir });
    expect(captured).toHaveLength(1);
    const patch = captured[0]!;
    expect(patch.x).toBe(expected.x);
    expect(patch.y).toBe(expected.y);
    expect(patch.width).toBe(expected.width);
    expect(patch.height).toBe(expected.height);
  });

  it("clamps to MIN_SIZE so width never crosses zero", () => {
    const initial = makeShape({ width: 6 });
    const { capability, target, captured } = setup(initial);
    capability.resize?.apply(target, { dw: -100, dh: 0, dir: "e" });
    expect(captured[0]?.width).toBe(0.02);
  });

  it("W shrink to MIN_SIZE pins the right edge", () => {
    const initial = makeShape({ x: 20, width: 6 });
    const { capability, target, captured } = setup(initial);
    capability.resize?.apply(target, { dw: 100, dh: 0, dir: "w" });
    expect(captured[0]?.width).toBe(0.02);
    // Right edge of the original was at x+width=26. After clamp the right edge
    // stays put, so the new x = 26 - MIN_SIZE = 25.98.
    expect(captured[0]?.x).toBeCloseTo(25.98, 5);
  });
});

describe("canvas-shape move + rotate (regression)", () => {
  it("move adds dx/dy to current position", () => {
    const initial = makeShape();
    const { capability, target, captured } = setup(initial);
    capability.move?.apply(target, { dx: 3, dy: -4 });
    expect(captured[0]).toEqual({ x: 23, y: 26 });
  });

  it("rotate adds delta to current rotation", () => {
    const initial = makeShape({ rotation: 1 });
    const { capability, target, captured } = setup(initial);
    capability.rotate?.apply(target, 0.5);
    expect(captured[0]).toEqual({ rotation: 1.5 });
  });
});
