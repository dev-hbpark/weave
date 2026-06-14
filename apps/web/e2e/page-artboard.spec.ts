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

  // Selected, but the artboard exposes NO canvas handles at all — transform
  // AND kind handles (the corner-radius "custom" handle included). The
  // contextual toolbar (the escape hatch's purpose: page-fill editing)
  // anchors the chrome-mounted wait so an empty read can't be a
  // not-yet-rendered false pass.
  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll("[data-handle-kind]").length)).toBe(0);

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

test("marquee drag selects items INSIDE the page, never the page", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { id: pageId } = await pageInfo(page);
  const shapeId = await seedShapeInPage(page, pageId);

  // Band fully containing the shape (page-relative 0.1..0.3 × 0.4..0.6),
  // started on the empty page body below the launch banner. Before the
  // WI-163 follow-up the marquee hit-tested top-level frames only — the band
  // always intersected the page and selected IT (corner-radius handle shown).
  const box = await page
    .locator(`[data-frame-id="${pageId}"]:not([data-thumbnail-id])`)
    .boundingBox();
  if (box === null) throw new Error("no page box");
  const px = (rx: number) => box.x + box.width * rx;
  const py = (ry: number) => box.y + box.height * ry;
  await page.mouse.move(px(0.05), py(0.33));
  await page.mouse.down();
  await page.mouse.move(px(0.45), py(0.75), { steps: 10 });
  await page.mouse.up();

  // The in-page item gets selected — not the page.
  await expect.poll(async () => (await selectionState(page)).itemId).toBe(shapeId);
});

test("marquee STARTED ON THE MATTE (outside the page) still selects in-page items", async ({
  page,
}) => {
  // Page-bounded: editing/placement is page-bounded, but a MULTI-SELECT drag
  // is selection-only, so it may START on the matte (outside the page) and
  // sweep onto the page — the expected Figma/Canva gesture. (Before the fix the
  // shared `acceptWithinPage` gate rejected any drag start on the matte, so a
  // marquee could only begin inside the page.)
  await prepareDesign(page, { flavor: "slide-deck" });
  const { id: pageId } = await pageInfo(page);
  const shapeId = await seedShapeInPage(page, pageId);

  const stage = await page.locator('[data-testid="frame-stage"]').boundingBox();
  const box = await page
    .locator(`[data-frame-id="${pageId}"]:not([data-thumbnail-id])`)
    .boundingBox();
  if (stage === null || box === null) throw new Error("no box");
  // Start midway between the stage's left edge and the page's left edge — a
  // point on the matte (paddingFactor < 1 guarantees the matte band exists).
  const startX = (stage.x + box.x) / 2;
  expect(startX).toBeLessThan(box.x); // sanity: the start is OUTSIDE the page
  const py = (ry: number) => box.y + box.height * ry;
  const px = (rx: number) => box.x + box.width * rx;
  await page.mouse.move(startX, py(0.45));
  await page.mouse.down();
  await page.mouse.move(px(0.45), py(0.75), { steps: 12 });
  await page.mouse.up();

  await expect.poll(async () => (await selectionState(page)).itemId).toBe(shapeId);
});

test("page-bounded matte is painted on the un-scaled container so zoom-out can't break it", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  // The matte (gray region outside the page) now lives on the OUTER stage
  // container, which is never scaled — so it covers the viewport at any zoom.
  // Previously it was a box-shadow on the SCALED design plane whose fixed
  // 100000px spread shrank with the zoom-out scale and exposed the canvas
  // behind it (the gray area "broke" on zoom-out).
  const stageBg = await page
    .locator('[data-testid="frame-stage"]')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(stageBg).toBe("rgb(111, 115, 123)"); // var(--canvas-matte, #6f737b)
  // The scaled design plane no longer carries the matte box-shadow.
  const planeShadow = await page
    .locator('[data-design-plane="true"]')
    .evaluate((el) => getComputedStyle(el).boxShadow);
  expect(planeShadow).toBe("none");
});

test("mixed (infinite canvas) keeps the design background, never the matte", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  const stageBg = await page
    .locator('[data-testid="frame-stage"]')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(stageBg).not.toBe("rgb(111, 115, 123)");
});

test("rail thumbnail hover paints NO hover affordance on the page (WI-164)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { id: pageId } = await pageInfo(page);

  // Hover the rail thumbnail — `useHoverContext` treats the tile like a
  // canvas hover (data-frame-kind), which used to paint the page rect in
  // the edit area through HoverAffordanceLayer.
  const tile = page.locator(`[data-thumbnail-id="${pageId}"]`).first();
  await tile.hover();
  await page.waitForTimeout(300); // hover store + RAF settle
  const tiers = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('[data-testid="hover-affordance-layer"] [data-hover-tier]'),
    )
      .filter((el) => (el as HTMLElement).getBoundingClientRect().width > 0)
      .map((el) => el.getAttribute("data-hover-tier")),
  );
  expect(tiers).toEqual([]);

  // Sanity: hovering an in-page ITEM still paints (the gate is artboard-
  // only, not a blanket page-bounded hover kill).
  const shapeId = await seedShapeInPage(page, pageId);
  const c = await centerOf(page, shapeId);
  await page.mouse.move(c.x, c.y);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll('[data-testid="hover-affordance-layer"] [data-hover-tier]'),
        ).map((el) => el.getAttribute("data-hover-tier")),
      ),
    )
    .toContain("hovered");
});

test("page selection (escape hatch) shows NO QuickActionBar (WI-164)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const { id: pageId } = await pageInfo(page);
  const shapeId = await seedShapeInPage(page, pageId);

  // Baseline: a normal item selection DOES mount the bar.
  const c = await centerOf(page, shapeId);
  await page.mouse.click(c.x, c.y);
  await expect.poll(async () => (await selectionState(page)).itemId).toBe(shapeId);
  await expect(page.getByTestId("hover-quick-actions")).toBeVisible();

  // Escape-hatch page selection: contextual toolbar stays (page-fill
  // editing — the hatch's purpose), QuickActionBar must NOT mount.
  const pc = await centerOf(page, pageId);
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(pc.x, pc.y);
  await page.keyboard.up("ControlOrMeta");
  await expect.poll(async () => (await selectionState(page)).itemId).toBe(pageId);
  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();
  await expect(page.getByTestId("hover-quick-actions")).toHaveCount(0);
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
