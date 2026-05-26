// WI-036 follow-up — QuickActionBar pivoted from hover-driven to
// SELECTION-driven. The bar mounts when a frame is selected, stays
// fixed-positioned above the frame, and is unaffected by where the
// mouse goes next. The `+` button still hover-opens a submenu of add
// options; clicking an option only closes the submenu, leaving the
// bar visible for further actions.

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

async function selectFrame(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
  // React state propagates via vm.itemSelection signal → useSelection
  // hook → re-render. Give it one frame so the next assertion doesn't
  // race the bar's mount.
  await page.waitForTimeout(50);
}

async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(undefined);
  });
}

test("WI-036 — selecting a frame surfaces the bar; clicking + adds a child frame", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-select" });
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

  // Before selection — no bar.
  await expect(page.getByTestId("cmd-frame-addChild")).toHaveCount(0);

  await selectFrame(page, parentId);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  const before = await childCountOf(page, parentId);
  await addBtn.click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("WI-036 — bar persists when the mouse leaves the frame (selection-driven, hover-agnostic)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-leave" });
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
  await selectFrame(page, parentId);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  // Move the mouse far away — bar stays because selection stays.
  await page.mouse.move(8, 8);
  await page.waitForTimeout(400);
  await expect(addBtn).toBeVisible();
});

test("WI-036 — clearing selection unmounts the bar", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-clear" });
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
  await selectFrame(page, parentId);
  await expect(page.getByTestId("cmd-frame-addChild")).toBeVisible({ timeout: 3_000 });

  await clearSelection(page);
  await expect(page.getByTestId("cmd-frame-addChild")).toHaveCount(0, { timeout: 1_000 });
});

test("WI-036 — `+` button hover opens submenu; clicking 'text' inserts a text child and closes the submenu only (bar stays)", async ({ page }) => {
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
  await selectFrame(page, parentId);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  await addBtn.hover();
  const submenu = page.getByTestId("frame-add-submenu");
  await expect(submenu).toBeVisible({ timeout: 2_000 });

  const before = await childCountOf(page, parentId);
  await page.getByTestId("frame-add-text").click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
  // Submenu closes; bar stays (selection didn't change).
  await expect(submenu).toHaveCount(0, { timeout: 1_000 });
  await expect(addBtn).toBeVisible();

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

test("WI-036 — deleting the selected frame clears the bar (no stale menu)", async ({ page }) => {
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
  await selectFrame(page, parentId);
  await expect(page.getByTestId("cmd-frame-addChild")).toBeVisible({ timeout: 3_000 });

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
