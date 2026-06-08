// WI-147 — two-finger trackpad pan vs. the browser back-swipe.
//
// Regression: the wheel-driven canvas pan listener (FrameStage) only
// attached on `infiniteCanvas` flavors, and `infiniteCanvas` was gated to
// `mixed` ONLY. On `canvas-board` (a free-placement flavor that shares
// mixed's seed model) the listener never attached, so a trackpad two-finger
// horizontal swipe fell through to the browser's back/forward navigation
// gesture: panning was dead AND the page navigated back. There was also no
// `overscroll-behavior` net to catch the gesture in the stacked flavors.
//
// Two fixes, two guards here:
//   1. `overscroll-behavior-x: none` on html+body — blocks the back-swipe at
//      the platform layer in EVERY flavor, independent of any JS listener.
//   2. `canvas-board` now activates `infiniteCanvas`, so the wheel pan
//      listener attaches and a two-finger wheel pans the camera.

import { expect, test } from "@playwright/test";
import { prepareDesign } from "./helpers";

// The infinite-canvas pan transform lives on the element that wraps the
// `data-design-plane` node — `translate(${pan.tx}px, ${pan.ty}px) scale(...)`
// in FrameStage. Read that element's inline transform directly rather than
// DFS-scanning for the first identity matrix (which can latch onto an
// unrelated identity-transformed wrapper).
const readPanXY = async (page: import("@playwright/test").Page) =>
  await page.evaluate(() => {
    const plane = document.querySelector('[data-design-plane="true"]') as HTMLElement | null;
    const layer = plane?.parentElement as HTMLElement | null;
    const t = layer?.style.transform ?? "";
    const m = t.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\s*\)/);
    if (m === null) return null;
    return { tx: Number.parseFloat(m[1]), ty: Number.parseFloat(m[2]) };
  });

test("overscroll-behavior-x is pinned to none on html and body (back-swipe net)", async ({
  page,
}) => {
  // Any flavor — the net is global. Use the stacked flavor that has no pan
  // listener at all, so the CSS net is the ONLY thing blocking the gesture.
  await prepareDesign(page, { flavor: "slide-deck" });

  const overscroll = await page.evaluate(() => ({
    html: window.getComputedStyle(document.documentElement).overscrollBehaviorX,
    body: window.getComputedStyle(document.body).overscrollBehaviorX,
  }));
  expect(overscroll.html).toBe("none");
  expect(overscroll.body).toBe("none");
});

test("canvas-board pans the camera on a two-finger wheel (listener attaches)", async ({ page }) => {
  await prepareDesign(page, { flavor: "canvas-board" });
  const stage = page.locator('[data-testid="frame-stage"]');
  const sbox = await stage.boundingBox();
  if (sbox === null) throw new Error("no stage box");

  const before = await readPanXY(page);
  // Pre-fix `infiniteCanvas` was false for canvas-board → no pan transform on
  // the layer at all (`before` would be null). Post-fix the layer exists at
  // the identity translate.
  expect(before).toEqual({ tx: 0, ty: 0 });

  // Two-finger trackpad pan surfaces as a plain (non-ctrl) wheel with
  // deltaX/deltaY. The handler maps it to `tx -= deltaX, ty -= deltaY`.
  const cx = sbox.x + sbox.width / 2;
  const cy = sbox.y + sbox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(-120, -90); // negative delta → pan moves +120,+90
  await page.waitForTimeout(120);

  const after = await readPanXY(page);
  expect(after).not.toBeNull();
  // The camera translates by the inverse of the wheel delta.
  expect(Math.abs((after?.tx ?? 0) - 120)).toBeLessThan(5);
  expect(Math.abs((after?.ty ?? 0) - 90)).toBeLessThan(5);
});
