// Arrange (grid + flex) preserves the rubber-band (user spec 2026-05-29):
//   • the arranged union EQUALS the selection band — items neither grow past it
//     nor collapse into a strip inside it (the band is divided into equal cells
//     and each item's outer bounds FILL its cell),
//   • a rotated item's outer bounds (AABB) equal the unrotated item's (equal
//     halves), and pressing arrange repeatedly is IDEMPOTENT (no drift).
// Driven through the real toolbar → multiLayoutArranger → resizeMulti wire.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type Frame = { x: number; y: number; width: number; height: number; rotation?: number };

async function rootChildIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const doc = (
      window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<{ id: string | number }> } } }
    ).__weaveDoc;
    return doc === undefined ? [] : doc.root.children.map((c) => String(c.id));
  });
}

async function readFrame(page: import("@playwright/test").Page, id: string): Promise<Frame | null> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: string | number;
      readonly attrs: Record<string, unknown>;
      readonly children: ReadonlyArray<Node>;
    }
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    if (doc === undefined) return null;
    function find(n: Node): Node | null {
      if (String(n.id) === targetId) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    }
    const node = find(doc.root);
    return node === null ? null : ((node.attrs as { frame?: Frame }).frame ?? null);
  }, id);
}

// Pixel-space AABB: rotation is isotropic in design pixels, not in the
// non-square 0..1 ratio space, so the on-screen outer bound must be measured
// after scaling by the design size (16:9 preset → 1920×1080).
const DW = 1920;
const DH = 1080;
function aabb(f: Frame) {
  const r = f.rotation ?? 0;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const wp = f.width * DW;
  const hp = f.height * DH;
  return { w: wp * c + hp * s, h: wp * s + hp * c };
}

/** Pixel-space union of the items' outer bounds (AABB) — the "rubber-band". */
function bandOf(frames: Frame[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const f of frames) {
    const a = aabb(f);
    const cx = (f.x + f.width / 2) * DW;
    const cy = (f.y + f.height / 2) * DH;
    minX = Math.min(minX, cx - a.w / 2);
    minY = Math.min(minY, cy - a.h / 2);
    maxX = Math.max(maxX, cx + a.w / 2);
    maxY = Math.max(maxY, cy + a.h / 2);
  }
  return { w: maxX - minX, h: maxY - minY };
}

async function setRotation(page: import("@playwright/test").Page, id: string, rotation: number) {
  await page.evaluate(
    ({ id, rotation }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      (window as unknown as { __weaveEditor?: Editor }).__weaveEditor?.exec("weave.item.update", {
        itemId: id,
        patch: (it: { attrs: { frame?: Frame } }) => ({
          ...it,
          attrs: { ...it.attrs, frame: { ...(it.attrs.frame as Frame), rotation } },
        }),
      });
    },
    { id, rotation },
  );
}

async function selectBoth(page: import("@playwright/test").Page, ids: string[]) {
  await page.evaluate((targets) => {
    type Sel = { clear: () => void; add: (id: string) => void; setMany?: (ids: string[]) => void };
    const sel = (window as unknown as { __weaveVm?: { itemSelection: Sel } }).__weaveVm?.itemSelection;
    if (sel === undefined) return;
    sel.clear();
    if (typeof sel.setMany === "function") sel.setMany(targets);
    else for (const id of targets) sel.add(id);
  }, ids);
}

test("grid arrange of a rotated + unrotated pair preserves the band, equal-halved, idempotent", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  const before = await rootChildIds(page);
  await addFrame(page, "slide", { frame: { x: 0.25, y: 0.4, width: 0.18, height: 0.18, rotation: 0 } });
  const flat = (await rootChildIds(page)).find((x) => !before.includes(x))!;
  const afterA = await rootChildIds(page);
  await addFrame(page, "slide", { frame: { x: 0.6, y: 0.4, width: 0.18, height: 0.18, rotation: 0 } });
  const tilt = (await rootChildIds(page)).find((x) => !afterA.includes(x))!;
  // 30° (not 45°): a 45° item's AABB is always square and cannot fill a
  // non-square cell, so it would fall back to an inscribed square. 30° fills.
  await setRotation(page, tilt, Math.PI / 6);

  await selectBoth(page, [flat, tilt]);
  await page.waitForTimeout(60);

  // The rubber-band BEFORE arrange — the result must fill exactly this.
  const band0 = bandOf([(await readFrame(page, flat))!, (await readFrame(page, tilt))!]);

  // The toolbar exposes "Arrange as Grid" (그리드로 정렬) as a command button.
  const gridBtn = page.getByRole("button", { name: /Arrange as Grid|그리드로 정렬/ });
  await expect(gridBtn).toBeVisible();

  await gridBtn.click();
  await page.waitForTimeout(120);
  const flat1 = (await readFrame(page, flat))!;
  const tilt1 = (await readFrame(page, tilt))!;

  // Equal halves: the rotated item's AABB equals the unrotated item's box.
  expect(tilt1.rotation ?? 0).toBeCloseTo(Math.PI / 6, 3);
  const fa = aabb(flat1);
  const ta = aabb(tilt1);
  expect(ta.w).toBeCloseTo(fa.w, 1);
  expect(ta.h).toBeCloseTo(fa.h, 1);

  // PRESERVE the rubber-band: the arranged union equals the band it started in
  // — not bigger (the "grows on every press" bug), not smaller (collapse).
  const band1 = bandOf([flat1, tilt1]);
  expect(Math.abs(band1.w - band0.w)).toBeLessThan(2);
  expect(Math.abs(band1.h - band0.h)).toBeLessThan(2);

  // Idempotent: press grid two more times — sizes must not drift.
  await gridBtn.click();
  await page.waitForTimeout(100);
  await gridBtn.click();
  await page.waitForTimeout(120);
  const flat3 = (await readFrame(page, flat))!;
  const tilt3 = (await readFrame(page, tilt))!;
  expect(flat3.width).toBeCloseTo(flat1.width, 4);
  expect(flat3.height).toBeCloseTo(flat1.height, 4);
  expect(tilt3.width).toBeCloseTo(tilt1.width, 4);
  expect(tilt3.height).toBeCloseTo(tilt1.height, 4);
});

test("flex arrange of many items fills the band — no collapse to a center strip", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  // Five small items scattered across a wide band. The bug (image #5): flex
  // shrank them into a thin row in the vertical center. They must fill the
  // band height and span its width.
  const ids: string[] = [];
  const spots = [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.5 },
    { x: 0.5, y: 0.15 },
    { x: 0.68, y: 0.6 },
    { x: 0.82, y: 0.3 },
  ];
  for (const s of spots) {
    const before = await rootChildIds(page);
    await addFrame(page, "slide", { frame: { x: s.x, y: s.y, width: 0.08, height: 0.08, rotation: 0 } });
    await page.waitForTimeout(40);
    ids.push((await rootChildIds(page)).find((x) => !before.includes(x))!);
  }

  await selectBoth(page, ids);
  await page.waitForTimeout(60);
  const band0 = bandOf(await Promise.all(ids.map(async (id) => (await readFrame(page, id))!)));

  const flexBtn = page.getByRole("button", { name: /Arrange as Flex|플렉스로 정렬/ });
  await expect(flexBtn).toBeVisible();
  await flexBtn.click();
  await page.waitForTimeout(120);

  const out = await Promise.all(ids.map(async (id) => (await readFrame(page, id))!));
  const band1 = bandOf(out);
  // Band preserved in BOTH dimensions — height must not collapse.
  expect(Math.abs(band1.w - band0.w)).toBeLessThan(3);
  expect(Math.abs(band1.h - band0.h)).toBeLessThan(3);
  // Each item fills the full band height (the anti-collapse guarantee).
  for (const f of out) {
    expect(Math.abs(f.height * DH - band0.h)).toBeLessThan(3);
  }
});
