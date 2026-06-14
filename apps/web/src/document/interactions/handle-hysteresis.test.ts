// Hover-handle hysteresis geometry (user report 2026-06-14): handles are
// drawn outside the item body, so the hover target must NOT switch until
// the pointer fully leaves the handle area — otherwise the handle unmounts
// before it can be clicked. `pointerWithinRects` is the pure decision that
// keeps the current item hovered while the pointer is still in reach.

import { describe, expect, it } from "vitest";
import { pointerWithinRects } from "./handle-hysteresis.js";

const rect = (left: number, top: number, w: number, h: number): DOMRectReadOnly =>
  ({
    left,
    top,
    width: w,
    height: h,
    right: left + w,
    bottom: top + h,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRectReadOnly;

describe("pointerWithinRects — handle hysteresis", () => {
  // A rotate knob ~24px above a frame's top edge: 10px tall, centered at y=-24
  // relative to a frame whose body top edge is y=200. Knob rect ≈ [195..205].
  const rotateKnob = rect(300, 171, 10, 10); // 171..181

  it("the handle itself is within reach", () => {
    expect(pointerWithinRects(305, 176, [rotateKnob])).toBe(true);
  });

  it("bridges the gap between the body edge and the handle (margin)", () => {
    // The frame's top edge sits at y=200; the knob ends at y=181. The 19px
    // gap is bare canvas — with a 24px margin it still reads as "within reach"
    // so the chrome survives the trip from body to knob.
    expect(pointerWithinRects(305, 195, [rotateKnob])).toBe(true);
  });

  it("returns false once the pointer fully leaves the handle area", () => {
    // 60px above the knob — clearly gone.
    expect(pointerWithinRects(305, 110, [rotateKnob])).toBe(false);
    // Far to the side.
    expect(pointerWithinRects(500, 176, [rotateKnob])).toBe(false);
  });

  it("is inert with no handle rects (item shows no handles)", () => {
    expect(pointerWithinRects(305, 176, [])).toBe(false);
  });

  it("honours an explicit margin override", () => {
    // 30px below the knob's bottom (181): outside the default 24px margin…
    expect(pointerWithinRects(305, 211, [rotateKnob])).toBe(false);
    // …but inside an explicit 40px margin.
    expect(pointerWithinRects(305, 211, [rotateKnob], 40)).toBe(true);
  });

  it("matches when inside ANY of several handle rects", () => {
    const corners = [rect(0, 0, 8, 8), rect(400, 0, 8, 8), rect(0, 400, 8, 8)];
    expect(pointerWithinRects(404, 4, corners)).toBe(true); // top-right corner
    expect(pointerWithinRects(200, 200, corners)).toBe(false); // dead center, no handle
  });
});
