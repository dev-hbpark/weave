import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function lastShapeSubAttrs(page: Page): Promise<Record<string, unknown> | null> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: { kind: string; attrs: { subAttrs?: unknown } }[] } };
    };
    const shapes = (w.__weaveDoc?.root.children ?? []).filter((c) => c.kind === "shape");
    const s = shapes[shapes.length - 1];
    return (s?.attrs.subAttrs as Record<string, unknown>) ?? null;
  });
}

// DR-025 — open polylines (자유선/곡선) are now the `line` KIND (edited via the
// LineSection). The ShapeSection's 곡선(smooth) toggle now applies to the
// remaining poly SHAPE: the closed 자유 다각형 (a smooth closed poly = rounded
// blob). This pins that the toggle still flips `subAttrs.smooth`.
test("Properties panel smooth toggle flips a closed poly shape straight<->curve", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "SmoothToggle" });

  // Add a closed 자유 다각형 (poly SHAPE, smooth:false).
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape").click();
  await page.getByTestId("add-shape-poly").click();
  await page.waitForTimeout(200);
  expect((await lastShapeSubAttrs(page))?.smooth ?? false).toBe(false);

  // Open More → the 곡선 toggle appears (poly-only). Turn it ON.
  await page.getByTestId("toolbar-more-trigger").click();
  const toggle = page.getByRole("switch", { name: "곡선 (smooth)" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.waitForTimeout(200);
  // Model: smooth now true → renders as a cubic-bezier <path>.
  expect((await lastShapeSubAttrs(page))?.smooth).toBe(true);
  const hasCubic = await page
    .locator("[data-frame-id] svg path")
    .last()
    .evaluate((el) => (el.getAttribute("d") ?? "").includes("C"));
  expect(hasCubic).toBe(true);

  // Toggle OFF → smooth false again.
  await toggle.click();
  await page.waitForTimeout(200);
  expect((await lastShapeSubAttrs(page))?.smooth).toBe(false);
});
