// WI-162 — per-flavor page-unit noun in the toolbar Add menu + preset picker.
//
// Decision: doc-page gets NO separate toolbar (zero functional divergence —
// see records/work-items/WI-162-doc-page-toolbar-decision.md). The only real
// mismatch was terminology: the Add menu's page section and the
// SlidePresetPicker headline said "슬라이드" on every flavor. They now read
// `FLAVOR_REGISTRY[flavor].pageNoun` — "페이지" on doc-page, "슬라이드"
// elsewhere.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.describe("WI-162 — format-aware page noun", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllDesigns(page);
  });

  test("doc-page Add menu + preset picker say 페이지", async ({ page }) => {
    await prepareDesign(page, { flavor: "doc-page" });

    await page.getByTestId("toolbar-add").click();
    const addSlide = page.getByTestId("add-slide");
    await expect(addSlide).toHaveText("페이지…");
    await addSlide.click();

    // The picker the item opens must use the same noun (clicking "페이지…"
    // into a "슬라이드" headline would contradict itself).
    const picker = page.getByTestId("slide-preset-picker");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("heading", { name: "페이지" })).toBeVisible();
  });

  test("slide-deck Add menu keeps 슬라이드", async ({ page }) => {
    await prepareDesign(page, { flavor: "slide-deck" });

    await page.getByTestId("toolbar-add").click();
    await expect(page.getByTestId("add-slide")).toHaveText("슬라이드…");
  });
});
