// WI-180 — mode-scoped container resolution. The behaviors are IDENTICAL
// across flavors except for the base editing area (the design root on
// infinite canvas, the ACTIVE PAGE on page-bounded flavors) and the role of
// sub-page frames (editing surfaces on infinite canvas, GROUPS on
// page-bounded flavors):
//
//   • Cmd/Ctrl+A with nothing selected scopes to the mode's base container —
//     in a slide deck the visible slide's first-level children are selected,
//     never the hidden sibling pages.
//   • Cmd/Ctrl+A with a non-frame leaf selected selects its SIBLINGS
//     (parent's children) on every flavor.
//   • An explicit add (tool hotkey / "+" menu) with a sub-page frame
//     selected lands on the ACTIVE PAGE in a slide deck (the frame is a
//     group), while mixed keeps adding INTO the selected frame
//     (pinned by editor-shortcuts.spec.ts).
//   • Paste with nothing selected lands on the ACTIVE PAGE in a slide deck —
//     never invisibly at the design root outside the page-scoped view.
//
// Policy source: InsertionPolicy.addContainerFor (editor-mode/types.ts),
// unit-tested in src/document/editor-mode/editor-mode.test.ts. These specs
// pin the wired consumer behavior.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, readParentInfo } from "./helpers.js";

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

async function setSingle(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as { __weaveVm?: { itemSelection: { set: (x: unknown) => void } } };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

// ── Cmd+A scopes to the active page on page-bounded flavors ────────────

test("slide-deck Cmd+A with no selection selects the active slide's children, not the pages", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "SelectAll-Slide" });
  const pageId = (await rootChildIds(page))[0] as string;
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const kids = await childIdsOf(page, pageId);
  expect(kids.length).toBe(2);
  await clearSelection(page);

  await page.keyboard.press("ControlOrMeta+A");

  // The slide's children — NOT the root's children (the pages themselves).
  await expect.poll(() => selectedIds(page)).toEqual(kids);
});

test("slide-deck Cmd+A with a leaf selected selects its siblings on the slide", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "SelectAll-Leaf" });
  const pageId = (await rootChildIds(page))[0] as string;
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const kids = await childIdsOf(page, pageId);
  await setSingle(page, kids[0] as string);

  await page.keyboard.press("ControlOrMeta+A");

  await expect.poll(() => selectedIds(page)).toEqual(kids);
});

test("mixed Cmd+A with a leaf selected selects its siblings (parent scope)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "SelectAll-Sibling" });
  await addFrame(page, "shape", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "shape", {
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const roots = await rootChildIds(page);
  expect(roots.length).toBe(2);
  await setSingle(page, roots[0] as string);

  await page.keyboard.press("ControlOrMeta+A");

  await expect.poll(() => selectedIds(page)).toEqual(roots);
});

// ── Explicit add: sub-page frames are groups on page-bounded flavors ───

test("slide-deck tool-hotkey add with a sub-page frame selected lands on the page, not the frame", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "Add-To-Page" });
  const pageId = (await rootChildIds(page))[0] as string;
  // A frame INSIDE the slide — a group in this mode, not an editing surface.
  await addFrame(page, "frame", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 },
  });
  const groupId = (await childIdsOf(page, pageId))[0] as string;
  await setSingle(page, groupId);

  await page.keyboard.press("KeyR");

  // The new item is the selection and its parent is the PAGE — the selected
  // group did NOT capture the add (mixed keeps the opposite behavior,
  // pinned in editor-shortcuts.spec.ts).
  await expect
    .poll(async () => {
      const sel = await selectedIds(page);
      if (sel.length !== 1 || sel[0] === groupId) return "no";
      const info = await readParentInfo(page, sel[0] as string);
      return info?.parentId === pageId ? "ok" : `parent=${info?.parentId}`;
    })
    .toBe("ok");
});

// ── Paste lands on the active page, never the invisible root ───────────

test("slide-deck paste with no selection lands on the active page", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "Paste-To-Page" });
  const pageId = (await rootChildIds(page))[0] as string;
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const sourceId = (await childIdsOf(page, pageId))[0] as string;
  await setSingle(page, sourceId);
  await page.keyboard.press("ControlOrMeta+C");
  await clearSelection(page);

  await page.keyboard.press("ControlOrMeta+V");

  // The pasted clone lands selected, INSIDE the page (root would render
  // nowhere in the page-scoped view).
  await expect
    .poll(async () => {
      const sel = await selectedIds(page);
      if (sel.length !== 1 || sel[0] === sourceId) return "no";
      const info = await readParentInfo(page, sel[0] as string);
      return info?.parentId === pageId ? "ok" : `parent=${info?.parentId}`;
    })
    .toBe("ok");
});
