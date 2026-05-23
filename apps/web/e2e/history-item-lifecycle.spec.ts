import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 8 / 10b — item add / remove must be undoable.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function countDomainItems(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ kind: string }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return -1;
    return doc.root.children.filter((c) =>
      ["slide", "canvas-design", "block-doc", "media"].includes(c.kind),
    ).length;
  });
}

test("Cmd+Z undoes an item.add; Cmd+Shift+Z redoes it", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.locator('[data-testid="block-slide"]')).toHaveCount(1);
  const initial = await countDomainItems(page);
  expect(initial).toBeGreaterThanOrEqual(1);

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  expect(await countDomainItems(page)).toBe(initial + 1);

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial + 1);
});

test("Cmd+Z undoes an item.remove; Cmd+Shift+Z redoes it", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.locator('[data-testid="block-slide"]')).toHaveCount(1);
  // Ensure at least 2 blocks so removal leaves one to assert against.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await expect(page.locator('[data-testid="block-slide"]')).toHaveCount(2);
  const initial = await countDomainItems(page);
  expect(initial).toBeGreaterThanOrEqual(2);

  // Phase 11 — slide-deck flavor uses FULL_FRAME so frames overlap; right-
  // click the top-most (last in DOM) block so the menu is dispatched.
  const topBlock = page.locator('[data-testid^="block-"]').last();
  await topBlock.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Delete frame/i }).click();
  expect(await countDomainItems(page)).toBe(initial - 1);

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial - 1);
});
