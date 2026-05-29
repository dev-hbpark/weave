// WI-030 Phase 1 — visual self-verification (not part of `pnpm e2e` regression).
//
// Drives the Add menu → slide picker → cover preset flow and captures full-
// page screenshots so the maintainer can eyeball the rendered layout against
// the spec's silhouette diagrams. Runs on demand:
//
//   pnpm exec playwright test preset-visual-check.spec.ts --headed
//
// Output: `apps/web/test-results/preset-visual-check-*/` with PNGs.

import { test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const VARIANTS = ["cover.bold", "cover.hero", "cover.asymmetric"] as const;

for (const variant of VARIANTS) {
  test(`visual: ${variant}`, async ({ page }, info) => {
    await prepareDesign(page, { flavor: "mixed", title: `Visual-${variant}` });

    await page.getByTestId("toolbar-add").click();
    await page.getByTestId("add-slide").click();

    // Capture the picker itself before the click (left rail + grid).
    await page.screenshot({
      path: info.outputPath(`picker-with-${variant}.png`),
      fullPage: true,
    });

    await page.getByTestId(`preset-card-${variant}`).click();

    // Wait for slide subtree to materialize.
    await page.locator("[data-frame-id]").first().waitFor({ state: "visible" });
    await page.waitForTimeout(300); // let any lazy text render settle

    // Click out so selection chrome doesn't dominate the screenshot.
    await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
    await page.waitForTimeout(100);

    await page.screenshot({
      path: info.outputPath(`inserted-${variant}.png`),
      fullPage: true,
    });
  });
}
