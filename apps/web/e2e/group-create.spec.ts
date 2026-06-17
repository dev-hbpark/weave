import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// WI-242 A2 — `weave.items.group` wraps a selection in a `group` KIND (DR-159),
// not a frame. This is the live canvas check the A1 registration deferred:
//   • a group renders its CHILDREN (GroupBlock paints nothing; agocraft's
//     FrameSurface must still recurse the group's children),
//   • Cmd+Z unwraps it (one transaction; children home, group gone).
//
// Members are placed INSIDE the active slide (not at the deck root, where only
// the active slide renders) so the child elements genuinely mount on the canvas
// and the render proof is real, not trivially equal.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type DocNode = { id: string | number; kind: string; children?: ReadonlyArray<DocNode> };
type Doc = { root: { id: string | number; children: ReadonlyArray<DocNode> } };

function activeSlideId(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const first = doc?.root.children[0];
    if (first === undefined) throw new Error("no slide");
    return String(first.id);
  });
}

function childrenOf(page: import("@playwright/test").Page, parentId: string) {
  return page.evaluate((pid) => {
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const find = (n: DocNode): DocNode | undefined => {
      if (String(n.id) === pid) return n;
      for (const c of n.children ?? []) {
        const f = find(c);
        if (f !== undefined) return f;
      }
      return undefined;
    };
    const root = doc?.root as unknown as DocNode | undefined;
    const node = root === undefined ? undefined : find(root);
    return (node?.children ?? []).map((c) => ({ id: String(c.id), kind: c.kind }));
  }, parentId);
}

test("Cmd+G wraps two siblings in a group kind; children keep rendering; Cmd+Z unwraps", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const slide = await activeSlideId(page);

  // Two sibling frames INSIDE the active slide (so they render on-canvas).
  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.6, y: 0.6, width: 0.2, height: 0.2, rotation: 0 },
  });

  const members = await childrenOf(page, slide);
  const memberIds = members.filter((c) => c.kind === "frame").map((c) => c.id);
  expect(memberIds).toHaveLength(2);

  // Both members render before grouping.
  for (const id of memberIds) {
    await expect(page.locator(`[data-frame-id="${id}"]`)).toHaveCount(1);
  }

  // Group them via the real command (the Cmd+G dispatch path).
  const groupId = await page.evaluate((ids) => {
    type Editor = { exec: (n: string, i: unknown) => { ok: boolean; value?: string } };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    const r = ed?.exec("weave.items.group", {
      itemIds: ids,
      designWidth: 1920,
      designHeight: 1080,
    });
    return r?.ok === true ? (r.value ?? null) : null;
  }, memberIds);
  expect(groupId).not.toBeNull();
  await page.waitForTimeout(80);

  // The slide's new child is a `group` holding exactly the two members.
  const slideKids = await childrenOf(page, slide);
  const group = slideKids.find((c) => c.id === groupId);
  expect(group?.kind).toBe("group");
  const inGroup = await childrenOf(page, groupId as string);
  expect(inGroup.map((c) => c.id).sort()).toEqual([...memberIds].sort());

  // RENDER PROOF (the A1 debt): both child frames STILL mount after wrapping —
  // GroupBlock paints null, but FrameSurface recursed the group's children.
  for (const id of memberIds) {
    await expect(page.locator(`[data-frame-id="${id}"]`)).toHaveCount(1);
  }

  // Undo unwraps: group gone, members back as the slide's direct children.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);
  const undone = await childrenOf(page, slide);
  expect(undone.find((c) => c.id === groupId)).toBeUndefined();
  const undoneIds = undone.map((c) => c.id);
  expect(undoneIds).toContain(memberIds[0]);
  expect(undoneIds).toContain(memberIds[1]);
});
