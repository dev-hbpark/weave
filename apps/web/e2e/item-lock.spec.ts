// DR-061 — item lock capability gate.
//
// Locking protects an item from move / resize / delete / text-edit while it
// stays selectable (so it can be re-selected and unlocked — no layers panel).
// This spec drives the real QuickActionBar lock toggle, then asserts the gates.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addText(page: Page): Promise<string> {
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
}

interface ItemView {
  locked?: boolean;
  exists: boolean;
}

async function readItem(page: Page, id: string): Promise<ItemView> {
  return page.evaluate((tid) => {
    type Node = {
      id: unknown;
      attrs: { locked?: boolean };
      children: ReadonlyArray<Node>;
    };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    function find(n: Node): Node | undefined {
      if (String(n.id) === tid) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    const it = w.__weaveDoc ? find(w.__weaveDoc.root) : undefined;
    return { locked: it?.attrs.locked, exists: it !== undefined };
  }, id);
}

test("lock toggle protects move/delete/edit; unlock restores", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "item-lock" });
  const id = await addText(page);
  expect(id).not.toBe("");
  await expect.poll(() => readItem(page, id).then((v) => v.exists)).toBe(true);

  // Resize handles are present while unlocked + selected.
  await page.getByTestId("text-block").first().click();
  await expect.poll(() => page.locator("[data-handle-dir]").count()).toBeGreaterThan(0);

  // Click the QuickActionBar lock toggle (label "잠금").
  const lockBtn = page.getByRole("button", { name: "잠금" }).first();
  await lockBtn.waitFor({ timeout: 8000 });
  await lockBtn.click();
  await expect.poll(() => readItem(page, id).then((v) => v.locked)).toBe(true);

  // DR-061 — locked: transform handles disappear + a lock badge appears.
  await expect.poll(() => page.locator("[data-handle-dir]").count()).toBe(0);
  await expect.poll(() => page.locator("[data-lock-badge]").count()).toBeGreaterThan(0);

  // Delete is blocked while locked.
  await page.evaluate(() => {
    (window as unknown as { __weaveVm?: { itemSelection: { clear: () => void } } }).__weaveVm; // noop touch
  });
  await page.getByTestId("text-block").first().click();
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  expect((await readItem(page, id)).exists).toBe(true); // still there

  // Double-click does NOT enter text edit while locked.
  await page.getByTestId("text-block").first().dblclick();
  await page.waitForTimeout(150);
  expect(await page.getByRole("textbox", { name: "Text content" }).count()).toBe(0);

  // Unlock via the toggle (now labeled "잠금" still — same command id).
  const lockBtn2 = page.getByRole("button", { name: "잠금" }).first();
  await lockBtn2.click();
  await expect.poll(() => readItem(page, id).then((v) => v.locked)).not.toBe(true);

  // After unlock, double-click DOES enter edit mode.
  await page.getByTestId("text-block").first().dblclick();
  await expect(page.getByRole("textbox", { name: "Text content" })).toBeVisible({ timeout: 4000 });
});

test("multi-selection lock toggles every selected item", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "multi-lock" });
  const a = await addText(page);
  const b = await addText(page);
  expect(a).not.toBe("");
  expect(b).not.toBe("");
  expect(a).not.toBe(b);

  // Select BOTH via the vm multi API.
  await page.evaluate(
    ([ia, ib]) => {
      const w = window as unknown as {
        __weaveVm?: { itemSelection: { setMany: (ids: Iterable<unknown>) => void } };
      };
      w.__weaveVm?.itemSelection.setMany([ia, ib]);
    },
    [a, b],
  );

  // The bar shows the lock toggle for a multi-selection — lock all.
  const lockBtn = page.getByRole("button", { name: "잠금" }).first();
  await lockBtn.waitFor({ timeout: 8000 });
  await lockBtn.click();
  await expect.poll(() => readItem(page, a).then((v) => v.locked)).toBe(true);
  await expect.poll(() => readItem(page, b).then((v) => v.locked)).toBe(true);

  // Toggle again → unlock all.
  await page.getByRole("button", { name: "잠금" }).first().click();
  await expect.poll(() => readItem(page, a).then((v) => v.locked)).not.toBe(true);
  await expect.poll(() => readItem(page, b).then((v) => v.locked)).not.toBe(true);
});
