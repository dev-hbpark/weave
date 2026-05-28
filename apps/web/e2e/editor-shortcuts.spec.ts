// Standard editor shortcuts + auto-select on add/paste.
//
//   • A new item (tool hotkey / + / drag / paste) lands selected.
//   • Cmd/Ctrl+A — context-aware Select All: no frame selected ⇒ the
//     design's first-level children; a frame selected ⇒ that frame's
//     first-level children.
//   • Delete / Backspace — remove the selection.
//   • Escape — clear the selection.
//
// Cmd+A / Delete / Backspace / Escape are handled by a dedicated window
// listener (NOT the agocraft hotkey registry) that bails when a text
// surface owns focus, so native text Select-All / deletion stay intact —
// the title-input + Lexical specs that rely on native Cmd+A still pass.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, readItemFrame } from "./helpers.js";

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

async function cameraScale(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const w = window as unknown as { __weaveVm?: { camera: { scale: { get: () => number } } } };
    return w.__weaveVm?.camera.scale.get() ?? -1;
  });
}

// ── Auto-select on add ────────────────────────────────────────────────

test("R tool hotkey auto-selects the newly added item", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-Select" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 },
  });
  const parentId = (await rootChildIds(page))[0] as string;
  await setSingle(page, parentId);

  await page.keyboard.press("KeyR");

  // The new child becomes the selection (not the parent it was added to).
  await expect
    .poll(async () => {
      const sel = await selectedIds(page);
      const kids = await childIdsOf(page, parentId);
      return sel.length === 1 && kids.includes(sel[0] as string) ? "ok" : "no";
    })
    .toBe("ok");
});

// ── Cmd+A context-aware select all ────────────────────────────────────

test("Cmd+A with no selection selects the design's first-level children", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "SelectAll-Root" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await clearSelection(page);

  const roots = await rootChildIds(page);
  expect(roots.length).toBe(2);

  await page.keyboard.press("ControlOrMeta+A");

  await expect.poll(() => selectedIds(page)).toEqual(roots);
});

test("Cmd+A with a frame selected selects that frame's first-level children", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "SelectAll-Frame" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.7, height: 0.7, rotation: 0 },
  });
  const parentId = (await rootChildIds(page))[0] as string;
  // Two children inside the parent frame.
  await addFrame(page, "shape", {
    containerId: parentId,
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "shape", {
    containerId: parentId,
    frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const kids = await childIdsOf(page, parentId);
  expect(kids.length).toBe(2);

  await setSingle(page, parentId);
  await page.keyboard.press("ControlOrMeta+A");

  await expect.poll(() => selectedIds(page)).toEqual(kids);
});

// ── Delete / Backspace ────────────────────────────────────────────────

for (const key of ["Delete", "Backspace"] as const) {
  test(`${key} removes the selected item and clears the selection`, async ({ page }) => {
    await prepareDesign(page, { flavor: "mixed", title: `Del-${key}` });
    await addFrame(page, "frame", {
      frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
    });
    await addFrame(page, "frame", {
      frame: { x: 0.6, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
    });
    const roots = await rootChildIds(page);
    expect(roots.length).toBe(2);
    const victim = roots[0] as string;
    await setSingle(page, victim);

    await page.keyboard.press(key);

    await expect.poll(() => rootChildIds(page)).toEqual(roots.filter((id) => id !== victim));
    expect(await selectedIds(page)).toEqual([]);
  });
}

// ── Escape ────────────────────────────────────────────────────────────

test("Escape clears the selection without deleting", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Esc-Clear" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const roots = await rootChildIds(page);
  expect(roots.length).toBe(1);
  await setSingle(page, roots[0] as string);
  expect((await selectedIds(page)).length).toBe(1);

  await page.keyboard.press("Escape");

  await expect.poll(() => selectedIds(page)).toEqual([]);
  // The frame is still there — Escape only deselects.
  expect(await rootChildIds(page)).toEqual(roots);
});

// ── Paste auto-select ─────────────────────────────────────────────────

test("Cmd+V pastes and selects the pasted item", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Paste-Select" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, rotation: 0 },
  });
  const original = (await rootChildIds(page))[0] as string;
  await setSingle(page, original);

  await page.keyboard.press("ControlOrMeta+C");
  await page.keyboard.press("ControlOrMeta+V");

  await expect.poll(async () => (await rootChildIds(page)).length).toBe(2);
  const sel = await selectedIds(page);
  expect(sel.length).toBe(1);
  expect(sel[0]).not.toBe(original);
});

test("Cmd+C/Cmd+V copies and pastes ALL items in a multi-selection", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Multi-Copy" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  const roots = await rootChildIds(page);
  expect(roots.length).toBe(2);

  // Multi-select both items, then copy + paste.
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, roots);
  expect((await selectedIds(page)).length).toBe(2);

  await page.keyboard.press("ControlOrMeta+C");
  await page.keyboard.press("ControlOrMeta+V");

  // Both items were pasted → 4 total (not 3, which was the single-copy bug).
  await expect.poll(async () => (await rootChildIds(page)).length).toBe(4);
  // Both pasted items are selected, and neither is an original.
  const sel = await selectedIds(page);
  expect(sel.length).toBe(2);
  for (const id of sel) expect(roots).not.toContain(id);
});

// ── Cmd+D duplicate ───────────────────────────────────────────────────

test("Cmd+D duplicates the selection and selects the copy", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Dup-Select" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, rotation: 0 },
  });
  const original = (await rootChildIds(page))[0] as string;
  await setSingle(page, original);

  await page.keyboard.press("ControlOrMeta+D");

  await expect.poll(async () => (await rootChildIds(page)).length).toBe(2);
  const sel = await selectedIds(page);
  expect(sel.length).toBe(1);
  expect(sel[0]).not.toBe(original);
  // The copy is offset from the source (so it doesn't sit exactly on top).
  const dup = await readItemFrame(page, sel[0] as string);
  const src = await readItemFrame(page, original);
  expect(dup).not.toBeNull();
  expect(src).not.toBeNull();
  expect(Math.abs((dup as { x: number }).x - (src as { x: number }).x)).toBeGreaterThan(0.001);
});

// ── Arrow-key nudge ───────────────────────────────────────────────────

test("Shift+Arrow nudges the selected item's position", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Nudge" });
  await addFrame(page, "frame", {
    frame: { x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0 },
  });
  const id = (await rootChildIds(page))[0] as string;
  await setSingle(page, id);
  const before = await readItemFrame(page, id);
  expect(before).not.toBeNull();

  await page.keyboard.press("Shift+ArrowRight");
  await expect
    .poll(async () => {
      const f = await readItemFrame(page, id);
      return f !== null && f.x > (before as { x: number }).x ? "moved" : "no";
    })
    .toBe("moved");

  // Vertical nudge too.
  const mid = await readItemFrame(page, id);
  await page.keyboard.press("Shift+ArrowDown");
  await expect
    .poll(async () => {
      const f = await readItemFrame(page, id);
      return f !== null && f.y > (mid as { y: number }).y ? "moved" : "no";
    })
    .toBe("moved");
});

// ── Zoom shortcuts ────────────────────────────────────────────────────

test("Cmd+= zooms in and Cmd+0 resets to the base fit", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Zoom" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, rotation: 0 },
  });
  expect(await cameraScale(page)).toBeCloseTo(1, 5);

  await page.keyboard.press("ControlOrMeta+=");
  await expect.poll(() => cameraScale(page)).toBeGreaterThan(1.01);

  await page.keyboard.press("ControlOrMeta+0");
  await expect.poll(() => cameraScale(page)).toBeCloseTo(1, 5);
});

// ── Single-undo for multi-item duplicate / delete ─────────────────────

async function selectMany(page: Page, ids: ReadonlyArray<string>): Promise<void> {
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, ids);
}

test("Cmd+D on a multi-selection is a SINGLE undo step", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Multi-Dup-Undo" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  const roots = await rootChildIds(page);
  expect(roots.length).toBe(2);
  await selectMany(page, roots);
  expect((await selectedIds(page)).length).toBe(2);

  await page.keyboard.press("ControlOrMeta+D");
  await expect.poll(async () => (await rootChildIds(page)).length).toBe(4);

  // ONE undo removes BOTH copies.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await rootChildIds(page)).length).toBe(2);
});

test("Delete on a multi-selection is a SINGLE undo step", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Multi-Del-Undo" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.6, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  const roots = await rootChildIds(page);
  expect(roots.length).toBe(2);
  await selectMany(page, roots);
  expect((await selectedIds(page)).length).toBe(2);

  await page.keyboard.press("Delete");
  await expect.poll(async () => (await rootChildIds(page)).length).toBe(0);

  // ONE undo restores BOTH deleted items.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await rootChildIds(page)).length).toBe(2);
});
