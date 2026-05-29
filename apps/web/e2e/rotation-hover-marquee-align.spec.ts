// Rotated-item handling across three surfaces (user spec 2026-05-29):
//   • hover effect must follow the rotation (overlay rotates with item),
//   • marquee (selection rubber-band) hit-tests by the rotated OUTER
//     bounds, not the unrotated frame slot,
//   • multi-align places rotated items by their outer (AABB) bounds.
//
// Doc values are read from the model, not computed CSS, except the hover
// test which asserts the overlay element actually carries a rotate
// transform.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

// The shared `setSelection` helper probes for a non-existent `addMany`
// and collapses multi-selection to the last id — so we drive the
// Selection API (`clear` + `add`, which accumulate) directly here.
async function selectItems(page: import("@playwright/test").Page, ids: string[]): Promise<void> {
  await page.evaluate((targets) => {
    type Sel = { clear: () => void; add: (id: string) => void; setMany?: (ids: string[]) => void };
    const sel = (window as unknown as { __weaveVm?: { itemSelection: Sel } }).__weaveVm
      ?.itemSelection;
    if (sel === undefined) return;
    sel.clear();
    if (typeof sel.setMany === "function") sel.setMany(targets);
    else for (const id of targets) sel.add(id);
  }, ids);
}

async function selectedIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    type Sel = { items: () => ReadonlyArray<string | number> };
    const sel = (window as unknown as { __weaveVm?: { itemSelection: Sel } }).__weaveVm
      ?.itemSelection;
    return sel === undefined ? [] : sel.items().map((x) => String(x));
  });
}

type FrameVal = { x: number; y: number; width: number; height: number; rotation?: number };

async function rootChildIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const doc = (
      window as unknown as {
        __weaveDoc?: { root: { children: ReadonlyArray<{ id: string | number }> } };
      }
    ).__weaveDoc;
    return doc === undefined ? [] : doc.root.children.map((c) => String(c.id));
  });
}

async function readFrame(
  page: import("@playwright/test").Page,
  id: string,
): Promise<FrameVal | null> {
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
    return node === null ? null : ((node.attrs as { frame?: FrameVal }).frame ?? null);
  }, id);
}

async function setRotation(
  page: import("@playwright/test").Page,
  id: string,
  rotation: number,
): Promise<void> {
  await page.evaluate(
    ({ id, rotation }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      const w = window as unknown as { __weaveEditor?: Editor };
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: id,
        patch: (it: { attrs: { frame?: FrameVal } }) => ({
          ...it,
          attrs: { ...it.attrs, frame: { ...(it.attrs.frame as FrameVal), rotation } },
        }),
      });
    },
    { id, rotation },
  );
}

test("hover overlay rotates with a rotated item", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide", {
    frame: { x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0 },
  });
  const id = (await rootChildIds(page)).at(-1)!;
  await setRotation(page, id, Math.PI / 6); // 30°
  await selectItems(page, []); // hover is suppressed for selected items

  const frame = page.locator(`[data-testid="block-frame"][data-frame-id="${id}"]`);
  const box = await frame.boundingBox();
  if (box === null) throw new Error("no frame box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const hovered = page.locator('[data-hover-tier="hovered"]');
  await expect(hovered).toBeVisible();
  // The overlay must carry a real rotation. Derive the angle from the
  // matrix as atan2(b, a) — scale-invariant, so a camera zoom on the
  // overlay doesn't affect the check. matrix(a, b, c, d, e, f).
  const transform = await hovered.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe("none");
  const m = transform.match(/matrix\(([^)]+)\)/);
  expect(m).not.toBeNull();
  const [a, b] = m![1]!.split(",").map((s) => Number.parseFloat(s.trim()));
  const angle = Math.atan2(b!, a!);
  expect(angle).toBeCloseTo(Math.PI / 6, 2); // overlay rotated 30° with the item
});

test("marquee selects a rotated item by its outer bounds, not the raw slot", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  // A thin WIDE bar: raw box is short in y. Rotated 90° its visible AABB
  // becomes TALL — extending well above/below the raw box's y-range.
  await addFrame(page, "slide", {
    frame: { x: 0.3, y: 0.47, width: 0.4, height: 0.06, rotation: 0 },
  });
  const id = (await rootChildIds(page)).at(-1)!;
  await setRotation(page, id, Math.PI / 2); // 90° → AABB is 0.06 wide × 0.4 tall
  await selectItems(page, []);

  // The rendered element's client bbox IS the AABB (it's the rotated node).
  const el = page.locator(`[data-testid="block-frame"][data-frame-id="${id}"]`);
  const aabb = await el.boundingBox();
  if (aabb === null) throw new Error("no aabb box");

  // Marquee a thin strip near the TOP of the AABB. This region is inside
  // the rotated visible extent but ABOVE the unrotated raw box (centered
  // at y≈0.5). Start on empty space above the bar, drag down into the
  // top of the AABB — staying well above the bar's center.
  const cx = aabb.x + aabb.width / 2;
  const startY = aabb.y - 12; // empty space just above the AABB top
  const endY = aabb.y + aabb.height * 0.18; // ~18% down — inside AABB, above raw box
  await page.mouse.move(cx - 4, startY);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cx - 4 + (8 * i) / 6, startY + ((endY - startY) * i) / 6);
  }
  await page.mouse.up();
  await page.waitForTimeout(80);

  expect(await selectedIds(page)).toContain(id);
});

test("multi-align places a rotated item by its outer bounds (end-to-end)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  const before = await rootChildIds(page);
  // A: rotated 45° square. B: unrotated square parked at the top.
  await addFrame(page, "slide", {
    frame: { x: 0.55, y: 0.55, width: 0.2, height: 0.2, rotation: 0 },
  });
  const aId = (await rootChildIds(page)).find((x) => !before.includes(x))!;
  const afterA = await rootChildIds(page);
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.02, width: 0.2, height: 0.2, rotation: 0 },
  });
  const bId = (await rootChildIds(page)).find((x) => !afterA.includes(x))!;

  await setRotation(page, aId, Math.PI / 4);
  await selectItems(page, [aId, bId]);
  await expect.poll(() => selectedIds(page)).toEqual(expect.arrayContaining([aId, bId]));
  await page.keyboard.press("Alt+w"); // align-top
  await page.waitForTimeout(120);

  const a = await readFrame(page, aId);
  const b = await readFrame(page, bId);
  if (a === null || b === null) throw new Error("frames gone");
  const s = 0.2;
  const diag = s * Math.SQRT2;
  // B is the topmost (AABB top = 0.02). A's 45° AABB top must drop to 0.02:
  // A center.y = 0.02 + diag/2 → raw y = center.y - s/2.
  expect(a.y).toBeCloseTo(0.02 + diag / 2 - s / 2, 3);
  expect(a.rotation).toBeCloseTo(Math.PI / 4, 5); // rotation preserved through the wire
  expect(b.y).toBeCloseTo(0.02, 3);
});
