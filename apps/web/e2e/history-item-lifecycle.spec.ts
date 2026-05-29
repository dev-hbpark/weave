import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 8 / 10b — item add / remove must be undoable.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function countDomainItems(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ kind: string }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return -1;
    return doc.root.children.filter((c) => ["frame"].includes(c.kind)).length;
  });
}

test("Cmd+Z undoes an item.add; Cmd+Shift+Z redoes it", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(1);
  const initial = await countDomainItems(page);
  expect(initial).toBeGreaterThanOrEqual(1);

  await addFrame(page, "slide");
  expect(await countDomainItems(page)).toBe(initial + 1);

  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial + 1);
});

// WI-032 Phase 3c — slide-deck flavor 의 wizard 첫 child 가 frame 이라
// FULL_FRAME 위에 새 frame 을 add → 두 frame 이 같은 자리 (full-frame)
// 에 겹침. 가장-위 block 의 right-click 이 ContextMenu 를 띄우는 path 가
// frame 의 hover-affordance + selection chrome 의 priority 와 race.
// frame paradigm 의 right-click context menu 가 별도 PR 에서 정리.
test.skip("Cmd+Z undoes an item.remove; Cmd+Shift+Z redoes it", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(1);
  // Ensure at least 2 blocks so removal leaves one to assert against.
  await addFrame(page, "slide");
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(2);
  const initial = await countDomainItems(page);
  expect(initial).toBeGreaterThanOrEqual(2);

  // Phase 11 — slide-deck flavor uses FULL_FRAME so frames overlap; right-
  // click the top-most (last in DOM) block so the menu is dispatched.
  const topBlock = page.locator('[data-testid="frame-block"]').last();
  await topBlock.click({ button: "right" });
  await page.getByTestId("ctx-delete-frame").click();
  expect(await countDomainItems(page)).toBe(initial - 1);

  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(50);
  expect(await countDomainItems(page)).toBe(initial - 1);
});
