// WI-030 Phase 1 — Slide preset picker e2e.
//
// Exercises the full path: Add menu → "슬라이드 시작점…" → picker Dialog opens
// → category rail shows "표지" → click a preset thumbnail → a slide frame
// appears with multiple child Items → drain `history.undo()` reverts the
// entire preset → drain `history.redo()` re-applies it.
//
// Phase 1 known limitation: each text child mounts a Lexical editor whose
// init-time onChange fires a `weave.item.update` even though the snapshot
// equals the seeded value, producing N+1 history entries per preset insert.
// The user-visible Cmd+Z UX therefore takes a few hits to fully revert a
// preset; tightening this (Lexical onChange equivalence guard for textRuns,
// or a transaction-scope wrapper around `weave.preset.insertSlide`) is
// tracked separately. This spec asserts the structural contract — preset
// insert is fully reversible through the history stack — without pinning
// the exact entry count.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("Add menu surfaces 'Slide' entry that opens the preset picker", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Preset-A" });

  await expect(page.getByTestId("frame-stage").locator("[data-frame-id]")).toHaveCount(0);

  await page.getByTestId("toolbar-add").click();
  const slideEntry = page.getByTestId("add-slide");
  await expect(slideEntry).toBeVisible();
  await slideEntry.click();

  const picker = page.getByTestId("slide-preset-picker");
  await expect(picker).toBeVisible();
  await expect(page.getByTestId("preset-category-cover")).toBeVisible();
  // Phase 1 = 3 cover variants.
  await expect(page.getByTestId("preset-card-cover.bold")).toBeVisible();
  await expect(page.getByTestId("preset-card-cover.hero")).toBeVisible();
  await expect(page.getByTestId("preset-card-cover.asymmetric")).toBeVisible();
});

test("Picking cover.bold inserts slide + multiple children; history drain reverts all", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Preset-B" });

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-slide").click();
  await page.getByTestId("preset-card-cover.bold").click();

  // Picker closes; slide + 4 children appear. Every AgocraftItem in the
  // tree carries its own `data-frame-id`, so cover.bold = 1 slide + 4
  // children = 5 frame markers.
  await expect(page.getByTestId("slide-preset-picker")).toBeHidden();
  await expect(page.getByTestId("frame-stage").locator("[data-frame-id]")).toHaveCount(5, { timeout: 3000 });

  // The slide carries pre-populated children (FR-003 §F1 — staged as one
  // subtree, materialized via a single `item.children` patch).
  const childCount = await page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ children: ReadonlyArray<unknown> }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return -1;
    const first = doc.root.children[0];
    return first ? first.children.length : 0;
  });
  // cover.bold = accent shape + title + subtitle + meta = 4 child items.
  expect(childCount).toBe(4);

  // Drain history — every preset insert must be fully reversible. Stops at
  // a fixed bound so a runaway loop can't hang the spec.
  await page.evaluate(() => {
    type Editor = { history: { canUndo: () => boolean; undo: () => unknown } };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    if (ed === undefined) throw new Error("__weaveEditor not available");
    for (let i = 0; i < 32 && ed.history.canUndo(); i++) ed.history.undo();
  });
  await page.waitForTimeout(100);
  await expect(page.getByTestId("frame-stage").locator("[data-frame-id]")).toHaveCount(0, { timeout: 3000 });

  // Redo all the way back.
  await page.evaluate(() => {
    type Editor = { history: { canRedo: () => boolean; redo: () => unknown } };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    if (ed === undefined) throw new Error("__weaveEditor not available");
    for (let i = 0; i < 32 && ed.history.canRedo(); i++) ed.history.redo();
  });
  await page.waitForTimeout(100);
  await expect(page.getByTestId("frame-stage").locator("[data-frame-id]")).toHaveCount(5, { timeout: 3000 });
});

test("Cancel button closes the picker without inserting anything", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Preset-C" });

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-slide").click();
  await expect(page.getByTestId("slide-preset-picker")).toBeVisible();

  await page.getByTestId("slide-preset-picker-cancel").click();
  await expect(page.getByTestId("slide-preset-picker")).toBeHidden();
  await expect(page.getByTestId("frame-stage").locator("[data-frame-id]")).toHaveCount(0);
});
