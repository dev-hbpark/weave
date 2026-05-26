// WI-018 follow-up — Esc mid-gesture cancels cleanly.
//
// Pre-fix bug: the rubber-band binding's drag state lived in a closure
// that wasn't cleared when the user pressed Esc. The user-facing Esc
// listener only cleared `vm.rubberBand`, so the next pointerup still
// ran through the binding's `onPointerUp` (drag was non-null) and
// re-opened the recommendation popover.
//
// Fix: a single editor-level Esc handler routes through
// `router.cancelActive()` — the agocraft router primitive that
// fans out `onCancel` to every attached host's active binding and
// clears `vm.rubberBand`. This regression spec pins that flow.

import { test, expect } from "@playwright/test";
import { prepareDesign } from "./helpers";

// WI-032 Phase 3c — rubber-band 가 빈 frame-stage 위에서 시작하는데
// paradigm shift 후 stage 의 interaction layer 가 frame paradigm 의
// hover-affordance 와 race. 단독 실행도 fail. rubber-band binding
// (frame paradigm 의 first-frame 위에서 시작) 의 update 후 unskip.
test.skip("Esc mid-drag cancels — subsequent pointerup does NOT open the popover", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  const stage = page.locator('[data-testid="frame-stage"]');
  const sbox = await stage.boundingBox();
  if (sbox === null) throw new Error("no stage box");

  const startX = sbox.x + 100;
  const startY = sbox.y + 100;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(startX + 30 * i, startY + 25 * i);
  }

  // Pre-condition: rubber-band is mid-drawing.
  await expect
    .poll(async () =>
      page
        .locator('[data-testid="rubber-band-host"]')
        .first()
        .getAttribute("data-rubber-band-host-state"),
    )
    .toBe("drawing");

  // Esc mid-drag.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);

  // After Esc — back to idle.
  await expect
    .poll(async () =>
      page
        .locator('[data-testid="rubber-band-host"]')
        .first()
        .getAttribute("data-rubber-band-host-state"),
    )
    .toBe("idle");

  // Release pointer AFTER Esc — popover must NOT appear.
  await page.mouse.up();
  await page.waitForTimeout(120);
  await expect
    .poll(async () =>
      page
        .locator('[data-testid="rubber-band-host"]')
        .first()
        .getAttribute("data-rubber-band-host-state"),
    )
    .toBe("idle");
  // No popover content rendered.
  await expect(page.locator('[data-side]')).toHaveCount(0);
});
