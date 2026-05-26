// WI-033 A2 — Cmd/Ctrl-click deep select.
//
// Holding the platform meta modifier bypasses Figma's parent-first
// heuristic: the clicked leaf is selected directly, regardless of how
// deeply it sits in the nesting tree.

import { expect, test, type Page } from "@playwright/test";
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

async function centerOf(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  return await page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

async function setupTwoLevels(page: Page): Promise<{ parentId: string; childId: string }> {
  await prepareDesign(page, { flavor: "mixed", title: "A2-cmd-deep" });
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
  await addFrame(page, "frame", {
    containerId: parentId,
    frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
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

test("Cmd/Ctrl + click on a nested frame selects the leaf directly (parent-first bypass)", async ({
  page,
}) => {
  const { childId } = await setupTwoLevels(page);
  // `locator.click({ modifiers })` populates the synthetic MouseEvent's
  // metaKey / ctrlKey correctly (the bare `mouse.click({ modifiers })`
  // form in headless Chromium does not).
  await page.locator(`[data-frame-id="${childId}"]`).click({
    modifiers: ["ControlOrMeta"],
  });
  await expect.poll(() => singleSelectionId(page)).toBe(childId);
});

test("Cmd-click works from any starting selection state (depth-blind)", async ({
  page,
}) => {
  const { parentId, childId } = await setupTwoLevels(page);
  // Add a sibling top-level to set an unrelated current selection.
  await addFrame(page, "frame", {
    frame: { x: 0.78, y: 0.15, width: 0.18, height: 0.6, rotation: 0 },
  });
  const siblingId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  await page.locator(`[data-frame-id="${siblingId}"]`).click();
  await expect.poll(() => singleSelectionId(page)).toBe(siblingId);
  // Cmd-click from the sibling onto a deep nested leaf → leaf is selected.
  await page.locator(`[data-frame-id="${childId}"]`).click({
    modifiers: ["ControlOrMeta"],
  });
  await expect.poll(() => singleSelectionId(page)).toBe(childId);
  // Sanity: the parent was never selected during the sequence.
  expect(await singleSelectionId(page)).not.toBe(parentId);
});
