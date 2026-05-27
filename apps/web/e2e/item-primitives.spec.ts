// WI-020 Phase 7 — minimal e2e for item primitives + ContextualToolbar.
//
// Covered scenarios (subset of DR-014's full e2e plan; remaining flows depend
// on insertion UI integration which lands in a follow-up):
//   1. Shape add → DOM mount + ContextualToolbar appears with kind="shape".
//   2. Image add → DOM mount + ContextualToolbar appears with kind="image".
//   3. Video add → DOM mount + ContextualToolbar appears with kind="video".
//   4. Peek mode hides the ContextualToolbar.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("shape item adds, renders, and the toolbar appears on selection", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Item-A" });
  await addFrame(page, "shape" as never);
  // Frame should exist in DOM
  const frames = page.locator("[data-frame-id]");
  await expect(frames).toHaveCount(1);
  // Click to select
  await frames.first().click();
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "shape");
});

test("image item adds and the toolbar shows image fit options", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Item-B" });
  await addFrame(page, "image" as never);
  const frames = page.locator("[data-frame-id]");
  await frames.first().click();
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "image");
  // DR-design-015 — Fit moved into the More popover. The Bar.Field wraps
  // the SegmentedControl; both carry role="group", so use exact match on
  // the field's aria-label.
  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  await expect(popover.getByRole("group", { name: "Fit", exact: true })).toBeVisible();
});

test("video item adds and the toolbar shows video controls", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Item-C" });
  await addFrame(page, "video" as never);
  const frames = page.locator("[data-frame-id]");
  await frames.first().click();
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "video");
  // DR-design-015 — Loop / Volume moved to More; only Replace+Mute icons
  // stay in Quick. Open More to see the full controls.
  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  await expect(popover.getByRole("group", { name: "Loop", exact: true })).toBeVisible();
  await expect(popover.getByRole("group", { name: "Volume", exact: true })).toBeVisible();
});

test("peek mode hides the contextual toolbar", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Item-D" });
  await addFrame(page, "shape" as never);
  await page.locator("[data-frame-id]").first().click();
  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();
  // Activate peek mode
  await page.getByTestId("toolbar-peek").click();
  await expect(page.getByTestId("contextual-toolbar")).toHaveCount(0);
  // Deactivate peek → toolbar returns (selection should persist).
  await page.getByTestId("toolbar-peek").click();
  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();
});
