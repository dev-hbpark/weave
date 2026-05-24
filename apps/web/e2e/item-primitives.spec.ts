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
  // Fit section should be present.
  await expect(toolbar.getByRole("group", { name: "Fit" }).first()).toBeVisible();
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
  // Loop + Muted sections should be present (Switch-driven).
  await expect(toolbar.getByRole("group", { name: "Loop" }).first()).toBeVisible();
  await expect(toolbar.getByRole("group", { name: "Muted" }).first()).toBeVisible();
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
