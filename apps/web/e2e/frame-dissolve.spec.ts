// WI-050 — "delete frame, keep children" (dissolve a frame).
//
// Two surfaces share one command (`weave.frame.removeKeepingChildren`):
//   1. QuickActionBar "ungroup" button (selection-driven, via the host slot).
//   2. Cmd/Ctrl + Backspace hotkey (DesignPage window keydown listener).
// Both reparent the frame's direct children to the ROOT design (positions
// preserved), then remove the frame — as ONE undoable transaction. The undo
// must restore the frame WITH its children and not duplicate them at root.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, readParentInfo } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function rootId(page: Page): Promise<string> {
  return page.evaluate(() => {
    type Doc = { root: { id: string | number } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return String(doc?.root.id ?? "");
  });
}

async function childIdsOf(page: Page, containerId: string | null): Promise<string[]> {
  return page.evaluate((cid) => {
    interface Node {
      readonly id: string | number;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    const container =
      cid === null || String(doc.root.id) === cid ? doc.root : findNode(doc.root, cid);
    function findNode(node: Node, target: string): Node | null {
      if (String(node.id) === target) return node;
      for (const c of node.children) {
        const inner = findNode(c, target);
        if (inner !== null) return inner;
      }
      return null;
    }
    return container?.children.map((c) => String(c.id)) ?? [];
  }, containerId);
}

/** Add one frame into `containerId` (root when null) and return its id by
 *  diffing the container's children before/after. Each add is its own awaited
 *  step so React flushes the new item into `__weaveDoc` before the next read
 *  (a single synchronous exec sequence would race the staging pipeline). */
async function addFrameAndId(
  page: Page,
  containerId: string | null,
  frame: { x: number; y: number; width: number; height: number; rotation: number },
): Promise<string> {
  const before = new Set(await childIdsOf(page, containerId));
  await addFrame(page, "frame", { ...(containerId !== null ? { containerId } : {}), frame });
  await page.waitForTimeout(60);
  const after = await childIdsOf(page, containerId);
  const added = after.find((id) => !before.has(id));
  if (added === undefined) throw new Error("addFrameAndId: no new child appeared");
  return added;
}

/** Build: root → F(frame) → [c1, c2]. Returns ids + the root id. */
async function buildFrameWithChildren(
  page: Page,
): Promise<{ root: string; F: string; c1: string; c2: string }> {
  const root = await rootId(page);
  const F = await addFrameAndId(page, null, {
    x: 0.2,
    y: 0.2,
    width: 0.5,
    height: 0.5,
    rotation: 0,
  });
  const c1 = await addFrameAndId(page, F, { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 });
  const c2 = await addFrameAndId(page, F, { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0 });
  return { root, F, c1, c2 };
}

async function selectFrame(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    type Vm = { itemSelection: { clear: () => void; set: (x: unknown) => void } };
    const vm = (window as unknown as { __weaveVm?: Vm }).__weaveVm;
    vm?.itemSelection.clear();
    vm?.itemSelection.set(target);
  }, id);
  await page.waitForTimeout(60);
}

test("QuickActionBar ungroup button: children reparent to root, frame removed", async ({
  page,
}) => {
  await prepareDesign(page);
  const { root, F, c1, c2 } = await buildFrameWithChildren(page);

  // Sanity: c1 / c2 live inside F before the dissolve.
  expect((await readParentInfo(page, c1))?.parentId).toBe(F);
  expect((await readParentInfo(page, c2))?.parentId).toBe(F);

  await selectFrame(page, F);
  const btn = page.getByTestId("cmd-frame-removeKeepingChildren");
  await expect(btn).toBeVisible({ timeout: 2000 });
  await btn.click();
  await page.waitForTimeout(150);

  // Frame gone; both children re-homed to the root design.
  expect(await readParentInfo(page, F)).toBeNull();
  expect((await readParentInfo(page, c1))?.parentId).toBe(root);
  expect((await readParentInfo(page, c2))?.parentId).toBe(root);
});

test("Cmd+Backspace dissolves; Cmd+Z restores frame+children; Cmd+Shift+Z redoes", async ({
  page,
}) => {
  await prepareDesign(page);
  const { root, F, c1, c2 } = await buildFrameWithChildren(page);

  // Focus the canvas (not a text field) so the window keydown handler runs,
  // then re-select F (clicking the stage clears the selection).
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 120 } });
  await selectFrame(page, F);

  await page.keyboard.press("ControlOrMeta+Backspace");
  await page.waitForTimeout(150);
  expect(await readParentInfo(page, F)).toBeNull();
  expect((await readParentInfo(page, c1))?.parentId).toBe(root);
  expect((await readParentInfo(page, c2))?.parentId).toBe(root);

  // Undo — frame comes back WITH its children; they must NOT linger at root.
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  expect(await readParentInfo(page, F)).not.toBeNull();
  expect((await readParentInfo(page, c1))?.parentId).toBe(F);
  expect((await readParentInfo(page, c2))?.parentId).toBe(F);
  expect(await childIdsOf(page, root)).not.toContain(c1);

  // Redo — back to dissolved.
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(150);
  expect(await readParentInfo(page, F)).toBeNull();
  expect((await readParentInfo(page, c1))?.parentId).toBe(root);
});
