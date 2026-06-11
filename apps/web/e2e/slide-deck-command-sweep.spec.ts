// WI-181 — slide-deck command verification sweep. WI-180 fixed and pinned
// the three container-scoped behaviors (Cmd+A scope, explicit add, paste
// with no selection); this spec sweeps the REMAINING selection-operating
// commands in slide-deck, where regression coverage previously ran only on
// the mixed flavor. Expected: identical behavior to mixed except the base
// editing area — every result must stay INSIDE the active page.
//
//   • Delete/Backspace removes the item; Cmd+Z restores it INTO the page.
//   • Cmd+D duplicates beside the original — clone's parent is the page.
//   • Cmd+X / Cmd+V (cut → paste, no selection) re-homes onto the page.
//   • Cmd+V with a sub-page GROUP frame selected pastes onto the page, not
//     into the group (paste arm of InsertionPolicy.addContainerFor — the
//     WI-180 e2e covered only the no-selection paste).
//   • Arrow nudge moves the item; Shift+Arrow steps 10px.
//   • Cmd+Backspace dissolves a sub-page frame — children lift to the PAGE
//     (the frame's own parent), never the design root; Cmd+Z restores.

import { expect, type Page, test } from "@playwright/test";
import {
  addFrame,
  clearAllDesigns,
  prepareDesign,
  readItemFrame,
  readParentInfo,
  setSelection,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectedIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { items: () => ReadonlyArray<unknown> } };
    };
    return (w.__weaveVm?.itemSelection.items() ?? []).map((x) => String(x)).sort();
  });
}

async function rootChildIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id)).sort();
  });
}

async function childIdsOf(page: Page, parentId: string): Promise<string[]> {
  return await page.evaluate((pid) => {
    type Node = { id: unknown; children: ReadonlyArray<Node> };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    function find(n: Node): Node | undefined {
      if (String(n.id) === pid) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    const root = w.__weaveDoc?.root;
    if (root === undefined) return [];
    const node = find(root);
    return (node?.children ?? []).map((c) => String(c.id)).sort();
  }, parentId);
}

async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __weaveVm?: { itemSelection: { clear: () => void } } };
    w.__weaveVm?.itemSelection.clear();
  });
}

/** A slide-deck design with one shape on the first slide. */
async function slideWithShape(page: Page, title: string) {
  await prepareDesign(page, { flavor: "slide-deck", title });
  const pageId = (await rootChildIds(page))[0] as string;
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const itemId = (await childIdsOf(page, pageId))[0] as string;
  return { pageId, itemId };
}

test("slide-deck Backspace deletes the item; Cmd+Z restores it into the page", async ({
  page,
}) => {
  const { pageId, itemId } = await slideWithShape(page, "Sweep-Delete");
  await setSelection(page, [itemId]);

  await page.keyboard.press("Backspace");
  await expect.poll(() => childIdsOf(page, pageId)).toEqual([]);

  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => childIdsOf(page, pageId)).toEqual([itemId]);
  const info = await readParentInfo(page, itemId);
  expect(info?.parentId).toBe(pageId);
});

test("slide-deck Cmd+D duplicates onto the page and selects the clone", async ({ page }) => {
  const { pageId, itemId } = await slideWithShape(page, "Sweep-Duplicate");
  await setSelection(page, [itemId]);

  await page.keyboard.press("ControlOrMeta+D");

  await expect
    .poll(async () => {
      const sel = await selectedIds(page);
      if (sel.length !== 1 || sel[0] === itemId) return "no";
      const info = await readParentInfo(page, sel[0] as string);
      return info?.parentId === pageId ? "ok" : `parent=${info?.parentId}`;
    })
    .toBe("ok");
  expect((await childIdsOf(page, pageId)).length).toBe(2);
});

test("slide-deck cut then paste re-homes the item onto the page", async ({ page }) => {
  const { pageId, itemId } = await slideWithShape(page, "Sweep-CutPaste");
  await setSelection(page, [itemId]);

  await page.keyboard.press("ControlOrMeta+X");
  await expect.poll(() => childIdsOf(page, pageId)).toEqual([]);

  await clearSelection(page);
  await page.keyboard.press("ControlOrMeta+V");

  await expect
    .poll(async () => {
      const sel = await selectedIds(page);
      if (sel.length !== 1) return "no";
      const info = await readParentInfo(page, sel[0] as string);
      return info?.parentId === pageId ? "ok" : `parent=${info?.parentId}`;
    })
    .toBe("ok");
});

test("slide-deck paste with a sub-page GROUP frame selected lands on the page, not in the group", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "Sweep-PasteGroup" });
  const pageId = (await rootChildIds(page))[0] as string;
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  const sourceId = (await childIdsOf(page, pageId))[0] as string;
  await addFrame(page, "frame", {
    containerId: pageId,
    frame: { x: 0.5, y: 0.5, width: 0.4, height: 0.4, rotation: 0 },
  });
  const groupId = (await childIdsOf(page, pageId)).find((id) => id !== sourceId) as string;

  await setSelection(page, [sourceId]);
  await page.keyboard.press("ControlOrMeta+C");
  await setSelection(page, [groupId]);
  await page.keyboard.press("ControlOrMeta+V");

  await expect
    .poll(async () => {
      const sel = await selectedIds(page);
      if (sel.length !== 1 || sel[0] === sourceId || sel[0] === groupId) return "no";
      const info = await readParentInfo(page, sel[0] as string);
      return info?.parentId === pageId ? "ok" : `parent=${info?.parentId}`;
    })
    .toBe("ok");
  // The group captured nothing.
  expect(await childIdsOf(page, groupId)).toEqual([]);
});

test("slide-deck arrow nudge moves the item; Shift steps 10px", async ({ page }) => {
  const { itemId } = await slideWithShape(page, "Sweep-Nudge");
  await setSelection(page, [itemId]);
  const before = await readItemFrame(page, itemId);
  if (before === null) throw new Error("item frame unreadable");

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      const f = await readItemFrame(page, itemId);
      return f !== null && f.x > before.x ? "moved" : "no";
    })
    .toBe("moved");

  const mid = await readItemFrame(page, itemId);
  if (mid === null) throw new Error("item frame unreadable");
  await page.keyboard.press("Shift+ArrowDown");
  await expect
    .poll(async () => {
      const f = await readItemFrame(page, itemId);
      return f !== null && f.y > mid.y ? "moved" : "no";
    })
    .toBe("moved");
});

test("slide-deck Cmd+Backspace dissolves a sub-page frame — children lift to the PAGE", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "Sweep-Dissolve" });
  const pageId = (await rootChildIds(page))[0] as string;
  await addFrame(page, "frame", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.6, height: 0.6, rotation: 0 },
  });
  const groupId = (await childIdsOf(page, pageId))[0] as string;
  await addFrame(page, "shape", {
    containerId: groupId,
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const childId = (await childIdsOf(page, groupId))[0] as string;

  await setSelection(page, [groupId]);
  await page.keyboard.press("ControlOrMeta+Backspace");

  // The child now lives on the PAGE (the frame's own parent — never the
  // design root, which would strand it outside the page-scoped view).
  await expect
    .poll(async () => (await readParentInfo(page, childId))?.parentId ?? "gone")
    .toBe(pageId);
  expect((await childIdsOf(page, pageId)).includes(groupId)).toBe(false);

  // One undo restores the frame with its child.
  await page.keyboard.press("ControlOrMeta+Z");
  await expect
    .poll(async () => (await readParentInfo(page, childId))?.parentId ?? "gone")
    .toBe(groupId);
  await expect.poll(async () => (await readParentInfo(page, groupId))?.parentId).toBe(pageId);
});
