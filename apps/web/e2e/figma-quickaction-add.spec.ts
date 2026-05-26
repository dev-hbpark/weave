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
