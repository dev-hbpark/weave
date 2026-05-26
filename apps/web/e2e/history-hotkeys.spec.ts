import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 5 / 10b — Cmd+Z reverts a `weave.item.update` mutation by replaying
// the inverse Patch through the ChangeStream reducer.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

// WI-032 Phase 3c — slide title EditableText retired. Cmd+Z over a text
// primitive's Lexical edit follows a different surface (textRuns patch);
// covered by `text-item.spec.ts` once the paradigm follow-up lands.
test.skip("Cmd+Z undoes a slide title commit; Cmd+Shift+Z redoes it", async ({ page }) => {
  // slide-deck flavor seeds a single slide at FULL_FRAME — perfect for this test.
  await prepareDesign(page, { flavor: "slide-deck" });

  const title = page.getByRole("textbox", { name: "Slide title" });
  await expect(title).toHaveText("New slide");

  await title.dblclick({ position: { x: 80, y: 20 } });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Edited title");
  await title.blur();
  await expect(title).toHaveText("Edited title");

  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 5 } });

  await page.keyboard.press("ControlOrMeta+z");
  await expect(title).toHaveText("New slide", { timeout: 2_000 });

  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(title).toHaveText("Edited title", { timeout: 2_000 });
});
