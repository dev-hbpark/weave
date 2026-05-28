// Double-clicking empty design-plane space fits the camera to the union
// bounds of every top-level item, so the whole design comes into view at
// once. Frames confined to a sub-region grow when fitted (the fit is tighter
// than the initial whole-plane fit).

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function frameIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    return (w.__weaveDoc?.root.children ?? [])
      .filter((c) => c.kind === "frame")
      .map((c) => String(c.id));
  });
}

async function frameRect(
  page: Page,
  id: string,
): Promise<{ width: number; left: number; top: number; right: number; bottom: number }> {
  return page.evaluate((fid) => {
    const el = document.querySelector(`[data-testid="frame-stage"] [data-frame-id="${fid}"]`);
    if (el === null) return { width: 0, left: 0, top: 0, right: 0, bottom: 0 };
    const r = el.getBoundingClientRect();
    return { width: r.width, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, id);
}

test("double-click empty canvas fits the camera to all items", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Fit all" });
  // Two frames confined to the TOP-LEFT so fitting their union zooms in
  // tighter than the initial whole-plane fit (the frames should grow), and
  // the CENTER stays empty canvas to double-click.
  await addFrame(page, "slide", {
    frame: { x: 0.05, y: 0.05, width: 0.14, height: 0.14, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.22, y: 0.05, width: 0.14, height: 0.14, rotation: 0 },
  });
  const ids = await frameIds(page);
  expect(ids.length).toBe(2);

  const before = (await frameRect(page, ids[0] as string)).width;
  expect(before).toBeGreaterThan(0);

  // Double-click the empty center (clear of the top-left frames AND the
  // bottom thumbnail panel, which is portal'd over the lower viewport).
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.mouse.dblclick(Math.floor(vp.w * 0.55), Math.floor(vp.h * 0.5));

  // Fit-to-items zooms tighter than the whole-plane fit → frame grows.
  await expect
    .poll(() => frameRect(page, ids[0] as string).then((r) => r.width), { timeout: 4000 })
    .toBeGreaterThan(before * 1.3);

  // Every frame is within the viewport after the fit.
  const w = vp.w;
  const h = vp.h;
  for (const id of ids) {
    const r = await frameRect(page, id);
    expect(r.left).toBeGreaterThanOrEqual(-2);
    expect(r.top).toBeGreaterThanOrEqual(-2);
    expect(r.right).toBeLessThanOrEqual(w + 2);
    expect(r.bottom).toBeLessThanOrEqual(h + 2);
  }
});
