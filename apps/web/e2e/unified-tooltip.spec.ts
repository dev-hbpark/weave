// UnifiedTooltip — the single `data-tip` tooltip surface (commit 725e0ad
// unified AITooltip + CursorTooltip + native title into one surface). Replaces
// the retired `ai-tooltip` / `tooltip-editor` / `tooltip-kind-polymorphism`
// specs, which targeted the removed standalone AITooltip provider.
//
// Contract under test (design-system `UnifiedTooltip` + DesignPage mount):
//   • Any element with `data-tip="…"` (+ optional `data-tip-kbd`) lights up the
//     ONE surface (`[data-testid="unified-tooltip"]`) after a dwell.
//   • Dwell = showDelayMs (1000 ms default) — brief hover does not open.
//   • Leaving the target hides it.
//   • The same single surface follows whichever target is hovered.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const SURFACE = '[data-testid="unified-tooltip"]';
// showDelayMs default is 1000 — wait comfortably past it for "shown" checks.
const PAST_DWELL = 1200;

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("opens after the dwell with the target's text + kbd", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "UT-show" });
  // The toolbar Select tool is always present: data-tip="선택 도구", kbd="V".
  const target = page.getByTestId("toolbar-select");
  await expect(target).toBeVisible();

  await target.hover();
  await page.waitForTimeout(PAST_DWELL);

  const tip = page.locator(SURFACE);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("선택 도구");
  await expect(tip.locator("kbd")).toHaveText("V");
});

test("stays closed during a brief hover (under the dwell)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "UT-delay" });
  await page.getByTestId("toolbar-select").hover();
  await page.waitForTimeout(400); // < 1000 ms dwell
  expect(await page.locator(SURFACE).count()).toBe(0);
});

test("hides when the pointer leaves the target", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "UT-hide" });
  await page.getByTestId("toolbar-select").hover();
  await page.waitForTimeout(PAST_DWELL);
  await expect(page.locator(SURFACE)).toBeVisible();

  // Move to a neutral spot with no `data-tip` ancestor (top-left corner).
  await page.mouse.move(3, 3);
  await page.waitForTimeout(400);
  expect(await page.locator(SURFACE).count()).toBe(0);
});

test("a single surface follows whichever data-tip target is hovered", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "UT-follow" });

  await page.getByTestId("toolbar-select").hover();
  await page.waitForTimeout(PAST_DWELL);
  await expect(page.locator(SURFACE)).toContainText("선택 도구");

  // The Add button carries data-tip="추가". Hovering it re-targets the SAME
  // surface (no second surface spawns).
  await page.getByTestId("toolbar-add").hover();
  await page.waitForTimeout(PAST_DWELL);
  const tip = page.locator(SURFACE);
  await expect(tip).toContainText("추가");
  expect(await page.locator(SURFACE).count()).toBe(1);
});
