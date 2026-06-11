// WI-034 → WI-183 — adding INTO a frame with the Alt rubber-band.
//
// WI-034 originally let Alt+drag START inside a frame's interior (frame-move
// declared `alt: "forbidden"` and yielded). WI-183 supersedes that arm:
// Alt+drag starting on an ITEM BODY is now the Figma/Keynote DUPLICATE-drag
// (move-modifiers.ts decorator), and the alt-rubber-band only claims starts
// on empty space / page background (acceptAltDrawTarget). Drawing into a
// frame still works because the commit adapter resolves the container from
// the final rect's CENTER (rubber-band/agocraft-adapter.ts) — the gesture
// just starts on empty canvas and sweeps into the frame.
//
// Covered here:
//   • Alt+drag from empty space with the rect center inside a parent frame
//     → new item lands as that parent's CHILD (the WI-034 capability, on
//     its surviving path).
//   • Alt+drag starting ON the frame body → duplicate-drag (WI-183): one
//     copy added at root, no rubber-band popover.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function setupParent(page: Page): Promise<string> {
  await prepareDesign(page, { flavor: "mixed", title: "WI-034-parent" });
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
  expect(parentId.length).toBeGreaterThan(0);
  return parentId;
}

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

async function rootChildCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return w.__weaveDoc?.root.children?.length ?? 0;
  });
}

async function frameRect(
  page: Page,
  id: string,
): Promise<{ left: number; top: number; width: number; height: number }> {
  const rect = await page.evaluate((pid) => {
    const el = document.querySelector(
      `[data-testid="block-frame"][data-frame-id="${pid}"]`,
    ) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, id);
  expect(rect).not.toBeNull();
  return rect as { left: number; top: number; width: number; height: number };
}

test("Alt+drag from empty space sweeping into a frame adds the new item as that frame's child", async ({
  page,
}) => {
  const parentId = await setupParent(page);
  const rect = await frameRect(page, parentId);

  // Start OUTSIDE the parent's left edge (empty canvas — required since
  // WI-183: an item-body start would duplicate-drag instead). Sweep deep
  // into the parent so the drawn rect's CENTER lands inside it — the
  // commit adapter's hit-test point.
  const startX = rect.left - 40;
  const startY = rect.top + rect.height * 0.3;
  const endX = rect.left + rect.width * 0.6;
  const endY = rect.top + rect.height * 0.7;
  // center x = rect.left + (0.6·w − 40)/2 → inside; center y → inside.

  const beforeCount = await childCountOf(page, parentId);

  await page.keyboard.down("Alt");
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Alt");

  // The RubberBand's recommendation popover opens on release. Pick the
  // first recommendation to commit the add.
  const recommendation = page.locator('[data-testid^="rubber-band-popover-item-"]').first();
  await expect(recommendation).toBeVisible({ timeout: 5_000 });
  await recommendation.click();

  await expect.poll(() => childCountOf(page, parentId)).toBe(beforeCount + 1);
});

test("Alt+drag starting ON a frame body duplicate-drags it (WI-183) — no rubber-band popover", async ({
  page,
}) => {
  const parentId = await setupParent(page);
  const rect = await frameRect(page, parentId);

  const beforeRoot = await rootChildCount(page);

  // Start on the frame's interior (its body) and drag.
  await page.keyboard.down("Alt");
  await page.mouse.move(rect.left + rect.width * 0.3, rect.top + rect.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(rect.left + rect.width * 0.8, rect.top + rect.height * 0.8, {
    steps: 10,
  });
  await page.mouse.up();
  await page.keyboard.up("Alt");

  // Duplicate-in-place fired at the drag threshold → one extra root child.
  await expect.poll(() => rootChildCount(page)).toBe(beforeRoot + 1);
  // And the rubber-band popover must NOT have opened (the old WI-034 arm).
  await expect(page.locator('[data-testid^="rubber-band-popover-item-"]')).toHaveCount(0);
});
