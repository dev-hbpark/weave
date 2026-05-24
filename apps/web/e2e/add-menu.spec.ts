// WI-020 Phase 6 — Add menu e2e.
//
// Verifies that the "+" button in the editor header opens a DropdownMenu
// with image / video / shape sub-kind options, and that selecting any of
// them adds a corresponding item to the design and auto-selects it (so the
// ContextualToolbar mounts with the right kind).

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("'+' button opens add menu with image / video / shape options", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-A" });
  const addBtn = page.getByTestId("toolbar-add");
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.getByTestId("add-image")).toBeVisible();
  await expect(page.getByTestId("add-video")).toBeVisible();
  await expect(page.getByTestId("add-shape-rectangle")).toBeVisible();
  await expect(page.getByTestId("add-shape-star")).toBeVisible();
});

test("Add image → URL dialog opens, confirm creates frame + ContextualToolbar appears", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-B" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  // Image add now goes through MediaSrcDialog — fill URL + confirm.
  await page.getByTestId("media-src-input").fill("https://example.com/x.jpg");
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "image");
});

test("Add shape:star → toolbar shows shape kind", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-C" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape-star").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "shape");
});

test("Add video → URL dialog opens, confirm creates video + toolbar mounts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-D" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-video").click();
  await page.getByTestId("media-src-input").fill("https://example.com/x.mp4");
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "video");
});
