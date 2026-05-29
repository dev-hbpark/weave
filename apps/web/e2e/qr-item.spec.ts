// WI-058 — data-driven QR item. Verifies in the live runtime: a qr item
// renders a QR (module matrix → SVG), editing `data` regenerates it, empty data
// shows the placeholder, and Cmd+Z reverts — all via commands.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addQr(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "qr",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.3, y: 0.3, width: 0.3, height: 0.3, rotation: 0 },
    });
    return String(r.value);
  });
  await page.waitForTimeout(150);
  return id;
}

async function setData(page: Page, itemId: string, data: string): Promise<void> {
  await page.evaluate(
    ({ id, d }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.update", { itemId: id, attrs: { data: d } });
    },
    { id: itemId, d: data },
  );
  await page.waitForTimeout(120);
}

test("WI-058 — qr item renders a QR; editing data regenerates it; Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-058-qr" });
  const id = await addQr(page);

  // Seed default data "https://example.com" → a real QR (≥ version 1 = 21 modules).
  const block = page.locator('[data-testid="qr-block"]');
  await expect(block).toBeVisible();
  await expect
    .poll(async () => Number(await block.getAttribute("data-qr-modules")))
    .toBeGreaterThanOrEqual(21);
  await expect(page.locator('[data-testid="qr-block"] svg path')).toBeVisible();

  const before = Number(await block.getAttribute("data-qr-modules"));

  // A longer payload pushes to a larger version → more modules.
  await setData(page, id, "https://example.com/a-considerably-longer-url-to-grow-the-version");
  await expect
    .poll(async () => Number(await block.getAttribute("data-qr-modules")))
    .toBeGreaterThan(before);

  // One undo reverts the data change (module count back to the original).
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(100);
  await expect.poll(async () => Number(await block.getAttribute("data-qr-modules"))).toBe(before);
});

test("WI-058 — empty data shows the placeholder, not a QR", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-058-qr-empty" });
  const id = await addQr(page);
  await setData(page, id, "");
  await expect(page.locator('[data-testid="qr-block"][data-qr-empty="true"]')).toBeVisible();
});
