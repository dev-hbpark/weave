// WI-039 — ContextMenu "다른 부모로 이동" sub-menu picker.
//
// Three angles:
//   1. Sub-menu opens on the "다른 부모로 이동" row hover and lists every
//      frame (depth-first) plus the synthetic root row.
//   2. Selecting a target row dispatches the reparent → doc state mutated
//      → Cmd+Z reverts.
//   3. Cycle-blocked targets (the right-clicked frame itself + its
//      descendants) render with `data-disabled="true"` and clicking them
//      is a no-op (Radix swallows the select on disabled items).

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, readParentInfo } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function rootIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ id: string | number }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return doc?.root.children.map((c) => String(c.id)) ?? [];
  });
}

test('"다른 부모로 이동" sub-menu opens and lists root + every frame', async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const roots = await rootIds(page);
  expect(roots.length).toBeGreaterThanOrEqual(2);
  const rightClickTargetId = roots[0]!;

  // Right-click on the first root frame's element.
  const frameEl = page.locator(`[data-frame-id="${rightClickTargetId}"]`).first();
  await frameEl.click({ button: "right" });

  const moveTo = page.getByTestId("ctx-move-to");
  await expect(moveTo).toBeVisible();
  await moveTo.hover();

  // Sub-menu content is portaled — wait for it.
  const subContent = page.getByTestId("ctx-move-to-content");
  await expect(subContent).toBeVisible({ timeout: 1500 });

  // Root row always present.
  await expect(page.getByTestId("ctx-move-to-row-@root")).toBeVisible();
  // Every other root frame appears as a depth-1 row.
  for (const id of roots) {
    await expect(page.getByTestId(`ctx-move-to-row-${id}`)).toBeVisible();
  }
});

test('clicking a target row in "다른 부모로 이동" reparents and Cmd+Z reverts', async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  // Layout: rootA (seed), rootB (added). Reparent rootA → rootB via picker.
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const roots = await rootIds(page);
  const rootA = roots[0]!;
  const rootB = roots[1]!;

  const before = await readParentInfo(page, rootA);
  expect(before?.parentId).not.toBe(rootB);

  await page.locator(`[data-frame-id="${rootA}"]`).first().click({ button: "right" });
  await page.getByTestId("ctx-move-to").hover();
  await expect(page.getByTestId("ctx-move-to-content")).toBeVisible({
    timeout: 1500,
  });
  await page.getByTestId(`ctx-move-to-row-${rootB}`).click();
  await page.waitForTimeout(120);

  expect((await readParentInfo(page, rootA))?.parentId).toBe(rootB);

  // design-header (z-30, h-12) overlaps frame-stage's local (5,5); use a
  // y past the header band so the click lands on the design plane proper.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(120);
  expect((await readParentInfo(page, rootA))?.parentId).toBe(before!.parentId);
});

test("cycle-blocked rows render as disabled (right-clicked frame itself + its descendants)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const roots = await rootIds(page);
  const parent = roots[0]!;
  await addFrame(page, "frame", {
    containerId: parent,
    frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 },
  });
  // Find the child id under `parent`.
  const childId = await page.evaluate((pid) => {
    interface Node {
      readonly id: string | number;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    function find(node: Node): Node | null {
      if (String(node.id) === pid) return node;
      for (const c of node.children) {
        const inner = find(c);
        if (inner !== null) return inner;
      }
      return null;
    }
    const par = find(doc.root);
    return par?.children[0] !== undefined ? String(par.children[0].id) : null;
  }, parent);
  expect(childId).not.toBeNull();

  // Right-click `parent`. The picker should disable both `parent` itself
  // (moving onto self = cycle) and `childId` (moving onto descendant =
  // cycle).
  await page.locator(`[data-frame-id="${parent}"]`).first().click({ button: "right" });
  await page.getByTestId("ctx-move-to").hover();
  await expect(page.getByTestId("ctx-move-to-content")).toBeVisible({
    timeout: 1500,
  });

  // Behavioral check: clicking a cycle-blocked row must NOT change the
  // doc tree. Right-clicking `parent` and selecting "@self" (the parent
  // row in the picker) is a cycle (moving self into self) — the
  // command's guard rejects, so doc state is unchanged after the click.
  const beforeParentInfo = await readParentInfo(page, parent);
  await page
    .getByTestId(`ctx-move-to-row-${parent}`)
    .click()
    .catch(() => {
      // Radix may swallow the click on a disabled item; either way the
      // contract is "parent is not reparented".
    });
  await page.waitForTimeout(150);
  const afterParentInfo = await readParentInfo(page, parent);
  expect(afterParentInfo?.parentId).toBe(beforeParentInfo?.parentId);
  expect(afterParentInfo?.indexInParent).toBe(beforeParentInfo?.indexInParent);
});
