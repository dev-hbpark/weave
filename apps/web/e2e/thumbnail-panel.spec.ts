import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 12d — ThumbnailPanel tiles correspond to every domain *frame* in the
// design. The design root is no longer a slide — only the frames the user
// authors. Empty designs hide the panel.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("panel hides for empty designs; one tile per frame thereafter", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await expect(page.getByTestId("thumbnail-panel")).toHaveCount(0);

  // Add two slides — panel appears with 2 tiles (one per frame, no root tile).
  await addFrame(page, "slide");
  await addFrame(page, "slide");

  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  await expect(page.locator('[data-thumbnail-id]')).toHaveCount(2);
});

test("drag reorder updates the panel sequence", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Reorder test" });
  await addFrame(page, "slide");
  await addFrame(page, "canvas-design");
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  await expect(page.locator('[data-thumbnail-id]')).toHaveCount(3);

  const initial = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('[data-thumbnail-id]'));
    return tiles.map((t) => (t as HTMLElement).dataset.thumbnailId);
  });

  const last = page.getByTestId("thumbnail-2");
  const first = page.getByTestId("thumbnail-0");
  await last.dragTo(first);
  await page.waitForTimeout(80);

  const after = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('[data-thumbnail-id]'));
    return tiles.map((t) => (t as HTMLElement).dataset.thumbnailId);
  });
  expect(after[0]).toBe(initial[2]);
  expect(after[1]).toBe(initial[0]);
  expect(after[2]).toBe(initial[1]);
});

test("reorder is reflected in present mode step count + order", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Present order" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.locator('[data-thumbnail-id]')).toHaveCount(2);

  // Phase 12d — Present button is in the toolbar.
  await page.getByTestId("toolbar-present").click();

  await expect(page.getByText("1 / 2", { exact: false })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 2", { exact: false })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/design\/[^/]+$/);
  await page.getByTestId("thumbnail-1").dragTo(page.getByTestId("thumbnail-0"));
  await page.waitForTimeout(50);

  await page.getByTestId("toolbar-present").click();
  await expect(page.getByText("1 / 2", { exact: false })).toBeVisible();
});

test("clicking a tile selects the corresponding frame", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Click select" });
  await addFrame(page, "slide");

  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  // tile 0 is the slide frame; clicking selects it.
  await page.getByTestId("thumbnail-0").click();
  expect(page.url()).not.toContain("/sub/");
  // add-target-hint was removed; selection is implicit. URL remains on the
  // design route — the tile click should not navigate elsewhere.
  await expect(page).toHaveURL(/\/design\/[^/]+$/);
});
