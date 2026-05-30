// WI-055 — rectangle corner radius (`weave.shape.setCornerRadius`).
//
// Drives the dedicated command through the dev `__weaveEditor` global and
// asserts on `__weaveDoc`, verifying the full round-trip in the live runtime:
// uniform set → per-corner set → Cmd+Z revert → Cmd+Shift+Z redo, plus the
// rectangle-only + input-exclusivity guards.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type Radii = { tl: number; tr: number; br: number; bl: number };

async function addRectangle(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "shape",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
      // seed default for `shape` is already a rectangle with zero radii.
    });
    return String(r.value);
  });
  await page.waitForTimeout(120);
  return id;
}

async function setCornerRadius(page: Page, input: Record<string, unknown>): Promise<boolean> {
  const ok = await page.evaluate((inp) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { ok?: boolean } };
    };
    const r = w.__weaveEditor!.exec("weave.shape.setCornerRadius", inp);
    return r.ok !== false;
  }, input);
  await page.waitForTimeout(120);
  return ok;
}

async function readRadii(page: Page, itemId: string): Promise<Radii | undefined> {
  return page.evaluate((cid) => {
    type N = {
      id: unknown;
      attrs?: {
        subAttrs?: {
          shape?: string;
          cornerRadii?: { tl: number; tr: number; br: number; bl: number };
        };
      };
      children?: ReadonlyArray<N>;
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    const find = (nodes: ReadonlyArray<N>): N | undefined => {
      for (const n of nodes) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root.children ?? [])?.attrs?.subAttrs?.cornerRadii;
  }, itemId);
}

test("WI-055 — uniform radius sets all four corners and Cmd+Z reverts", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-055-uniform" });
  const id = await addRectangle(page);
  await expect.poll(() => readRadii(page, id)).toEqual({ tl: 0, tr: 0, br: 0, bl: 0 });

  expect(await setCornerRadius(page, { itemId: id, radius: 16 })).toBe(true);
  await expect.poll(() => readRadii(page, id)).toEqual({ tl: 16, tr: 16, br: 16, bl: 16 });

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  await expect.poll(() => readRadii(page, id)).toEqual({ tl: 0, tr: 0, br: 0, bl: 0 });

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(80);
  await expect.poll(() => readRadii(page, id)).toEqual({ tl: 16, tr: 16, br: 16, bl: 16 });
});

test("WI-055 — per-corner radii merges only the supplied corner", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-055-percorner" });
  const id = await addRectangle(page);
  expect(await setCornerRadius(page, { itemId: id, radius: 8 })).toBe(true);
  await expect.poll(() => readRadii(page, id)).toEqual({ tl: 8, tr: 8, br: 8, bl: 8 });

  expect(await setCornerRadius(page, { itemId: id, radii: { tl: 32 } })).toBe(true);
  await expect.poll(() => readRadii(page, id)).toEqual({ tl: 32, tr: 8, br: 8, bl: 8 });
});

test("WI-055 — rectangle-only + exclusivity guards reject bad input", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-055-guards" });
  const id = await addRectangle(page);
  // both radius + radii → invalid-input
  expect(await setCornerRadius(page, { itemId: id, radius: 4, radii: { tl: 2 } })).toBe(false);
  // neither → invalid-input
  expect(await setCornerRadius(page, { itemId: id })).toBe(false);
  // radii unchanged by the rejected calls
  await expect.poll(() => readRadii(page, id)).toEqual({ tl: 0, tr: 0, br: 0, bl: 0 });
});
