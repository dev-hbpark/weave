// WI-039 — ThumbnailPanel as a reparent drop target.
//
// The controller drives `document.elementFromPoint` against the panel
// thumbnails' `data-frame-id`; the panel surface inherits both the
// drop-target highlight (valid) and the disabled affordance
// (`cursor: not-allowed`) for cycle-blocked targets. The spec exercises
// the command path (proves the wiring) and the `data-frame-id`
// presence on panel thumbnails (proves the surface plumbing).

import { expect, test } from "@playwright/test";
import {
  addFrame,
  clearAllDesigns,
  execReparent,
  prepareDesign,
  readParentInfo,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("ThumbnailPanel thumbnails carry `data-frame-id` (drop-target plumbing)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  // Each thumbnail tile carries both data-thumbnail-id and data-frame-id.
  // The reparent controller relies on data-frame-id for elementFromPoint
  // hit-tests, so the union is part of the public contract.
  const thumbnails = page.locator("[data-thumbnail-id]");
  await expect(thumbnails.first()).toHaveAttribute("data-frame-id", /.+/);
  // Both attributes resolve to the same id on every thumbnail.
  const count = await thumbnails.count();
  for (let i = 0; i < count; i++) {
    const tn = thumbnails.nth(i);
    const tid = await tn.getAttribute("data-thumbnail-id");
    const fid = await tn.getAttribute("data-frame-id");
    expect(fid).toBe(tid);
  }
});

test("editor.exec reparent moves a nested item onto a panel-targeted root frame + Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  // Layout: rootA (seed) + rootB (added) + child under rootB.
  // Reparent the child to rootA — the panel thumbnail for rootA is the
  // would-be drop target in the user flow.
  const initial = await page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ id: string | number }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return doc?.root.children.map((c) => String(c.id)) ?? [];
  });
  const rootA = initial[0]!;
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const afterB = await page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ id: string | number }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return doc?.root.children.map((c) => String(c.id)) ?? [];
  });
  const rootB = afterB[afterB.length - 1]!;
  await addFrame(page, "frame", {
    containerId: rootB,
    frame: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotation: 0 },
  });
  const childId = await page.evaluate((bid) => {
    interface Node {
      readonly id: string | number;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    function find(node: Node): Node | null {
      if (String(node.id) === bid) return node;
      for (const c of node.children) {
        const inner = find(c);
        if (inner !== null) return inner;
      }
      return null;
    }
    const parent = find(doc.root);
    return parent?.children[0] !== undefined ? String(parent.children[0].id) : null;
  }, rootB);
  expect(childId).not.toBeNull();

  await execReparent(page, [{ itemId: childId!, newParentId: rootA }]);
  expect((await readParentInfo(page, childId!))?.parentId).toBe(rootA);

  // design-header (z-30, h-12) overlaps frame-stage's local (5,5); use a
  // y past the header band so the click lands on the design plane proper.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(120);
  expect((await readParentInfo(page, childId!))?.parentId).toBe(rootB);
});
