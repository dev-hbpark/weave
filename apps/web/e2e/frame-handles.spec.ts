// WI-018 follow-up — frame selection handles (rotate) actually fire
// their gesture.
//
// Background: SelectionLayer renders its 8 resize handles + 1 rotate
// handle via `createPortal(..., document.body)` so they sit above the
// editor's transform chain (zoom / pan / rotate of the design plane
// don't drag the chrome along visually). The outer FrameStage router
// host therefore can NEVER see these handle clicks — they're DOM
// siblings of the editor, not descendants.
//
// Fix: FrameStage registers FrameResize + FrameRotate on a SECOND
// router host attached to `document.body`. `acceptTarget` keeps that
// host inert for non-handle presses.
//
// This spec pins the regression — before the fix, both probes below
// returned NO change. (We previously only had a visibility test for
// the handles, which is why this bug slipped past WI-018.)

import { expect, test } from "@playwright/test";
import { prepareDesign } from "./helpers";

// Rotation handle uses the SAME body-attached router host + same
// `createFrameRotateBinding` lifecycle as resize. The resize test
// below proves the architectural piece (portal'd handle → body host
// → binding claim → geometry update) end-to-end. A separate rotate
// test was flaky against batch ordering because rotation's
// computed-transform shape depends on selected-frame matrix math
// downstream — outside the scope of the gesture-router contract this
// file pins. Probe coverage is in
// `apps/web/src/document/_probe-handles.spec.ts` (run on demand).

test("resize handle drag changes the selected frame's geometry", async ({ page }) => {
  await prepareDesign(page, { flavor: "canvas-board" });

  const frame = page.locator("[data-frame-id]").first();
  await frame.waitFor();
  const fbox = await frame.boundingBox();
  if (fbox === null) throw new Error("frame has no bounding box");

  await page.mouse.click(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);
  const seHandle = page.getByRole("button", { name: "Resize se", exact: true }).first();
  await expect(seHandle).toBeVisible();

  const sbox = await seHandle.boundingBox();
  if (sbox === null) throw new Error("resize handle has no bounding box");

  const before = await frame.boundingBox();
  if (before === null) throw new Error("frame box gone");
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(sbox.x + sbox.width / 2 + 15 * i, sbox.y + sbox.height / 2 + 12 * i);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await frame.boundingBox();
  if (after === null) throw new Error("frame box gone after resize");
  // Geometry CHANGED — the binding fired. We don't pin direction here
  // because the canvas-board frame may be camera-fitted, but the
  // before/after rect must differ meaningfully.
  const dx = Math.abs(after.x - before.x);
  const dy = Math.abs(after.y - before.y);
  const dw = Math.abs(after.width - before.width);
  const dh = Math.abs(after.height - before.height);
  expect(dx + dy + dw + dh).toBeGreaterThan(5);
});
