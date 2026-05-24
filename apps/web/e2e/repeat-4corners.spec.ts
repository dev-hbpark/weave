// WI-018 follow-up — drag-add at 4 corners in sequence commits each
// time. Pre-fix regression: only the FIRST drag committed; subsequent
// drags at different positions opened the popover but the rec click
// silently dropped. Root cause: the agocraft adapter's `toWeaveRect`
// bucketed by RATIO (0..1) instead of raw design-pixel aspect, so
// the same drag opened a "square" popover (raw-px bucketize, via
// weave.normalizeDragRect) but committed against "tall" recs (ratio
// bucketize, via the adapter) — the user's pick (`square-canvas`)
// wasn't in the commit-time recs and `commitRubberBandRecommendation`
// returned false without firing `capability.commit`.
//
// Fix: the adapter computes `aspectRatio` and `bucket` from raw px
// (`ago.width`, `ago.height`), matching weave's native helper.

import { test, expect } from "@playwright/test";
import { prepareDesign } from "./helpers";

test("drag-add at 4 corners in sequence — each commits", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  const stage = page.locator('[data-testid="frame-stage"]');
  const sbox = await stage.boundingBox();
  if (sbox === null) throw new Error("no stage");
  const cx = sbox.x + sbox.width / 2;
  const cy = sbox.y + sbox.height / 2;
  const corners: Array<{ x: number; y: number }> = [
    { x: cx - 350, y: cy - 200 }, // TL
    { x: cx + 200, y: cy + 100 }, // BR
    { x: cx - 350, y: cy + 100 }, // BL
    { x: cx + 200, y: cy - 200 }, // TR
  ];

  let expected = 0;
  for (const c of corners) {
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(c.x + 25 * i, c.y + 25 * i);
    }
    await page.mouse.up();
    const list = page.locator('[data-testid="rubber-band-popover-list"]');
    await expect(list).toHaveCount(1);
    const square = list
      .locator('[role="option"]')
      .filter({ hasText: /정사각 캔버스/ })
      .first();
    await square.click();
    expected += 1;
    await expect(page.locator("[data-frame-id]")).toHaveCount(expected);
    // Esc to ensure clean state for the next drag.
    await page.keyboard.press("Escape");
  }
});
