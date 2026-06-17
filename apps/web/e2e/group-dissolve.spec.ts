import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// WI-242 A3 — the remove side. Removing a 2-child group's child auto-dissolves
// the group (the survivor reparents to the group's parent, the emptied group is
// removed) in one transaction; ungroup (removeKeepingChildren) lifts both
// children back. Live canvas check: the survivor / children keep rendering.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type DocNode = { id: string | number; kind: string; children?: ReadonlyArray<DocNode> };
type Doc = { root: { children: ReadonlyArray<DocNode> } };

function readRoot(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    return doc.root.children.map((c) => ({
      id: String(c.id),
      kind: c.kind,
      childIds: (c.children ?? []).map((g) => String(g.id)),
    }));
  });
}

async function makeGroupOf(page: import("@playwright/test").Page): Promise<{
  groupId: string;
  memberIds: string[];
}> {
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.6, width: 0.2, height: 0.2, rotation: 0 },
  });
  const before = await readRoot(page);
  if (before === null) throw new Error("doc not ready");
  const memberIds = before
    .filter((c) => c.kind === "frame")
    .slice(-2)
    .map((c) => c.id);
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
  if (groupId === null) throw new Error("group failed");
  await page.waitForTimeout(50);
  return { groupId, memberIds };
}

test("removing a 2-child group's child auto-dissolves the group; survivor renders at root; Cmd+Z restores", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { groupId, memberIds } = await makeGroupOf(page);
  const [survivor, removed] = memberIds;

  // Remove one of the two children → underflow → auto-dissolve.
  await page.evaluate((id) => {
    type Editor = { exec: (n: string, i: unknown) => unknown };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    ed?.exec("weave.items.remove", { itemIds: [id] });
  }, removed);
  await page.waitForTimeout(50);

  const after = await readRoot(page);
  if (after === null) throw new Error("doc not ready");
  // Group dissolved; survivor lifted to root; removed child gone.
  expect(after.find((c) => c.id === groupId)).toBeUndefined();
  expect(after.map((c) => c.id)).toContain(survivor);
  expect(after.map((c) => c.id)).not.toContain(removed);

  // One Cmd+Z restores the whole transaction: the group is back with both members.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);
  const restored = await readRoot(page);
  if (restored === null) throw new Error("doc not ready");
  const g = restored.find((c) => c.id === groupId);
  expect(g?.kind).toBe("group");
  expect([...(g?.childIds ?? [])].sort()).toEqual([...memberIds].sort());
});

test("ungroup (removeKeepingChildren) lifts both children back to the root and removes the group", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { groupId, memberIds } = await makeGroupOf(page);

  await page.evaluate((gid) => {
    type Editor = { exec: (n: string, i: unknown) => unknown };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    ed?.exec("weave.frame.removeKeepingChildren", { frameId: gid });
  }, groupId);
  await page.waitForTimeout(50);

  const after = await readRoot(page);
  if (after === null) throw new Error("doc not ready");
  expect(after.find((c) => c.id === groupId)).toBeUndefined();
  const rootIds = after.map((c) => c.id);
  expect(rootIds).toContain(memberIds[0]);
  expect(rootIds).toContain(memberIds[1]);
});
