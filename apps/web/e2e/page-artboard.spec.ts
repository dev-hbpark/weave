// WI-163 — page-bounded formats treat the page (top-level frame) as a fixed
// ARTBOARD (Canva model), not an ordinary object:
//   - plain click on the page body = background click (no selection)
//   - dragging the page body never moves the page (falls through to marquee)
//   - clicking an item inside the page selects the ITEM (parent-first starts
//     INSIDE the page, never at the page)
//   - Cmd/Ctrl deep-click still selects the page (page-fill escape hatch) but
//     resize / rotate handles stay suppressed and Backspace cannot delete it
// Infinite-canvas formats (mixed / canvas-board) are untouched — their
// top-level frames remain fully manipulable (regression test at the bottom).

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectionState(
  page: Page,
): Promise<{ kind: "none" | "single" | "multi"; itemId?: string }> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        itemSelection: {
          state: { get: () => { kind: "none" | "single" | "multi"; itemId?: unknown } };
        };
      };
    };
    const s = w.__weaveVm?.itemSelection.state.get();
    if (s === undefined) return { kind: "none" as const };
    return s.kind === "single" ? { kind: s.kind, itemId: String(s.itemId) } : { kind: s.kind };
  });
}

/** Id + ratio frame of the first top-level frame (= the page on slide-deck). */
async function pageInfo(page: Page): Promise<{ id: string; frame: unknown }> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { children: ReadonlyArray<{ id: unknown; attrs: { frame?: unknown } }> };
      };
    };
    const first = w.__weaveDoc?.root.children[0];
    if (first === undefined) throw new Error("no top-level frame");
    return { id: String(first.id), frame: first.attrs.frame };
  });
}

/** Visible transform handles (edge / corner / rotation) currently in the DOM. */
async function transformHandles(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-handle-kind]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => el.getAttribute("data-handle-kind") ?? "")
      .filter((k) => k === "edge" || k === "corner" || k === "rotation"),
  );
}

async function centerOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  // `:not([data-thumbnail-id])` — the rail thumbnail mirrors data-frame-id.
  const box = await page.locator(`[data-frame-id="${id}"]:not([data-thumbnail-id])`).boundingBox();
  if (box === null) throw new Error(`no box for ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Seed one 0.2×0.2 shape at (0.1, 0.4) inside the active page; returns its
 *  id. y=0.4 keeps it clear of the launch banner overlay (top of canvas). */
async function seedShapeInPage(page: Page, pageId: string): Promise<string> {
  const before = await page.evaluate((pid) => {
    type Node = { id: string | number; children: ReadonlyArray<Node> };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    const p = w.__weaveDoc?.root.children.find((c) => String(c.id) === pid);
    return p === undefined ? [] : p.children.map((c) => String(c.id));
  }, pageId);
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.4, width: 0.2, height: 0.2, rotation: 0 },
  });
  await page.waitForFunction(
    ({ pid, n }) => {
      type Node = { id: string | number; children: ReadonlyArray<Node> };
      const w = window as unknown as { __weaveDoc?: { root: Node } };
      const p = w.__weaveDoc?.root.children.find((c) => String(c.id) === pid);
      return p !== undefined && p.children.length === n + 1;
    },
    { pid: pageId, n: before.length },
  );
  return await page.evaluate(
    ({ pid, before }) => {
      type Node = { id: string | number; children: ReadonlyArray<Node> };
      const w = window as unknown as { __weaveDoc?: { root: Node } };
      const beforeSet = new Set(before);
      const p = w.__weaveDoc?.root.children.find((c) => String(c.id) === pid);
      const fresh = p?.children.find((c) => !beforeSet.has(String(c.id)));
      if (fresh === undefined) throw new Error("seeded shape not found");
      return String(fresh.id);
    },
    { pid: pageId, before },
  );
}

test("plain click on the page body clears the selection; drag never moves the page", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { id: pageId, frame: before } = await pageInfo(page);
  const c = await centerOf(page, pageId);

  // Plain click on the empty page body → background (no selection).
  await page.mouse.click(c.x, c.y);
  await expect.poll(async () => (await selectionState(page)).kind).toBe("none");

  // Drag on the page body → the page frame must not move (the declined move
  // falls through to the rubber band, which is selection-only).
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 120, c.y + 80, { steps: 8 });
  await page.mouse.up();
  const { frame: after } = await pageInfo(page);
  expect(JSON.stringify(after)).toBe(JSON.stringify(before));
});

test("clicking an item inside the page selects the ITEM, not the page", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { id: pageId } = await pageInfo(page);
  const shapeId = await seedShapeInPage(page, pageId);

  const c = await centerOf(page, shapeId);
  await page.mouse.click(c.x, c.y);
  // WI-033 parent-first would have picked trail[0] = the page; WI-163 shifts
  // the context root so the first pick is the item inside the page.
  await expect.poll(async () => (await selectionState(page)).itemId).toBe(shapeId);
});

test("Cmd-click selects the page (fill escape hatch) without transform handles; Backspace cannot delete it", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { id: pageId } = await pageInfo(page);
  const c = await centerOf(page, pageId);

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(c.x, c.y);
  await page.keyboard.up("ControlOrMeta");
  await expect.poll(async () => (await selectionState(page)).itemId).toBe(pageId);

  // Selected, but the artboard exposes NO resize / rotate handles. Wait for
  // the selection chrome to actually mount (non-transform specs — e.g. the
  // corner-radius "custom" handle — survive the filter, same as DR-061 lock)
  // so an empty read can't be a not-yet-rendered false pass.
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll("[data-handle-kind]").length))
    .toBeGreaterThan(0);
  expect(await transformHandles(page)).toEqual([]);

  // Backspace on the deep-selected page → the page survives.
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(200);
  const count = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
    };
    return w.__weaveDoc?.root.children.length ?? 0;
  });
  expect(count).toBeGreaterThanOrEqual(1);
});

test("mixed (infinite canvas) regression — a top-level frame stays fully manipulable", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "frame", {
    frame: { x: 0.15, y: 0.15, width: 0.3, height: 0.3, rotation: 0 },
  });
  // Mixed seeds starter content — the frame just added is the LAST child.
  const { id: frameId, frame: before } = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { children: ReadonlyArray<{ id: unknown; attrs: { frame?: unknown } }> };
      };
    };
    const last = w.__weaveDoc?.root.children.at(-1);
    if (last === undefined) throw new Error("no top-level frame");
    return { id: String(last.id), frame: last.attrs.frame };
  });

  // Plain click selects it (ordinary object) and shows transform handles.
  const c = await centerOf(page, frameId);
  await page.mouse.click(c.x, c.y);
  await expect.poll(async () => (await selectionState(page)).itemId).toBe(frameId);
  await expect.poll(async () => (await transformHandles(page)).length).toBeGreaterThan(0);

  // And dragging it MOVES it (the artboard gate must not leak into mixed).
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      JSON.stringify(
        await page.evaluate((fid) => {
          const w = window as unknown as {
            __weaveDoc?: {
              root: { children: ReadonlyArray<{ id: unknown; attrs: { frame?: unknown } }> };
            };
          };
          return w.__weaveDoc?.root.children.find((ch) => String(ch.id) === fid)?.attrs.frame;
        }, frameId),
      ),
    )
    .not.toBe(JSON.stringify(before));
});
