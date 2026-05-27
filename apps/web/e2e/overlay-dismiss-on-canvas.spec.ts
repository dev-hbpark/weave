// DR-design-013 — overlay outside-pointer dismiss must survive consumer
// `stopPropagation` on the canvas.
//
// Radix's built-in `onPointerDownOutside` listens on `document` in the
// bubble phase. weave's FrameStage canvas calls `e.stopPropagation()` on
// `pointerdown` in 9 places to gate RubberBandLayer / pan handlers. Without
// the design-system's capture-phase backstop, that swallows Radix's signal
// and an open overlay stays put — the bug a user reported on 2026-05-27
// (header design-background ColorPicker not closing on canvas click).
//
// This spec is the cross-cutting regression gate: open each protected
// overlay, click an interior point of a frame (whose pointerdown handler
// always stopPropagations), and assert the overlay is gone.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("ColorPicker closes when the canvas (with stopPropagation pointerdown) is clicked", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Dismiss-A" });
  await addFrame(page, "slide", {
    frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.4, rotation: 0 },
  });

  // Open the header design-background ColorPicker.
  await page.getByTestId("header-design-background").locator("button").first().click();
  // Radix popover content is portaled; the content carries data-state="open".
  const popoverContent = page.locator('[data-radix-popper-content-wrapper]');
  await expect(popoverContent).toBeVisible();

  // Click inside the frame body — this is where FrameStage's
  // `e.stopPropagation()` on pointerdown lives (FrameStage.tsx:565 path).
  // Use the frame's bounding rect interior, not the testid, so we hit the
  // actual canvas surface rather than any portal element.
  const frame = page.locator('[data-frame-id]').first();
  const box = await frame.boundingBox();
  if (box === null) throw new Error("frame bounding box unavailable");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(popoverContent).toHaveCount(0);
});

test("DropdownMenu closes when the canvas (with stopPropagation pointerdown) is clicked", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Dismiss-B" });
  await addFrame(page, "slide", {
    frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.4, rotation: 0 },
  });

  // Open the header "Add" menu (DropdownMenu).
  await page.getByTestId("toolbar-add").click();
  // Radix DropdownMenu portal content lives in the role=menu region.
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  const frame = page.locator('[data-frame-id]').first();
  const box = await frame.boundingBox();
  if (box === null) throw new Error("frame bounding box unavailable");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(menu).toHaveCount(0);
});
