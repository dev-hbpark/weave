// WI-033 A1 — Figma's parent-first auto-select.
//
// Clicking a deeply nested frame from outside its context selects the
// top-level ancestor first; clicking again (with the current selection
// already on the trail) drills to the leaf.

import { expect, test, type Page } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function singleSelectionId(page: Page): Promise<string | undefined> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        itemSelection: {
          state: { get: () => { kind: "none" | "single" | "multi"; itemId?: unknown } };
        };
      };
    };
    const s = w.__weaveVm?.itemSelection.state.get();
    if (s === undefined || s.kind !== "single") return undefined;
    return String(s.itemId);
  });
}

async function centerOf(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  return await page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

async function setupNestedTree(page: Page): Promise<{ parentId: string; childId: string }> {
  await prepareDesign(page, { flavor: "mixed", title: "A1-parent-first" });
  // Add a top-level frame.
  await addFrame(page, "frame", {
    frame: { x: 0.15, y: 0.15, width: 0.6, height: 0.6, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  expect(parentId.length).toBeGreaterThan(0);
  // Add a nested frame inside the top-level one.
  await addFrame(page, "frame", {
    containerId: parentId,
    frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
  });
  const childId = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; children: ReadonlyArray<{ id: unknown }> }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    const inner = parent?.children?.at(-1);
    return inner === undefined ? "" : String(inner.id);
  }, parentId);
  expect(childId.length).toBeGreaterThan(0);
  return { parentId, childId };
}

test("plain click on a nested frame from outside-context selects the top-level ancestor first", async ({
  page,
}) => {
  const { parentId, childId } = await setupNestedTree(page);
  // No selection yet → clicking the nested child should select its
  // top-level ancestor (Figma's parent-first), not the leaf.
  const c = await centerOf(page, childId);
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => singleSelectionId(page)).toBe(parentId);
});

test("clicking again while the parent is already on the trail drills to the leaf", async ({
  page,
}) => {
  const { parentId, childId } = await setupNestedTree(page);
  // First click → parent selected (A1 step).
  const c = await centerOf(page, childId);
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => singleSelectionId(page)).toBe(parentId);
  // Second click on the same nested child → current selection (parent)
  // is on the child's trail, so plain click drills to the leaf.
  //
  // NOTE: this currently fails because the parent's SelectionLayer
  // (portal'd) covers the child frame's body — the second click fires
  // parent NestedFrame's onClick (not the child's), and
  // `selectFromHit(parent, plain, doc, parent)` collapses to "select
  // self" (no change). Fix path = pointer-events: none on the
  // SelectionLayer body (Figma pattern) OR hit-test redirect in
  // NestedFrame onClick. Tracked as a follow-up; users can
  // Cmd/Ctrl-click for deep select today.
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => singleSelectionId(page)).toBe(childId);
});

test("clicking a sibling top-level frame switches to that context (not deeper)", async ({
  page,
}) => {
  const { parentId } = await setupNestedTree(page);
  // Add a second top-level frame. Coords must stay inside the
  // viewport (design 1920×1080 vs. Playwright's default 1280×720
  // means the right ~33% of the design plane sits offscreen; a click
  // there fires on `null` instead of the frame element). Park the
  // sibling above the parent (y < 0.15) on the left edge so its
  // center lands inside the viewport regardless of design scale.
  await addFrame(page, "frame", {
    frame: { x: 0.0, y: 0.0, width: 0.13, height: 0.1, rotation: 0 },
  });
  const siblingId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  // Select parent.
  const pCenter = await centerOf(page, parentId);
  await page.mouse.click(pCenter.x, pCenter.y);
  await expect.poll(() => singleSelectionId(page)).toBe(parentId);
  // Click the sibling → selection moves to the sibling.
  const sCenter = await centerOf(page, siblingId);
  // Debug: who's the topmost element under the click coord? If a
  // higher-z overlay (parent SelectionLayer, rubber-band capture,
  // …) sits there, NestedFrame onClick may fire for the wrong frame.
  const topmost = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const frame = el?.closest("[data-frame-id]");
    return {
      tag: el?.tagName ?? null,
      frameId: frame?.getAttribute("data-frame-id") ?? null,
      dataset: el instanceof HTMLElement ? { ...el.dataset } : null,
    };
  }, sCenter);
  await page.mouse.click(sCenter.x, sCenter.y);
  const afterSibling = await singleSelectionId(page);
  expect(
    afterSibling,
    `expected siblingId=${siblingId}, got ${afterSibling}; ` +
      `topmost-at-click=${JSON.stringify(topmost)}; sCenter=${JSON.stringify(sCenter)}`,
  ).toBe(siblingId);
});
