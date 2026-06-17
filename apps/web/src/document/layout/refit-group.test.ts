// WI-245 / DR-162 — group-hug refit math.

import { describe, expect, it } from "vitest";
import type { ItemFrame } from "../types.js";
import { refitGroupFrames } from "./refit-group.js";

const f = (x: number, y: number, width: number, height: number): ItemFrame => ({
  x,
  y,
  width,
  height,
  rotation: 0,
});

describe("refitGroupFrames", () => {
  it("returns null for an empty group", () => {
    expect(refitGroupFrames(f(0, 0, 1, 1), [])).toBeNull();
  });

  it("an already-tight group is unchanged (children re-relativize to identity)", () => {
    // group {0.1,0.1,0.8,0.8}; a abs {0.1,0.1,0.4,0.4}, b abs {0.5,0.5,0.4,0.4};
    // union = {0.1,0.1,0.8,0.8} (tight).
    const r = refitGroupFrames(f(0.1, 0.1, 0.8, 0.8), [
      { itemId: "a", frame: f(0, 0, 0.5, 0.5) },
      { itemId: "b", frame: f(0.5, 0.5, 0.5, 0.5) },
    ]);
    expect(r).not.toBeNull();
    expect(r?.groupFrame.x).toBeCloseTo(0.1);
    expect(r?.groupFrame.width).toBeCloseTo(0.8);
    expect(r?.childFrames.find((c) => c.itemId === "a")?.frame.x).toBeCloseTo(0);
    expect(r?.childFrames.find((c) => c.itemId === "b")?.frame.x).toBeCloseTo(0.5);
  });

  it("grows to wrap a child moved outside, re-relativizing every child", () => {
    // group {0,0,0.5,0.5}; a {0,0,1,1} abs {0,0,0.5,0.5}; b {1,1,1,1} abs {0.5,0.5,0.5,0.5}.
    // union = {0,0,1,1}.
    const r = refitGroupFrames(f(0, 0, 0.5, 0.5), [
      { itemId: "a", frame: f(0, 0, 1, 1) },
      { itemId: "b", frame: f(1, 1, 1, 1) },
    ]);
    expect(r?.groupFrame).toMatchObject({ x: 0, y: 0 });
    expect(r?.groupFrame.width).toBeCloseTo(1);
    expect(r?.groupFrame.height).toBeCloseTo(1);
    const a = r?.childFrames.find((c) => c.itemId === "a")?.frame;
    const b = r?.childFrames.find((c) => c.itemId === "b")?.frame;
    expect(a).toMatchObject({ x: 0, y: 0 });
    expect(a?.width).toBeCloseTo(0.5);
    expect(b?.x).toBeCloseTo(0.5);
    expect(b?.width).toBeCloseTo(0.5);
  });

  it("preserves each child's rotation", () => {
    const r = refitGroupFrames(f(0, 0, 1, 1), [
      { itemId: "a", frame: { x: 0, y: 0, width: 0.5, height: 0.5, rotation: 0.3 } },
      { itemId: "b", frame: { x: 0.5, y: 0.5, width: 0.5, height: 0.5, rotation: 0 } },
    ]);
    expect(r?.childFrames.find((c) => c.itemId === "a")?.frame.rotation).toBe(0.3);
  });
});
