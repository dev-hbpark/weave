// WI-040 Phase 2 — visual smoke test for the HoverAffordanceLayer
// demo route. Confirms the primitive mounts under DEV builds, the
// three tier markers (`data-hover-tier="hovered|sibling|parent"`)
// render simultaneously, and the toggles wire correctly.
//
// Production builds skip this route entirely (`import.meta.env.DEV`
// gate in App.tsx), so this spec relies on the Playwright dev server
// running Vite in dev mode — which the default e2e config does.

import { expect, test } from "@playwright/test";

test("HoverAffordanceLayer dev demo renders all three tiers", async ({ page }) => {
  await page.goto("/_dev/hover-affordance-demo");

  // Layer mounts and all three tier markers are present.
  // (`toBeVisible` skips aria-hidden subtrees by design; this overlay
  //  IS aria-hidden because it's visual-only — assert presence instead.)
  await expect(page.getByTestId("hover-affordance-layer")).toHaveCount(1);
  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(1);
  await expect(page.locator('[data-hover-tier="sibling"]')).toHaveCount(2);
  await expect(page.locator('[data-hover-tier="parent"]')).toHaveCount(1);
});

test("toggling tiers removes the corresponding overlay", async ({ page }) => {
  await page.goto("/_dev/hover-affordance-demo");

  await page.getByLabel("hovered").uncheck();
  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(0);
  await expect(page.locator('[data-hover-tier="sibling"]')).toHaveCount(2);
  await expect(page.locator('[data-hover-tier="parent"]')).toHaveCount(1);

  await page.getByLabel("hovered").check();
  await page.getByLabel(/siblings/).uncheck();
  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(1);
  await expect(page.locator('[data-hover-tier="sibling"]')).toHaveCount(0);
  await expect(page.locator('[data-hover-tier="parent"]')).toHaveCount(1);

  await page.getByLabel(/siblings/).check();
  await page.getByLabel("parent").uncheck();
  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(1);
  await expect(page.locator('[data-hover-tier="sibling"]')).toHaveCount(2);
  await expect(page.locator('[data-hover-tier="parent"]')).toHaveCount(0);
});
