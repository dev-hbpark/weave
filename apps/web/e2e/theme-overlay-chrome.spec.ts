// DR-design-028 — light-theme overlay tone split.
//
// The overlay token family (--surface-overlay / --text-overlay / --shadow-overlay)
// drives the editor chrome (Panel / ContextualToolbar / menus / popovers / dialogs /
// tooltips). It used to be dark-only (defined once on :root), so the LIGHT themes
// (daylight / paper / webtoon) left this chrome dark while page + cards went light.
//
// This visual spec selects a frame (raising the PropertiesPanel + ContextualToolbar,
// both overlay-token consumers), flips data-theme per theme, and screenshots so the
// overlay chrome can be eyeballed light in the light themes and dark in aurora.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

async function selectViaVm(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
  await page.waitForTimeout(80);
}

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForTimeout(120);
}

/** The overlay surface bg actually resolved for the floating chrome. */
async function overlayBg(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--surface-overlay")
      .trim(),
  );
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const LIGHT_THEMES = ["daylight", "paper", "webtoon"] as const;

test("overlay chrome follows light themes (DR-design-028)", async ({ page }) => {
  await prepareDesign(page);
  const frameId = await addFrame(page);
  await selectViaVm(page, frameId);

  // Control: aurora (dark) keeps the dark overlay glass.
  await setTheme(page, "aurora");
  const darkOverlay = await overlayBg(page);
  expect(darkOverlay).toContain("15, 23, 42"); // dark navy
  await page.screenshot({
    path: `test-results/overlay-aurora.png`,
    fullPage: false,
  });

  // Each light theme must now resolve a LIGHT overlay (not the dark navy).
  for (const theme of LIGHT_THEMES) {
    await setTheme(page, theme);
    const bg = await overlayBg(page);
    expect(bg, `overlay for ${theme} must differ from dark navy`).not.toBe(
      darkOverlay,
    );
    // Light overlays are high-luminance: their first rgb channel is ≥ 240.
    const firstChannel = Number(bg.match(/\d+/)?.[0] ?? "0");
    expect(firstChannel, `overlay for ${theme} should be light`).toBeGreaterThan(
      230,
    );
    await page.screenshot({
      path: `test-results/overlay-${theme}.png`,
      fullPage: false,
    });
  }
});
