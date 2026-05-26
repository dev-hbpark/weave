// WI-033 A4 — right-click Layer Picker.
//
// When the cursor sits over a nested frame (i.e., overlapping multiple
// frames at the same point), right-clicking opens the ContextMenu with
// a "Select layer" section at the top — one row per overlapping frame,
// deepest-first. Clicking a row moves the selection to that frame.
//
// When the cursor is over a single (top-level) frame with no overlap,
// the section is elided and the menu renders the legacy chrome only.

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

async function centerOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  return await page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

async function setupNested(page: Page): Promise<{ parentId: string; childId: string }> {
  await prepareDesign(page, { flavor: "mixed", title: "A4-layer-picker" });
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

test("right-click on a nested frame shows the 'Select layer' section deepest-first", async ({
  page,
}) => {
  const { parentId, childId } = await setupNested(page);
  // `page.mouse.click({ button: "right" })` is the only form that
  // synthesises a native `contextmenu` event (Playwright's locator
  // form treats `right` as a mouse-only press). The setup coords
  // here keep the click inside the default 1280×720 viewport.
  // Matches the form used by `frame-drill-in.spec.ts` historically —
  // Playwright's locator.click with `button: "right"` synthesises both
  // the right-click pointer event chain AND the contextmenu event
  // (mouse.click() variant in headless Chromium does not always).
  await page
    .locator(`[data-frame-id="${childId}"]`)
    .click({ button: "right", position: { x: 4, y: 4 } });
  // Check the ContextMenu itself opened first — if the Delete row isn't
  // visible, the contextmenu event didn't reach our handler at all.
  await expect(page.getByTestId("ctx-delete-frame")).toBeVisible();
  // The section label is the Radix Label inside the ContextMenuContent.
  await expect(page.getByText("Select layer", { exact: true })).toBeVisible();
  // Both layers present, child row before parent row (deepest-first).
  const childRow = page.getByTestId(`layer-pick-${childId}`);
  const parentRow = page.getByTestId(`layer-pick-${parentId}`);
  await expect(childRow).toBeVisible();
  await expect(parentRow).toBeVisible();
  const childBox = await childRow.boundingBox();
  const parentBox = await parentRow.boundingBox();
  expect(childBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  // deepest-first → child row sits above parent row visually.
  expect((childBox?.y ?? 0)).toBeLessThan(parentBox?.y ?? 0);
});

test("clicking a layer row moves the selection to that frame", async ({ page }) => {
  const { parentId, childId } = await setupNested(page);
  // Pre-select the parent so we can verify the row click moves it.
  await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(pid);
  }, parentId);
  await expect.poll(() => singleSelectionId(page)).toBe(parentId);
  // Right-click on the nested child to open the picker.
  // Matches the form used by `frame-drill-in.spec.ts` historically —
  // Playwright's locator.click with `button: "right"` synthesises both
  // the right-click pointer event chain AND the contextmenu event
  // (mouse.click() variant in headless Chromium does not always).
  await page
    .locator(`[data-frame-id="${childId}"]`)
    .click({ button: "right", position: { x: 4, y: 4 } });
  // Pick the deepest layer row (the child) explicitly.
  await page.getByTestId(`layer-pick-${childId}`).click();
  await expect.poll(() => singleSelectionId(page)).toBe(childId);
});

test("right-click on a frame with no overlapping children elides the Select-layer section", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "A4-no-overlap" });
  // A single top-level frame with no nested children.
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const soloId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  const c = await centerOf(page, soloId);
  await page.mouse.click(c.x, c.y, { button: "right" });
  // The "Delete" row is still there (FrameContextMenu's remaining
  // non-drill-in action after WI-033 P2 retired "Enter frame").
  await expect(page.getByTestId("ctx-delete-frame")).toBeVisible();
  // But the layer label / row should not (only one frame at the point).
  await expect(page.getByText("Select layer", { exact: true })).not.toBeVisible();
  await expect(page.getByTestId(`layer-pick-${soloId}`)).not.toBeVisible();
});
