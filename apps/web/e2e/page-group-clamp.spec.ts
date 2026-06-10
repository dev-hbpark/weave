import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// WI-153 P3 + WI-159 — page-bounded soft min-overlap clamp. Single-item drags
// clamp per item (P3); a multi-select drag clamps the SHARED delta against
// every moving page-direct member's interval, so the group translates RIGIDLY
// (relative gap preserved) and no member ever ends fully off-page (DR-111 D5).
// PAGE_MIN_OVERLAP_DESIGN_PX = 48 → minX ratio = 48 / designWidth(1920).
const MIN_X = 48 / 1920;

/** Seed two 0.2×0.2 shapes (x=0.1 / x=0.6) as direct children of the active
 *  page; returns their ids ordered left→right. */
async function seedTwoShapes(page: Page): Promise<{ idA: string; idB: string }> {
  const pre = await page.evaluate(() => {
    type Node = {
      id: string | number;
      kind: string;
      attrs: { frame?: { x: number } };
      children: ReadonlyArray<Node>;
    };
    type W = {
      __weaveDoc?: { root: Node };
      __weaveEditor?: { exec: (name: string, input: unknown) => unknown };
    };
    const w = window as unknown as W;
    const pageItem = w.__weaveDoc?.root.children.find((c) => c.kind === "frame");
    if (pageItem === undefined) throw new Error("no page frame");
    const pageId = String(pageItem.id);
    const before = pageItem.children.map((c) => String(c.id));
    const mk = (x: number) =>
      w.__weaveEditor?.exec("weave.item.add", {
        kind: "shape",
        containerId: pageId,
        frame: { x, y: 0.4, width: 0.2, height: 0.2, rotation: 0 },
      });
    mk(0.1);
    mk(0.6);
    return { pageId, before };
  });
  // __weaveDoc is a React-state snapshot — wait for the adds to publish.
  await page.waitForFunction(
    ({ pageId, n }) => {
      type Node = { id: string | number; children: ReadonlyArray<Node> };
      const w = window as unknown as { __weaveDoc?: { root: Node } };
      const p = w.__weaveDoc?.root.children.find((c) => String(c.id) === pageId);
      return p !== undefined && p.children.length === n + 2;
    },
    { pageId: pre.pageId, n: pre.before.length },
  );
  return await page.evaluate(
    ({ pageId, before }) => {
      type Node = {
        id: string | number;
        attrs: { frame?: { x: number } };
        children: ReadonlyArray<Node>;
      };
      const w = window as unknown as { __weaveDoc?: { root: Node } };
      const beforeSet = new Set(before);
      const p = w.__weaveDoc?.root.children.find((c) => String(c.id) === pageId);
      if (p === undefined) throw new Error("page gone");
      const fresh = p.children.filter((c) => !beforeSet.has(String(c.id)));
      // Label by geometry (child order is not creation order).
      const sorted = [...fresh].sort((m, n) => (m.attrs.frame?.x ?? 0) - (n.attrs.frame?.x ?? 0));
      return { idA: String(sorted[0]?.id), idB: String(sorted[1]?.id) };
    },
    { pageId: pre.pageId, before: pre.before },
  );
}

async function readX(page: Page, id: string): Promise<{ x: number; width: number }> {
  return await page.evaluate((targetId) => {
    type Node = {
      id: string | number;
      attrs: { frame?: { x: number; width: number } };
      children: ReadonlyArray<Node>;
    };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    const walk = (n: Node): Node | undefined => {
      if (String(n.id) === targetId) return n;
      for (const c of n.children) {
        const hit = walk(c);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    const root = w.__weaveDoc?.root;
    const item = root === undefined ? undefined : walk(root);
    const frame = item?.attrs.frame;
    if (frame === undefined) throw new Error(`no frame for ${targetId}`);
    return { x: frame.x, width: frame.width };
  }, id);
}

/** Viewport-bounded horizontal drag from the element's center — events
 *  outside the viewport are dropped, silently truncating the gesture. */
async function dragX(page: Page, id: string, dxPx: number): Promise<void> {
  const box = await page.locator(`[data-frame-id="${id}"]`).boundingBox();
  if (box === null) throw new Error(`no box for ${id}`);
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const viewport = page.viewportSize();
  const targetX = Math.min(Math.max(startX + dxPx, 5), (viewport?.width ?? 1280) - 5);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(targetX, y, { steps: 20 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("single-item drag soft-clamps at the page edge (WI-153 P3)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { idA, idB } = await seedTwoShapes(page);

  await dragX(page, idA, -2500);
  const a = await readX(page, idA);
  // Bleed allowed, but the right edge keeps exactly min overlap on-page.
  expect(a.x + a.width).toBeCloseTo(MIN_X, 6);
  expect((await readX(page, idB)).x).toBeCloseTo(0.6, 6);
});

test("multi-select drag clamps the GROUP rigidly — gap preserved, no member lost (WI-159)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { idA, idB } = await seedTwoShapes(page);

  await page.evaluate(
    ({ idA, idB }) => {
      const w = window as unknown as {
        __weaveVm?: { itemSelection: { setMany: (ids: Iterable<string>) => void } };
      };
      w.__weaveVm?.itemSelection.setMany([idA, idB]);
    },
    { idA, idB },
  );

  await dragX(page, idA, -1500);
  const a = await readX(page, idA);
  const b = await readX(page, idB);
  // Rigid: the A↔B gap survives the clamp (per-item clamping deformed it).
  expect(b.x - a.x).toBeCloseTo(0.5, 6);
  // The leftmost member binds — pinned at ITS min-overlap limit...
  expect(a.x + a.width).toBeCloseTo(MIN_X, 6);
  expect(a.x).toBeLessThan(0); // clamp actually engaged (bleed happened)
  // ...and no member is fully off-page (D5 per item).
  expect(b.x + b.width).toBeGreaterThanOrEqual(MIN_X - 1e-6);
});
