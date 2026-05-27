// WI-020 — media src input dialog e2e.
//
// Covers:
//   1. "+" → 이미지 → dialog opens → URL entry → item created with that src.
//   2. "+" → 비디오 → same flow.
//   3. ContextualToolbar's Source button re-opens dialog pre-filled with
//      the current src → confirm → existing item's src updates (no new item).
//   4. Cancel button closes dialog without adding.
//   5. Empty URL is rejected with an inline error.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("Add → image opens URL dialog and creates the item on confirm", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Src-A" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  const dialog = page.getByTestId("media-src-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-kind", "image");

  const url = "https://example.com/photo.jpg";
  await page.getByTestId("media-src-input").fill(url);
  await page.getByTestId("media-src-confirm").click();

  // Frame should now exist; toolbar should mount with image kind.
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "image");

  // <img> should carry the URL.
  await expect(page.locator(`img[src="${url}"]`)).toBeVisible();
});

test("Add → video opens URL dialog and creates a video item on confirm", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Src-B" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-video").click();
  const dialog = page.getByTestId("media-src-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-kind", "video");

  const url = "https://example.com/clip.mp4";
  await page.getByTestId("media-src-input").fill(url);
  await page.getByTestId("media-src-confirm").click();

  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  await expect(page.locator(`video[src="${url}"]`)).toHaveCount(1);
});

test("ContextualToolbar Source button re-opens dialog and replaces src", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Src-C" });
  // Add via Add menu first.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  await page.getByTestId("media-src-input").fill("https://example.com/old.jpg");
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);

  // Trigger Source dialog from the toolbar.
  await page.getByTestId("image-edit-src").click();
  const dialog = page.getByTestId("media-src-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("media-src-input")).toHaveValue("https://example.com/old.jpg");

  // Replace URL.
  await page.getByTestId("media-src-input").fill("https://example.com/new.jpg");
  await page.getByTestId("media-src-confirm").click();

  // No new item — just src changed.
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  await expect(page.locator('img[src="https://example.com/new.jpg"]')).toBeVisible();
});

test("Cancel closes the dialog without adding an item", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Src-D" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  await expect(page.getByTestId("media-src-dialog")).toBeVisible();
  await page.getByTestId("media-src-cancel").click();
  await expect(page.getByTestId("media-src-dialog")).toHaveCount(0);
  await expect(page.locator("[data-frame-id]")).toHaveCount(0);
});

test("Empty URL is rejected with an inline error", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Src-E" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  // Click confirm without entering anything.
  await page.getByTestId("media-src-confirm").click();
  // Dialog still open; error message visible inside it.
  await expect(page.getByTestId("media-src-dialog")).toBeVisible();
  await expect(page.getByText("URL을 입력하거나 파일을 업로드해주세요")).toBeVisible();
});
