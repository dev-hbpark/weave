// WI-021 — clicking & union chrome in a multi-selection.
//
// Figma parity:
//   • Plain click on a frame already in the multi-selection → no-op
//     (preserves the selection so the user can start dragging).
//   • Shift / Cmd / Ctrl + click on a selected frame → toggle out.
//   • Shift / Cmd / Ctrl + click on an unselected frame → toggle in.
//
// Visual:
//   • Multi (2+) → a single union outline chrome is rendered around
//     every selected frame.
//   • Single → no chrome (the existing per-frame SelectionLayer covers it).

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

async function setupTwoSlides(page: Page): Promise<[string, string]> {
  await prepareDesign(page, { flavor: "mixed", title: "Click-A" });
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.55, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
  expect(ids.length).toBe(2);
  return [ids[0] as string, ids[1] as string];
}

async function centerOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  return await page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

async function multiPreselect(page: Page, ids: ReadonlyArray<string>): Promise<void> {
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
    ids.length,
    { timeout: 2000 },
  );
}

test("plain click on a multi-selected frame preserves the selection", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [a, b] = await setupTwoSlides(page);
  await multiPreselect(page, [a, b]);
  expect(await selectedIds(page)).toEqual([a, b].sort());

  // Plain click (no drag) on the first frame. With the old behaviour this
  // would collapse to single; with the multi-aware onClick it should
  // preserve.
  const c = await centerOf(page, a);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(40);

  expect(await selectedIds(page)).toEqual([a, b].sort());
});

test("Shift+click on an already-selected frame removes it from the multi", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [a, b] = await setupTwoSlides(page);
  await multiPreselect(page, [a, b]);

  const c = await centerOf(page, a);
  await page.keyboard.down("Shift");
  await page.mouse.click(c.x, c.y);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(40);

  expect(await selectedIds(page)).toEqual([b]);
});

test("Shift+click on an unselected frame adds it to the selection", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [a, b] = await setupTwoSlides(page);
  await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(id);
  }, a);

  const cb = await centerOf(page, b);
  await page.keyboard.down("Shift");
  await page.mouse.click(cb.x, cb.y);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(40);

  expect(await selectedIds(page)).toEqual([a, b].sort());
});

test("multi-selection renders a union chrome; single does not", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [a, b] = await setupTwoSlides(page);

  // Single — no union chrome.
  await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(id);
  }, a);
  await page.waitForTimeout(40);
  await expect(page.getByTestId("multi-selection-chrome")).toHaveCount(0);

  // Multi — chrome appears with the correct count.
  await multiPreselect(page, [a, b]);
  await expect(page.getByTestId("multi-selection-chrome")).toBeVisible();
  await expect(page.getByTestId("multi-selection-chrome")).toHaveAttribute("data-count", "2");
  await expect(page.getByTestId("multi-selection-count")).toHaveText("2 selected");
});
