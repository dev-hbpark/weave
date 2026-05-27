// WI-039 — Multi-entry reparent in a single patch / single history step.
//
// Selecting 2+ items and dispatching a reparent must produce ONE
// `item.reparent` patch with N entries, so a single Cmd+Z reverts every
// move atomically. Spec proves:
//   - both items end up under the new parent after dispatch
//   - one Cmd+Z restores ALL of them to their original parents

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

test("multi-entry reparent moves N items in a single patch + single Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  // Layout: rootA (seed) + rootB (added).
  //   rootA has childA-1, childA-2 nested.
  //   reparent both to rootB in one dispatch.
  const initial = await page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ id: string | number }> } };
    return (
      (window as unknown as { __weaveDoc?: Doc }).__weaveDoc?.root.children.map((c) =>
        String(c.id),
      ) ?? []
    );
  });
  const rootA = initial[0]!;
  await addFrame(page, "frame", {
    frame: { x: 0.55, y: 0.1, width: 0.35, height: 0.35, rotation: 0 },
  });
  const rootB = (
    await page.evaluate(() => {
      type Doc = { root: { children: ReadonlyArray<{ id: string | number }> } };
      const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
      return doc?.root.children.map((c) => String(c.id)) ?? [];
    })
  ).slice(-1)[0]!;
  await addFrame(page, "frame", {
    containerId: rootA,
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    containerId: rootA,
    frame: { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0 },
  });
  const aChildren = await page.evaluate((aid) => {
    interface Node {
      readonly id: string | number;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [] as string[];
    function find(node: Node): Node | null {
      if (String(node.id) === aid) return node;
      for (const c of node.children) {
        const inner = find(c);
        if (inner !== null) return inner;
      }
      return null;
    }
    const parent = find(doc.root);
    return parent?.children.map((c) => String(c.id)) ?? [];
  }, rootA);
  expect(aChildren.length).toBe(2);
  const [c1, c2] = aChildren;

  const beforeC1 = await readParentInfo(page, c1!);
  const beforeC2 = await readParentInfo(page, c2!);
  expect(beforeC1?.parentId).toBe(rootA);
  expect(beforeC2?.parentId).toBe(rootA);

  // Single dispatch, two entries.
  await execReparent(page, [
    { itemId: c1!, newParentId: rootB },
    { itemId: c2!, newParentId: rootB },
  ]);

  // Both children now under rootB.
  expect((await readParentInfo(page, c1!))?.parentId).toBe(rootB);
  expect((await readParentInfo(page, c2!))?.parentId).toBe(rootB);

  // ONE Cmd+Z restores BOTH (atomic history entry).
  // design-header (z-30, h-12) overlaps frame-stage's local (5,5); use a
  // y past the header band so the click lands on the design plane proper.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(120);

  const revertedC1 = await readParentInfo(page, c1!);
  const revertedC2 = await readParentInfo(page, c2!);
  expect(revertedC1?.parentId).toBe(rootA);
  expect(revertedC2?.parentId).toBe(rootA);
  // Index inside the original parent restored too (z-order preserved).
  expect(revertedC1?.indexInParent).toBe(beforeC1!.indexInParent);
  expect(revertedC2?.indexInParent).toBe(beforeC2!.indexInParent);
});

test("empty entries dispatch is a no-op + no history entry consumed", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  // Snapshot root order before / after dispatch.
  const snapshot = () =>
    page.evaluate(() => {
      type Doc = { root: { children: ReadonlyArray<{ id: string | number }> } };
      return (
        (window as unknown as { __weaveDoc?: Doc }).__weaveDoc?.root.children.map((c) =>
          String(c.id),
        ) ?? []
      );
    });
  const before = await snapshot();
  await execReparent(page, []);
  expect(await snapshot()).toEqual(before);
});
