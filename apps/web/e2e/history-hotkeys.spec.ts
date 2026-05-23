import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 5 / 10b — Cmd+Z reverts a `weave.item.update` mutation by replaying
// the inverse Patch through the ChangeStream reducer.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("Cmd+Z undoes a slide title commit; Cmd+Shift+Z redoes it", async ({ page }) => {
  // slide-deck flavor seeds a single slide at FULL_FRAME — perfect for this test.
  await prepareDesign(page, { flavor: "slide-deck" });

  const title = page.getByRole("textbox", { name: "Slide title" });
  await expect(title).toHaveText("New slide");

  await title.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Edited title");
  await title.blur();
  await expect(title).toHaveText("Edited title");

  await page.locator("body").click({ position: { x: 5, y: 5 } });

  await page.keyboard.press("ControlOrMeta+z");
  await expect(title).toHaveText("New slide", { timeout: 2_000 });

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(title).toHaveText("Edited title", { timeout: 2_000 });
});
