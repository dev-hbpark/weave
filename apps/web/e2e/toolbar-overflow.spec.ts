// DR-design-014 — ContextualToolbar priority + dynamic More overflow.
//
// At a constrained viewport, the bar must fold low-priority sections into
// a "더보기" popover. Primary 5 text sections (Family · Font · Size · Align
// · Color) must remain visible in the bar; the rest must be reachable
// from the popover.

import { expect, test, type Page } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addTextViaMenu(page: Page): Promise<void> {
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();
}

async function visibleSectionLabels(page: Page): Promise<ReadonlyArray<string>> {
  // The Bar's in-flow children carry `aria-label="<section label>"`. Folded
  // sections live inside the More popover (different ancestor), so a query
  // scoped to the bar finds only visible ones.
  const labels = await page
    .getByTestId("contextual-toolbar")
    .locator('> [role="group"]')
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getAttribute("aria-label") ?? ""),
    );
  return labels.filter((l) => l !== "");
}

test("Text toolbar folds low-priority sections into 더보기 at narrow viewport", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Walk the wizard at default viewport (some buttons assume the desktop
  // size). Then shrink the viewport so the 16 text sections cannot all
  // fit — the bar's max is `min(92vw, 1100px)` and at 900px that's ~828px.
  await prepareDesign(page, { flavor: "mixed", title: "Overflow-A" });
  await page.setViewportSize({ width: 900, height: 720 });

  await addTextViaMenu(page);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "text");

  // The 더보기 trigger appears once at least one section is folded.
  const more = page.getByTestId("toolbar-more-trigger");
  await expect(more).toBeVisible();

  // Primary 5 (highest priority): Family · Font · Size · Align · Color
  // must all remain in the bar at this viewport.
  const visible = await visibleSectionLabels(page);
  const primary = ["Family", "Font", "Size", "Align", "Color"];
  for (const p of primary) {
    expect(visible, `Primary section "${p}" must stay in the bar`).toContain(p);
  }

  // At least one of the 11 secondary sections must be folded (not in the
  // visible bar). We don't assert a specific one because viewport math
  // could shift, but the count must be < 16.
  expect(visible.length).toBeLessThan(16);
});

test("Folded sections appear inside the 더보기 popover and are operable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Overflow-B" });
  await page.setViewportSize({ width: 900, height: 720 });

  await addTextViaMenu(page);
  await expect(page.getByTestId("toolbar-more-trigger")).toBeVisible();

  // Open the popover.
  await page.getByTestId("toolbar-more-trigger").click();
  const popoverStack = page.locator('[data-toolbar-more-stack="true"]');
  await expect(popoverStack).toBeVisible();

  // The popover must contain at least one section (any low-priority one).
  // "Opacity" (priority 45) is reliably folded at 900px width.
  await expect(popoverStack.locator('[role="group"][aria-label="Opacity"]')).toBeVisible();

  // The same section's aria-label is NOT present in the bar's direct
  // children — i.e., the section is portaled, not duplicated.
  const visibleInBar = await visibleSectionLabels(page);
  expect(visibleInBar).not.toContain("Opacity");
});
