// Multi-selection chrome reveals per item ON HOVER (chart-bar parity).
//
// User spec: when 2+ items are selected, each item's own SelectionLayer
// chrome (outline "rubber band" + resize/rotate handles) must stay HIDDEN
// and surface only for the item the pointer is hovering — exactly the way a
// chart's per-bar width handles reveal on bar hover. The host-level dashed
// bounding box (multi-selection-overlay) still owns the group indicator.
//
// Single selection is unchanged: its chrome is always on, no hover needed.

import { expect, type Page, test } from "@playwright/test";
import { nn } from "../src/lib/nn.js";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** Set the multi-selection through the vm's `setMany` SSOT and wait for it to
 *  land (same handshake the WI-021 multi specs use). */
async function selectMany(page: Page, ids: ReadonlyArray<string>): Promise<void> {
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

async function setupTwoFrames(page: Page): Promise<[string, string]> {
  await prepareDesign(page, { flavor: "mixed", title: "hover-chrome" });
  await addFrame(page, "slide", {
    frame: { x: 0.08, y: 0.1, width: 0.28, height: 0.28, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.6, y: 0.1, width: 0.28, height: 0.28, rotation: 0 },
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

async function setupTwoShapes(page: Page): Promise<[string, string]> {
  await prepareDesign(page, { flavor: "mixed", title: "hover-chrome-shapes" });
  await addFrame(page, "shape", {
    frame: { x: 0.08, y: 0.1, width: 0.28, height: 0.28, rotation: 0 },
  });
  await addFrame(page, "shape", {
    frame: { x: 0.6, y: 0.1, width: 0.28, height: 0.28, rotation: 0 },
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

async function rectOf(page: Page, id: string): Promise<{ x: number; y: number; w: number }> {
  return page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) return { x: 0, y: 0, w: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  }, id);
}

/** A point inside the design plane but clear of both frames (lower band). */
async function backgroundPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-design-plane='true']") as HTMLElement | null;
    if (el === null) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.85 };
  });
}

test("multi-selection: per-item chrome reveals only for the hovered item", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [a, b] = await setupTwoFrames(page);
  const layers = page.locator("[data-selection-layer]");

  // Multi-select both, pointer parked on empty canvas → no per-item chrome,
  // only the host group overlay.
  await selectMany(page, [a, b]);
  const bg = await backgroundPoint(page);
  await page.mouse.move(bg.x, bg.y);
  await page.waitForTimeout(80);
  await expect(page.getByTestId("multi-selection-overlay")).toBeVisible();
  await expect(layers).toHaveCount(0);

  // Hover frame A → exactly one chrome, sitting over A.
  const ca = await rectOf(page, a);
  await page.mouse.move(ca.x, ca.y);
  await expect(layers).toHaveCount(1);
  const layerBox = await layers.first().boundingBox();
  expect(layerBox).not.toBeNull();
  expect(Math.abs(nn(layerBox).x + nn(layerBox).width / 2 - ca.x)).toBeLessThan(ca.w);

  // Move hover to frame B → still exactly one, now over B.
  const cb = await rectOf(page, b);
  await page.mouse.move(cb.x, cb.y);
  await expect(layers).toHaveCount(1);
  const layerBoxB = await layers.first().boundingBox();
  expect(layerBoxB).not.toBeNull();
  expect(Math.abs(nn(layerBoxB).x + nn(layerBoxB).width / 2 - cb.x)).toBeLessThan(cb.w);

  // Back to empty canvas → chrome hides again.
  await page.mouse.move(bg.x, bg.y);
  await expect(layers).toHaveCount(0);
});

test("multi-selection of SHAPE items: hover switches chrome between shapes (regression)", async ({
  page,
}) => {
  // A shape item reports hoveredKind "shape" while its id is the item id; an
  // early bridge skipped "shape" so only the first selected shape ever lit up.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [a, b] = await setupTwoShapes(page);
  const layers = page.locator("[data-selection-layer]");

  await selectMany(page, [a, b]);

  // Hover shape A → exactly one chrome, over A.
  const ca = await rectOf(page, a);
  await page.mouse.move(ca.x, ca.y);
  await expect(layers).toHaveCount(1);
  const boxA = await layers.first().boundingBox();
  expect(boxA).not.toBeNull();
  expect(Math.abs(nn(boxA).x + nn(boxA).width / 2 - ca.x)).toBeLessThan(ca.w);

  // Hover shape B → chrome SWITCHES to B (the bug: it stayed on A).
  const cb = await rectOf(page, b);
  await page.mouse.move(cb.x, cb.y);
  await expect(layers).toHaveCount(1);
  const boxB = await layers.first().boundingBox();
  expect(boxB).not.toBeNull();
  expect(Math.abs(nn(boxB).x + nn(boxB).width / 2 - cb.x)).toBeLessThan(cb.w);
});

test("single selection: chrome stays on without hover (unchanged)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [a] = await setupTwoFrames(page);
  const layers = page.locator("[data-selection-layer]");

  await selectMany(page, [a]);
  const bg = await backgroundPoint(page);
  await page.mouse.move(bg.x, bg.y);
  await page.waitForTimeout(80);
  // No group overlay for a single selection; the per-item chrome is always on.
  await expect(page.getByTestId("multi-selection-overlay")).toHaveCount(0);
  await expect(layers).toHaveCount(1);
});
