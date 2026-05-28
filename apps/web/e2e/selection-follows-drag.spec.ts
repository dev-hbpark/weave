// Regression — dragging an UNSELECTED frame (beyond the move threshold)
// switches the selection to the dragged frame (Figma parity).
//
// The bug: FrameMoveBinding runs with `disableSelectionSet: true` so plain
// clicks keep selectFromHit's parent-first model. But after a real drag
// the binding's onPointerUp swallows the trailing `click`, so the
// onClick → selectFromHit path never runs either. With nothing
// reconciling the selection, dragging an unselected frame moved it while
// leaving the *previous* selection in place. commitFrame now switches the
// selection to the moved frame on the first commit of each gesture.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

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

async function framePositions(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return await page.evaluate(() => {
    type Ch = { id: unknown; attrs: { frame?: { x: number; y: number } } };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const out: Record<string, { x: number; y: number }> = {};
    for (const c of w.__weaveDoc?.root.children ?? []) {
      const f = c.attrs.frame;
      if (f !== undefined) out[String(c.id)] = { x: f.x, y: f.y };
    }
    return out;
  });
}

async function frameCenter(page: Page, id: string): Promise<{ cx: number; cy: number }> {
  const fr = await page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, id);
  expect(fr).not.toBeNull();
  return fr as { cx: number; cy: number };
}

test("dragging an unselected frame switches the selection to it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Sel-Follows-Drag" });

  // Two slides side-by-side near the top of the design.
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.6, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });

  const before = await framePositions(page);
  const ids = Object.keys(before);
  expect(ids.length).toBe(2);
  const [a, b] = ids as [string, string];

  // Select frame A.
  await setSelection(page, [a]);
  expect(await selectedIds(page)).toEqual([a]);

  // Press the body of frame B and drag it well beyond the 3px threshold.
  const c = await frameCenter(page, b);
  await page.mouse.move(c.cx, c.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(c.cx + 40, c.cy + 20);
  await page.mouse.move(c.cx + 140, c.cy + 50);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(80);

  // Selection followed the drag: now exactly {B}.
  expect(await selectedIds(page)).toEqual([b]);

  // B actually moved; A stayed put.
  const after = await framePositions(page);
  expect(Math.abs(after[b]!.x - before[b]!.x)).toBeGreaterThan(0.01);
  expect(Math.abs(after[a]!.x - before[a]!.x)).toBeLessThan(0.005);
  expect(Math.abs(after[a]!.y - before[a]!.y)).toBeLessThan(0.005);
});

test("dragging a frame that is part of a multi-selection preserves the set", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Sel-Follows-Drag-Multi" });

  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.6, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });

  const before = await framePositions(page);
  const ids = Object.keys(before);
  expect(ids.length).toBe(2);
  const [a, b] = ids as [string, string];

  // Multi-select both, then drag one of them. The dragged frame is
  // already in the selection, so the set must NOT collapse.
  await page.evaluate(
    (arr) => {
      const w = window as unknown as {
        __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
      };
      w.__weaveVm?.itemSelection.setMany(arr);
    },
    [a, b],
  );
  expect((await selectedIds(page)).length).toBe(2);

  const c = await frameCenter(page, a);
  await page.mouse.move(c.cx, c.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(c.cx + 40, c.cy + 20);
  await page.mouse.move(c.cx + 140, c.cy + 50);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(80);

  expect((await selectedIds(page)).length).toBe(2);
});
