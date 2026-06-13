// WI-214 / DR-137 — selection breadcrumb.
//
// When a nested frame (or any item inside it) is selected, a left-aligned
// breadcrumb bar shows the ancestor path (Top › … › selected). Clicking an
// ancestor segment moves the selection to that frame — the escape hatch for
// a container that is fully tiled by its children and has no clickable empty
// pixel.
//
// Gate (DR-137 §2): the bar appears only for a genuinely nested selection
// (trail ≥ 2). A top-level frame with no ancestor shows no bar.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function singleSelectionId(page: Page): Promise<string | undefined> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        itemSelection: {
          state: { get: () => { kind: "none" | "single" | "multi"; itemId?: unknown } };
        };
      };
    };
    const s = w.__weaveVm?.itemSelection.state.get();
    if (s === undefined || s.kind !== "single") return undefined;
    return String(s.itemId);
  });
}

async function setupNested(page: Page): Promise<{ parentId: string; childId: string }> {
  await prepareDesign(page, { flavor: "mixed", title: "WI-214-breadcrumb" });
  await addFrame(page, "frame", {
    frame: { x: 0.15, y: 0.15, width: 0.6, height: 0.6, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  // A child that fully fills the parent — the "no empty pixel" case.
  await addFrame(page, "frame", {
    containerId: parentId,
    frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  });
  const childId = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; children: ReadonlyArray<{ id: unknown }> }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    const inner = parent?.children?.at(-1);
    return inner === undefined ? "" : String(inner.id);
  }, parentId);
  return { parentId, childId };
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

test("breadcrumb shows the ancestor path when a nested frame is selected", async ({ page }) => {
  const { parentId, childId } = await setupNested(page);
  await select(page, childId);
  await expect.poll(() => singleSelectionId(page)).toBe(childId);

  await expect(page.getByTestId("selection-breadcrumb")).toBeVisible();
  await expect(page.getByTestId(`breadcrumb-seg-${parentId}`)).toBeVisible();
  await expect(page.getByTestId(`breadcrumb-seg-${childId}`)).toBeVisible();
});

test("clicking an ancestor segment selects the covering container", async ({ page }) => {
  const { parentId, childId } = await setupNested(page);
  await select(page, childId);
  await expect.poll(() => singleSelectionId(page)).toBe(childId);

  await page.getByTestId(`breadcrumb-seg-${parentId}`).click();
  await expect.poll(() => singleSelectionId(page)).toBe(parentId);
});

test("no breadcrumb for a top-level frame (no navigable ancestor)", async ({ page }) => {
  const { parentId } = await setupNested(page);
  // Parent is top-level → trail length 1 → bar hidden (DR-137 §2).
  await select(page, parentId);
  await expect.poll(() => singleSelectionId(page)).toBe(parentId);
  await expect(page.getByTestId("selection-breadcrumb")).not.toBeVisible();
});
