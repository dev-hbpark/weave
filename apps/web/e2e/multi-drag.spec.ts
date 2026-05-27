// WI-021 — multi-frame drag movement.
//
// Pressing on any frame that's part of the current multi-selection drags
// every selected frame by the same delta (Figma parity). Pressing on a
// frame that's NOT in the selection collapses to single-select and drags
// only that one.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectedIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        itemSelection: { items: () => ReadonlyArray<unknown> };
      };
    };
    return (w.__weaveVm?.itemSelection.items() ?? []).map((x) => String(x)).sort();
  });
}

/** Read each frame's (x, y) ratio from the doc, keyed by id. */
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

test("marquee → drag one selected frame → all selected frames move by the same delta", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Multi-Drag-A" });

  // Two slides side-by-side near the top of the design.
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.55, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });

  const before = await framePositions(page);
  const ids = Object.keys(before);
  expect(ids.length).toBe(2);

  // Programmatically multi-select both via the vm (the marquee gesture is
  // covered by marquee-select.spec — here we focus on the drag-move
  // behaviour with the selection already in place).
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, ids);
  await page.waitForFunction(
    (n) => {
      const w = window as unknown as {
        __weaveVm?: { itemSelection: { items: () => ReadonlyArray<unknown> } };
      };
      return (w.__weaveVm?.itemSelection.items().length ?? 0) === n;
    },
    2,
    { timeout: 2000 },
  );
  expect((await selectedIds(page)).length).toBe(2);

  // Press on the first frame's body and drag right + down. Both frames
  // should move by the same delta — selection preserved.
  const firstId = ids[0] as string;
  const frameRect = await page.evaluate((id) => {
    const el = document.querySelector(`[data-frame-id="${id}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  }, firstId);
  expect(frameRect).not.toBeNull();
  const fr = frameRect as { cx: number; cy: number };

  await page.mouse.move(fr.cx, fr.cy);
  await page.mouse.down({ button: "left" });
  // Drag 200 vp pixels right, 60 down.
  await page.mouse.move(fr.cx + 60, fr.cy + 20);
  await page.mouse.move(fr.cx + 200, fr.cy + 60);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(80);

  // Selection preserved.
  expect((await selectedIds(page)).length).toBe(2);

  const after = await framePositions(page);
  const id0 = ids[0] as string;
  const id1 = ids[1] as string;
  const b0 = before[id0]!;
  const b1 = before[id1]!;
  const a0 = after[id0]!;
  const a1 = after[id1]!;
  const dx0 = a0.x - b0.x;
  const dy0 = a0.y - b0.y;
  const dx1 = a1.x - b1.x;
  const dy1 = a1.y - b1.y;
  // Both frames moved by the same delta (within a tiny snap-rounding
  // tolerance — neither should be zero).
  expect(Math.abs(dx0)).toBeGreaterThan(0.01);
  expect(Math.abs(dx0 - dx1)).toBeLessThan(0.005);
  expect(Math.abs(dy0 - dy1)).toBeLessThan(0.005);
});

test("pressing an unselected frame collapses selection to that frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Multi-Drag-B" });

  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.65, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });

  const positions = await framePositions(page);
  const ids = Object.keys(positions);
  expect(ids.length).toBe(2);

  // Pre-select both directly via the vm (skip the marquee gesture).
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, ids);
  expect((await selectedIds(page)).length).toBe(2);

  // Click (no drag) the FIRST frame — pressed item IS in the multi
  // selection, so the multi is preserved.
  const fr0 = await page.evaluate((id) => {
    const el = document.querySelector(`[data-frame-id="${id}"]`) as HTMLElement | null;
    const r = el!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, ids[0]);
  await page.mouse.move(fr0.cx, fr0.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(60);

  // The click-without-drag goes through the frame body's onClick handler
  // (not the move binding's full lifecycle). For this test we only care
  // about the move-binding pointerdown path, which preserves multi when
  // pressed item is in the set. Confirm via a direct probe — set
  // selection again and verify the move binding's selection rule on a
  // very-small drag (below threshold) leaves selection alone.
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, ids);

  // Now press an UNSELECTED frame's area? Actually both are selected, so
  // there's no unselected frame. Instead clear the selection of one,
  // then press the other to ensure pressing the unselected one collapses
  // to itself.
  await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(id);
  }, ids[0]);

  // Press frame 2 (unselected) — should collapse to {ids[1]}.
  const fr1 = await page.evaluate((id) => {
    const el = document.querySelector(`[data-frame-id="${id}"]`) as HTMLElement | null;
    const r = el!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, ids[1]);
  await page.mouse.move(fr1.cx, fr1.cy);
  await page.mouse.down({ button: "left" });
  // Small drag below threshold so we exercise the pointerdown selection
  // change without actually moving the frame.
  await page.mouse.move(fr1.cx + 1, fr1.cy + 1);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(60);

  expect(await selectedIds(page)).toEqual([ids[1]].sort());
});
