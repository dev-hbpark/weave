// Arrange-into-grid with a rotated item (user spec 2026-05-29):
//   • the rotated item's outer bounds (AABB) and the unrotated item's box
//     must each occupy an EQUAL half (same square),
//   • pressing the arrange button repeatedly must be IDEMPOTENT (no
//     progressive shrink/grow).
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

test("repeated grid arrange of a rotated + unrotated pair is idempotent and equal-halved", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  const before = await rootChildIds(page);
  await addFrame(page, "slide", { frame: { x: 0.25, y: 0.4, width: 0.18, height: 0.18, rotation: 0 } });
  const flat = (await rootChildIds(page)).find((x) => !before.includes(x))!;
  const afterA = await rootChildIds(page);
  await addFrame(page, "slide", { frame: { x: 0.6, y: 0.4, width: 0.18, height: 0.18, rotation: 0 } });
  const tilt = (await rootChildIds(page)).find((x) => !afterA.includes(x))!;
  await setRotation(page, tilt, Math.PI / 4);

  await selectBoth(page, [flat, tilt]);
  await page.waitForTimeout(60);

  // The toolbar exposes "Arrange as Grid" (그리드로 정렬) as a command button.
  const gridBtn = page.getByRole("button", { name: /Arrange as Grid|그리드로 정렬/ });
  await expect(gridBtn).toBeVisible();

  await gridBtn.click();
  await page.waitForTimeout(120);
  const flat1 = (await readFrame(page, flat))!;
  const tilt1 = (await readFrame(page, tilt))!;

  // Equal halves: the rotated item's AABB equals the unrotated item's box.
  expect(tilt1.rotation ?? 0).toBeCloseTo(Math.PI / 4, 3);
  const fa = aabb(flat1);
  const ta = aabb(tilt1);
  expect(ta.w).toBeCloseTo(fa.w, 3);
  expect(ta.h).toBeCloseTo(fa.h, 3);

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
