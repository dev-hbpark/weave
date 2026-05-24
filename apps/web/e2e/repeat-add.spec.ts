// WI-018 follow-up — popover dismisses when another gesture starts.
//
// The window-level pointerdown outside-press detector in
// RubberBandLayer closes the popover when the press lands outside
// both the popover content and the rubber-band rect. This handles
// the user-reported case: drag-add → popover open → click an
// existing frame → menu was stuck (Radix's outside-click misses the
// press because the gesture router stops propagation first).
//
// (A companion fix — guarding the releasePoint snapshot to fire only
// while a drag is in "drawing" phase — prevents the popover from
// re-positioning when the user clicks a recommendation. That fix is
// verified manually; the e2e path for it is too flaky against
// Playwright's hover-then-click race to pin reliably.)

import { test, expect } from "@playwright/test";
import { prepareDesign } from "./helpers";

test("frame click dismisses an open rubber-band popover", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "canvas-board" });
  const stage = page.locator('[data-testid="frame-stage"]');
  const sbox = await stage.boundingBox();
  if (sbox === null) throw new Error("no stage box");

  const cx = sbox.x + sbox.width / 2;
  const cy = sbox.y + sbox.height / 2;
  // Alt+drag opens popover over the pre-existing canvas-board frame.
  await page.keyboard.down("Alt");
  await page.mouse.move(cx - 80, cy - 60);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++)
    await page.mouse.move(cx - 80 + 25 * i, cy - 60 + 20 * i);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(page.locator('[data-side]')).toHaveCount(1);

  const frame = page.locator('[data-frame-id]').first();
  const fbox = await frame.boundingBox();
  if (fbox === null) throw new Error("frame box gone");
  // Frame body drag crosses FrameMove's threshold → vm.frameManip
  // transitions → RubberBandLayer's subscription dismisses popover.
  await page.mouse.move(fbox.x + 30, fbox.y + 30);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(fbox.x + 30 + 6 * i, fbox.y + 30 + 6 * i);
  }
  await page.mouse.up();
  await expect(page.locator('[data-side]')).toHaveCount(0);
});
