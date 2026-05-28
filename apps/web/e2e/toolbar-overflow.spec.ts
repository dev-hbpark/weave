// DR-design-015 — ContextualToolbar Tier-2: kind chip + quick + More.
//
// The bar is fixed-width (~220px). Text's More popover holds the full
// property panel (Family / Size / Align / V-Align / Mode / Decoration /
// Case / Background / Line height / Letter spacing / Hyperlink / Opacity).
// Adding a text item must surface the More trigger; clicking it must
// expose those fields inside the popover stack.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addTextViaMenu(page: Page): Promise<void> {
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();
}

test("Text bar quick area exposes Bold/Italic/Underline + color, More opens the rest", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Tier2-A" });
  await addTextViaMenu(page);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "text");

  // Quick area: four 1-click actions present.
  await expect(page.getByTestId("text-quick-bold")).toBeVisible();
  await expect(page.getByTestId("text-quick-italic")).toBeVisible();
  await expect(page.getByTestId("text-quick-underline")).toBeVisible();
  // Color swatch is part of Quick — addressed via aria-label.
  await expect(toolbar.getByLabel("글자 색상")).toBeVisible();

  // More trigger is always present for text (full property panel lives there).
  const more = page.getByTestId("toolbar-more-trigger");
  await expect(more).toBeVisible();

  // Family / Size / Align are NOT in the visible bar — they live in More.
  await expect(toolbar.locator('[data-testid="text-font-family-trigger"]')).toHaveCount(0);
  await expect(toolbar.locator('[data-testid="text-size-section"]')).toHaveCount(0);

  // Click More → popover appears with the field rows.
  await more.click();
  const popover = page.getByTestId("toolbar-more-content");
  await expect(popover).toBeVisible();
  // DR-design-021 — the More popover groups fields into accordions. The
  // "타이포" group is open by default, so Family / Size show immediately.
  await expect(popover.locator('[role="group"][aria-label="Family"]')).toBeVisible();
  await expect(popover.locator('[role="group"][aria-label="Size"]')).toBeVisible();
  // Alignment lives in the collapsed "정렬" group — expand it, then the 2D
  // alignment pad (align × valign) shows. (DR-design-021 — the two separate
  // Align / V-Align rows were merged into one AlignmentPad.)
  await popover.getByTestId("text-align-group-trigger").click();
  await expect(popover.getByTestId("text-align-pad")).toBeVisible();
});

test("Quick Bold toggle toggles fontWeight (single click action)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Tier2-B" });
  await addTextViaMenu(page);

  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
  expect(id).not.toBe("");

  // Default weight is normal; one click on the Bold quick toggle flips it.
  await page.getByTestId("text-quick-bold").click();

  const weight = await page.evaluate((fid) => {
    type Ch = { id: unknown; attrs: { fontWeight?: string } };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    return (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid)?.attrs.fontWeight;
  }, id);
  expect(weight).toBe("bold");
});
