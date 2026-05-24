// WI-021 — Figma-style marquee multi-selection.
//
// Plain drag on empty design-plane space draws a marquee box and applies
// the captured-at-start intent to vm.itemSelection:
//
//   • no modifier  → replace selection
//   • Shift held   → add (union)
//   • Cmd / Ctrl   → toggle each
//
// Alt is reserved for the rubber-band frame-add gesture and never reaches
// the marquee layer.

import { expect, test, type Page } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

/** Seed 3 slides at known positions that together cover most of the design
 *  plane, so a viewport-spanning marquee hits all of them. */
async function seedThreeSlides(page: Page): Promise<void> {
  // Top-left, top-right, bottom-center — all clearly inside the viewport
  // after the mixed-flavor camera fits the design plane on first paint.
  await addFrame(page, "slide", {
    frame: { x: 0.05, y: 0.05, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.55, y: 0.05, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.3, y: 0.55, width: 0.4, height: 0.4, rotation: 0 },
  });
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** Read vm.itemSelection as a sorted array of frame ids. Uses the
 *  Selection API's `items()` method — spreading the `multi` Set across
 *  Playwright's evaluate boundary doesn't always round-trip. */
async function selectedIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        itemSelection: { items: () => ReadonlyArray<unknown> };
      };
    };
    const arr = w.__weaveVm?.itemSelection.items() ?? [];
    return arr.map((x) => String(x)).sort();
  });
}

/** All top-level domain-frame ids in the current doc. The mixed flavor
 *  seeds four — slide / canvas-design / block-doc / media. */
async function allTopLevelFrameIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const FRAME_KINDS = new Set([
      "slide",
      "canvas-design",
      "block-doc",
      "media",
    ]);
    const w = window as unknown as {
      __weaveDoc?: {
        root: { children: ReadonlyArray<{ id: unknown; kind: string }> };
      };
    };
    const out: string[] = [];
    for (const c of w.__weaveDoc?.root.children ?? []) {
      if (FRAME_KINDS.has(c.kind)) out.push(String(c.id));
    }
    return out.sort();
  });
}

/** Set the vm itemSelection to a single id. */
async function preselect(page: Page, id: string): Promise<void> {
  await page.evaluate((x) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (v: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(x);
  }, id);
}

/** Programmatic clear of the vm itemSelection — used as the test starting
 *  state when we want "selection = empty". */
async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { clear: () => void } };
    };
    w.__weaveVm?.itemSelection.clear();
  });
}

/** Drag from one viewport point to another on the marquee host with
 *  optional modifier keys held for the duration of the gesture. */
async function marqueeDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  modifiers?: { shift?: boolean; meta?: boolean },
): Promise<void> {
  if (modifiers?.shift) await page.keyboard.down("Shift");
  if (modifiers?.meta) await page.keyboard.down("Meta");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up({ button: "left" });
  if (modifiers?.meta) await page.keyboard.up("Meta");
  if (modifiers?.shift) await page.keyboard.up("Shift");
}

async function viewport(page: Page): Promise<{ w: number; h: number }> {
  return await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
}

test("drag (no modifier) replaces selection with frames inside the box", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Marquee-A" });
  await seedThreeSlides(page);
  const all = await allTopLevelFrameIds(page);
  expect(all.length).toBeGreaterThanOrEqual(3);

  // Pre-select the first frame so we can verify the marquee REPLACES.
  await preselect(page, all[0] as string);
  expect(await selectedIds(page)).toEqual([all[0]]);

  // Marquee the whole viewport → should select every top-level frame.
  const vp = await viewport(page);
  // Stay safely inside the design plane (avoid header / breadcrumbs / panels
  // that eat into the outer edges). The plane is centered, so 6%-94%
  // generally hits empty corners of the plane while crossing every frame.
  await marqueeDrag(
    page,
    { x: Math.floor(vp.w * 0.06), y: Math.floor(vp.h * 0.18) },
    { x: Math.floor(vp.w * 0.94), y: Math.floor(vp.h * 0.84) },
  );

  expect(await selectedIds(page)).toEqual(all);
});

test("Shift+drag adds frames in the box to existing selection (union)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Marquee-B" });
  await seedThreeSlides(page);
  const all = await allTopLevelFrameIds(page);
  expect(all.length).toBeGreaterThanOrEqual(3);

  // Pre-select first; Shift+drag the whole viewport.
  await preselect(page, all[0] as string);

  const vp = await viewport(page);
  await marqueeDrag(
    page,
    { x: Math.floor(vp.w * 0.06), y: Math.floor(vp.h * 0.18) },
    { x: Math.floor(vp.w * 0.94), y: Math.floor(vp.h * 0.84) },
    { shift: true },
  );

  // Union of {first} and {all} → all.
  expect(await selectedIds(page)).toEqual(all);
});

test("Cmd+drag toggles each frame in the box", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Marquee-C" });
  await seedThreeSlides(page);
  const all = await allTopLevelFrameIds(page);
  expect(all.length).toBeGreaterThanOrEqual(3);

  // Pre-select first; Cmd+drag the whole viewport. First flips OUT, every
  // other frame flips IN.
  await preselect(page, all[0] as string);

  const vp = await viewport(page);
  await marqueeDrag(
    page,
    { x: Math.floor(vp.w * 0.06), y: Math.floor(vp.h * 0.18) },
    { x: Math.floor(vp.w * 0.94), y: Math.floor(vp.h * 0.84) },
    { meta: true },
  );

  const expected = all.filter((id) => id !== all[0]).sort();
  expect(await selectedIds(page)).toEqual(expected);
});

test("Alt+drag still opens the rubber-band frame-add popover (not marquee)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Alt-add" });
  await clearSelection(page);

  const vp = await viewport(page);
  await page.keyboard.down("Alt");
  await page.mouse.move(Math.floor(vp.w * 0.15), Math.floor(vp.h * 0.7));
  await page.mouse.down({ button: "left" });
  await page.mouse.move(Math.floor(vp.w * 0.4), Math.floor(vp.h * 0.9));
  await page.mouse.up({ button: "left" });
  await page.keyboard.up("Alt");

  // Frame-add popover (rubber-band) opens.
  await expect(page.getByTestId("rubber-band")).toBeVisible({ timeout: 3000 });
  // Selection slot was not touched by the rubber-band gesture.
  expect(await selectedIds(page)).toEqual([]);
});

test("drag covering nothing replaces with empty selection", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Marquee-D" });
  await seedThreeSlides(page);
  const all = await allTopLevelFrameIds(page);
  expect(all.length).toBeGreaterThanOrEqual(3);

  // Pre-select first.
  await preselect(page, all[0] as string);
  expect(await selectedIds(page)).toEqual([all[0]]);

  // Marquee a tiny region in the top-left corner where no frames live
  // — design plane center is in the middle, this corner is empty.
  const vp = await viewport(page);
  // Need a big-enough drag to clear the 4-design-pixel minDragSize. 60 vp
  // pixels is conservative.
  await marqueeDrag(
    page,
    { x: 4, y: 80 },
    { x: 80, y: 140 },
  );

  // Replace with empty: nothing in the marquee region → empty selection.
  expect(await selectedIds(page)).toEqual([]);
});
