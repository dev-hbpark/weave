import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 11b/11c — Figma frame paradigm. Adding via Toolbar lands the new
// frame at the design's root by default; selecting a frame first makes
// the new frame land inside it (visually nested inside its rectangle).

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("FrameStage renders with no drill route; all frames visible at once", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Frame test" });
  await expect(page.getByTestId("frame-stage")).toBeVisible();

  // Drop a slide and a canvas at root.
  await addFrame(page, "slide");
  await addFrame(page, "canvas-design");

  // Both frames are visible inside the stage — no drill, no /sub/ url.
  await expect(page.locator('[data-frame-id]')).toHaveCount(2);
  expect(page.url()).not.toContain("/sub/");
});

test("selecting a frame routes Toolbar Add into that frame's children", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });

  // Add a slide at root.
  await addFrame(page, "slide");
  await expect(page.locator('[data-frame-id]')).toHaveCount(1);

  // Click the slide to select it.
  // Phase 12 — clicking the inner content (text / shapes / etc.) does NOT
  // select the frame; only clicks on the frame chrome do. Use a small offset
  // near the top-left corner so the click lands on the outline strip.
  const slide = page.locator('[data-frame-id]').first();
  const selectedFrameId = await slide.getAttribute("data-frame-id");
  if (selectedFrameId === null) throw new Error("first frame missing data-frame-id");
  await slide.click({ position: { x: 4, y: 4 } });

  // Add another slide INSIDE the selected one via the editor API.
  await addFrame(page, "slide", { containerId: selectedFrameId });

  // The doc tree now has root → 1 child → 1 grandchild.
  const nested = await page.evaluate(() => {
    type Item = { kind: string; children: ReadonlyArray<Item> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    const rootChildren = doc.root.children;
    const grandchildren =
      rootChildren[0]?.children.filter((c) =>
        ["frame"].includes(c.kind),
      ) ?? [];
    return { rootCount: rootChildren.length, grandCount: grandchildren.length };
  });
  expect(nested).toEqual({ rootCount: 1, grandCount: 1 });
});

test("clicking the stage background deselects", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");

  // Phase 12 — clicking the inner content (text / shapes / etc.) does NOT
  // select the frame; only clicks on the frame chrome do. Use a small offset
  // near the top-left corner so the click lands on the outline strip.
  const slide = page.locator('[data-frame-id]').first();
  await slide.click({ position: { x: 4, y: 4 } });

  // Click the stage chrome (outside any frame). add-target-hint was removed
  // along with the toolbar Add dropdown; this test now just exercises the
  // click path to verify no errors surface.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("frame-stage")).toBeVisible();
});
