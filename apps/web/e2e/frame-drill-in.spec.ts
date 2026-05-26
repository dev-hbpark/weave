import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// WI-033 P2 — Phase 12c drill-in mode (right-click "Enter frame" +
// breadcrumb + zoom transition) is DEPRECATED. DR-017 supersedes the
// paradigm; selection-only navigation (parent-first auto-select +
// Cmd-click deep + Enter/Tab keyboard nav + Layer Picker) is the
// replacement.
//
// All 4 specs in this file exercise behaviour that no longer exists:
//   • `ctx-enter-frame` ContextMenuItem (removed)
//   • `breadcrumb-entered-title` / `breadcrumb-exit-entered` (removed)
//   • drill-in zoom transition (chain dead-code, pending P2 cleanup)
//
// They are kept here as a paper trail of what got retired, so the
// next maintainer doesn't accidentally re-introduce the wiring under
// a different name. Re-write as Figma-aligned selection specs
// (covered by `figma-*-select.spec.ts` already) or delete after the
// final P2 dead-code cleanup PR. RISK-005 R4.

test.describe.skip("Phase 12 drill-in mode (deprecated — WI-033 P2)", () => {

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function enterFirstFrame(page: import("@playwright/test").Page) {
  const frame = page.locator('[data-frame-id]').first();
  await frame.click({ button: "right", position: { x: 4, y: 4 } });
  await page.getByTestId("ctx-enter-frame").click();
}

test("Enter frame menu drills in (breadcrumb updates), Esc exits", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Drill design" });
  await addFrame(page, "slide");

  await expect(page.getByTestId("breadcrumb-entered-title")).toHaveCount(0);
  await enterFirstFrame(page);
  await expect(page.getByTestId("breadcrumb-entered-title")).toBeVisible();

  // Esc exits.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  await expect(page.getByTestId("breadcrumb-entered-title")).toHaveCount(0);
});

test("entered frame routes Toolbar Add into its children", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add inside" });
  await addFrame(page, "slide");
  const enteredFrameId = await page
    .locator('[data-frame-id]')
    .first()
    .getAttribute("data-frame-id");
  if (enteredFrameId === null) throw new Error("first frame missing data-frame-id");
  await enterFirstFrame(page);
  await expect(page.getByTestId("breadcrumb-entered-title")).toBeVisible();

  // Add inside the entered frame's children.
  await addFrame(page, "slide", { containerId: enteredFrameId });
  await page.waitForTimeout(80);

  const counts = await page.evaluate(() => {
    type Item = { kind: string; children: ReadonlyArray<Item> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const rootChildren = doc?.root.children ?? [];
    const grand = rootChildren[0]?.children ?? [];
    return {
      root: rootChildren.length,
      grand: grand.filter((c) => ["frame"].includes(c.kind))
        .length,
    };
  });
  expect(counts).toEqual({ root: 1, grand: 1 });
});

test("breadcrumb segment click exits the entered frame", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");
  await enterFirstFrame(page);
  await expect(page.getByTestId("breadcrumb-entered-title")).toBeVisible();

  await page.getByTestId("breadcrumb-exit-entered").click();
  await expect(page.getByTestId("breadcrumb-entered-title")).toHaveCount(0);
});

});
