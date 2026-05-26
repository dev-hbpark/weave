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

test("WI-036 follow-up — `+` button hover opens submenu with frame / text / shape options; clicking 'text' inserts a text child", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-submenu" });
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
  // Hover the `+` button — submenu opens.
  await addBtn.hover();
  const submenu = page.getByTestId("frame-add-submenu");
  await expect(submenu).toBeVisible({ timeout: 2_000 });

  // Click "텍스트" inserts a text child into the hovered frame.
  const before = await childCountOf(page, parentId);
  await page.getByTestId("frame-add-text").click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
  const kinds = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            children: ReadonlyArray<{ kind: string }>;
          }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    return (parent?.children ?? []).map((c) => c.kind);
  }, parentId);
  expect(kinds).toContain("text");
});

test("WI-036 follow-up — deleting the hovered frame unmounts the bar (no stale menu)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-stale" });
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
  const frameRect = await page.evaluate((pid) => {
    const el = document.querySelector(`[data-frame-id="${pid}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, parentId);
  expect(frameRect).not.toBeNull();
  if (frameRect === null) return;
  await page.mouse.move(frameRect.x, frameRect.y);
  await expect(page.getByTestId("cmd-frame-addChild")).toBeVisible({ timeout: 3_000 });

  // Delete the hovered frame programmatically (the `✕` button does
  // the same thing via the frameDeleter slot; we skip the click to
  // avoid moving the mouse). The bar's RAF should detect the
  // missing frame element and clear the anchor.
  await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (id: string, input: unknown) => unknown };
      __weaveDoc?: { root: { id: unknown } };
    };
    const rootId = w.__weaveDoc !== undefined ? String(w.__weaveDoc.root.id) : "";
    w.__weaveEditor?.exec("weave.item.remove", { containerId: rootId, itemId: pid });
  }, parentId);

  await expect(page.getByTestId("cmd-frame-addChild")).toHaveCount(0, { timeout: 1_000 });
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
