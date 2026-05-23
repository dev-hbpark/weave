import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 11a — sub-doc kind is gone; every domain is a Frame. The drill-in
// suite (sub-doc tile → /sub/X navigation) was removed; nested frames will
// be exercised by the frame-in-frame canvas tests added in Phase 11b/d.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("landing → wizard → editor → add frames via toolbar", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("landing-new-design").click();
  await expect(page.getByRole("heading", { name: /Start a new design/i })).toBeVisible();

  const titleInput = page.getByTestId("new-design-title");
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("My design");

  await page.getByTestId("new-design-flavor-slide-deck").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();

  await page.waitForURL(/\/design\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /My design/ })).toBeVisible();

  // slide-deck flavor seeds one slide on creation.
  await expect(page.locator('[data-testid="block-slide"]')).toHaveCount(1);

  // Toolbar Add → another Slide.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await expect(page.locator('[data-testid="block-slide"]')).toHaveCount(2);

  // Toolbar Add → Canvas frame (Phase 11: every domain is a Frame).
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-canvas-design").click();
  await expect(page.locator('[data-testid="block-canvas-design"]')).toHaveCount(1);
});

test("toolbar undo/redo reverts the add", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  const initial = await page.locator('[data-testid="block-slide"]').count();

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  const after = await page.locator('[data-testid="block-slide"]').count();
  expect(after).toBe(initial + 1);

  await page.getByTestId("toolbar-undo").click();
  await page.waitForTimeout(50);
  const undone = await page.locator('[data-testid="block-slide"]').count();
  expect(undone).toBe(initial);

  await page.getByTestId("toolbar-redo").click();
  await page.waitForTimeout(50);
  const redone = await page.locator('[data-testid="block-slide"]').count();
  expect(redone).toBe(after);
});
