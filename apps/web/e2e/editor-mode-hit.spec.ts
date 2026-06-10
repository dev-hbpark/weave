// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// WI-166 P3 / DR-114 §3 — HitPolicy drives WHICH item a press resolves to,
// per flavor. One APPROVED behavior change lands with the policy (③):
//
//   ③ page-bounded flavors (slide-deck / doc-page) resolve the MOVE target
//     parent-first from the active page — a drag starting on an unselected
//     deep child aims at its page-direct ancestor, and commitFrame's
//     once-per-gesture selection switch makes that a one-gesture
//     select+move (Keynote/Google Slides parity).
//
//   Infinite flavors (mixed / canvas-board) keep the deepest-movable
//   resolution — dragging an unselected deep child moves THAT child
//   (Figma parity, 무회귀).
//
// The resolver algorithms are unit-tested in
// src/document/editor-mode/pieces/hit-resolution.test.ts and the
// registry-level composition in editor-mode.test.ts; these specs pin the
// live drag pipeline (FrameStage resolveTarget → injected hit.moveTarget →
// FrameMoveBinding → commitFrame selection).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page); // also pre-dismisses the launch banners
});

type TreeNode = {
  id: unknown;
  kind: string;
  attrs?: { frame?: { x: number; y: number; width: number; height: number } };
  children?: ReadonlyArray<TreeNode>;
};
type W = {
  __weaveEditor?: { exec: (n: string, i: unknown) => { ok?: boolean; value?: unknown } };
  __weaveDoc?: { root: TreeNode };
  __weaveVm?: { itemSelection: { items: () => ReadonlyArray<unknown> } };
};

/** Add a frame into `containerId` and return the new item's id. Sequential
 *  adds need a tick between them — `weave.item.add` resolves `containerId`
 *  against the editor doc, which only reflects the previous add on the next
 *  tick (frame-nested-container.spec.ts has the same shape). */
async function addChildFrame(
  page: Page,
  containerId: string | undefined,
  frame: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const id = await page.evaluate(
    ({ cid, f }) => {
      const w = window as unknown as W;
      const r = w.__weaveEditor!.exec("weave.item.add", {
        kind: "frame",
        containerId: cid ?? String(w.__weaveDoc!.root.id),
        frame: { ...f, rotation: 0 },
      });
      return String(r.value);
    },
    { cid: containerId, f: frame },
  );
  await page.waitForTimeout(150);
  return id;
}

async function selectedIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as W;
    return (w.__weaveVm?.itemSelection.items() ?? []).map((x) => String(x)).sort();
  });
}

/** Read `attrs.frame` (the 0..1 PARENT-relative rect) for `itemId`. */
async function relFrame(page: Page, itemId: string): Promise<{ x: number; y: number }> {
  const f = await page.evaluate((targetId) => {
    const w = window as unknown as W;
    const find = (n: TreeNode): TreeNode | null => {
      if (String(n.id) === targetId) return n;
      for (const c of n.children ?? []) {
        const inner = find(c);
        if (inner !== null) return inner;
      }
      return null;
    };
    const node = find(w.__weaveDoc!.root);
    const fr = node?.attrs?.frame;
    return fr === undefined ? null : { x: fr.x, y: fr.y };
  }, itemId);
  expect(f).not.toBeNull();
  return f as { x: number; y: number };
}

async function frameCenter(page: Page, id: string): Promise<{ cx: number; cy: number }> {
  const fr = await page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, id);
  expect(fr).not.toBeNull();
  return fr as { cx: number; cy: number };
}

/** Press at the element center and drag well beyond the 3px move threshold. */
async function dragFrom(page: Page, id: string): Promise<void> {
  const c = await frameCenter(page, id);
  await page.mouse.move(c.cx, c.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(c.cx + 30, c.cy + 12);
  await page.mouse.move(c.cx + 60, c.cy + 25);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(80);
}

test("slide-deck: drag on an unselected deep child selects+moves its page-direct ancestor (change ③)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "Hit-Policy-Deck" });
  // AFTER prepareDesign — emulateMedia before the wizard walk keeps the
  // design page's networkidle from ever settling in the e2e sandbox
  // (empirically bisected; the CDP media re-emulation interacts with the
  // load-state tracker). Reduced motion only matters during the drag below.
  await page.emulateMedia({ reducedMotion: "reduce" });

  // slide-deck seeds one page; nest child → grandchild inside it.
  const pageId = await page.evaluate(() => {
    const w = window as unknown as W;
    return String(w.__weaveDoc!.root.children![0]!.id);
  });
  const childId = await addChildFrame(page, pageId, { x: 0.15, y: 0.15, width: 0.5, height: 0.5 });
  const grandId = await addChildFrame(page, childId, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });

  await setSelection(page, []);
  expect(await selectedIds(page)).toEqual([]);

  const childBefore = await relFrame(page, childId);
  const grandBefore = await relFrame(page, grandId);

  // Drag starting on the GRANDCHILD's body, nothing selected.
  await dragFrom(page, grandId);

  // The page-direct ancestor (child) got selected AND moved — one gesture.
  expect(await selectedIds(page)).toEqual([childId]);
  const childAfter = await relFrame(page, childId);
  expect(Math.abs(childAfter.x - childBefore.x)).toBeGreaterThan(0.01);
  // The grandchild's PARENT-relative rect is untouched (it rode along).
  const grandAfter = await relFrame(page, grandId);
  expect(Math.abs(grandAfter.x - grandBefore.x)).toBeLessThan(0.005);
  expect(Math.abs(grandAfter.y - grandBefore.y)).toBeLessThan(0.005);
});

test("mixed: drag on an unselected deep child still moves THAT child (무회귀)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Hit-Policy-Mixed" });
  await page.emulateMedia({ reducedMotion: "reduce" }); // after prepareDesign — see above

  // root → top frame → child → grandchild (same depth as the deck spec).
  const topId = await addChildFrame(page, undefined, { x: 0.1, y: 0.1, width: 0.6, height: 0.6 });
  const childId = await addChildFrame(page, topId, { x: 0.15, y: 0.15, width: 0.5, height: 0.5 });
  const grandId = await addChildFrame(page, childId, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });

  await setSelection(page, []);
  expect(await selectedIds(page)).toEqual([]);

  const childBefore = await relFrame(page, childId);
  const grandBefore = await relFrame(page, grandId);

  await dragFrom(page, grandId);

  // Free placement keeps Figma parity: the deepest hit itself moved and
  // took the selection; its parent stayed put.
  expect(await selectedIds(page)).toEqual([grandId]);
  const grandAfter = await relFrame(page, grandId);
  expect(Math.abs(grandAfter.x - grandBefore.x)).toBeGreaterThan(0.01);
  const childAfter = await relFrame(page, childId);
  expect(Math.abs(childAfter.x - childBefore.x)).toBeLessThan(0.005);
  expect(Math.abs(childAfter.y - childBefore.y)).toBeLessThan(0.005);
});
