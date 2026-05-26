// WI-035 P2 — QuickActionBar "+" button (frame.addChild) on hovered
// frames. Hover affordance (WI-027) augmented with a single-click
// child-frame add — same `weave.item.add` SSOT.

import { expect, test, type Page } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function childCountOf(page: Page, parentId: string): Promise<number> {
  return await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            children: ReadonlyArray<{ id: unknown }>;
          }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    return parent?.children?.length ?? 0;
  }, parentId);
}

test("WI-036 — hover frame, then move mouse onto the anchored bar (above the frame edge), bar stays clickable", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-gap" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.4, width: 0.4, height: 0.3, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  const before = await childCountOf(page, parentId);

  // Hover deep inside the frame to surface the anchored bar.
  const frameRect = await page.evaluate((pid) => {
    const el = document.querySelector(`[data-frame-id="${pid}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, left: r.left };
  }, parentId);
  expect(frameRect).not.toBeNull();
  if (frameRect === null) return;
  await page.mouse.move(frameRect.x, frameRect.y);

  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  // Move directly to the bar's center (~24px above the frame edge).
  // The bar's anchor wrap has 12px padding extending into the frame
  // ↔ bar gap, so any straight-line traversal lands either on the
  // frame, the wrap padding, or the bar — never on empty pixels.
  await page.mouse.move(frameRect.left + 16, frameRect.top - 24, { steps: 12 });
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("WI-036 — bar disappears after grace expires when mouse leaves and never reaches the bar", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-grace" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  const frameRect = await page.evaluate((pid) => {
    const el = document.querySelector(`[data-frame-id="${pid}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, parentId);
  expect(frameRect).not.toBeNull();
  if (frameRect === null) return;
  await page.mouse.move(frameRect.x, frameRect.y);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  // Move far away into an empty region and wait past the 200ms grace.
  await page.mouse.move(8, 8);
  await page.waitForTimeout(350);
  await expect(addBtn).toHaveCount(0);
});

test("hover a frame + click QuickActionBar '+' → child frame added", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-035-P2" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  const before = await childCountOf(page, parentId);

  // Hover the frame to surface QuickActionBar.
  const rect = await page.evaluate((pid) => {
    const el = document.querySelector(`[data-frame-id="${pid}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, parentId);
  expect(rect).not.toBeNull();
  if (rect === null) return;
  await page.mouse.move(rect.x, rect.y);

  // QuickActionBar shows `frame.addChild` for hovered frame.
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });
  await addBtn.click();

  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});
