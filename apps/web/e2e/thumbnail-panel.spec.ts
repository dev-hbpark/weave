import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

/** Current item selection as a sorted array of ids. */
async function selectedIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { items: () => ReadonlyArray<unknown> } };
    };
    return (w.__weaveVm?.itemSelection.items() ?? []).map((x) => String(x)).sort();
  });
}

/** First top-level frame id (z-order). */
async function firstFrameId(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    const c = (w.__weaveDoc?.root.children ?? []).find((x) => x.kind === "frame");
    return String(c?.id ?? "");
  });
}

/** On-screen width of a frame's canvas wrapper (scoped to the frame stage so
 *  the portal'd thumbnail with the same data-frame-id is excluded). */
async function frameScreenWidth(page: Page, id: string): Promise<number> {
  return await page.evaluate((frameId) => {
    const el = document.querySelector(`[data-testid="frame-stage"] [data-frame-id="${frameId}"]`);
    return el === null ? 0 : el.getBoundingClientRect().width;
  }, id);
}

// Phase 12d — ThumbnailPanel tiles correspond to every domain *frame* in the
// design. The design root is no longer a slide — only the frames the user
// authors. Empty designs hide the panel.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("panel hides for empty designs; one tile per frame thereafter", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await expect(page.getByTestId("thumbnail-panel")).toHaveCount(0);

  // Add two slides — panel appears with 2 tiles (one per frame, no root tile).
  await addFrame(page, "slide");
  await addFrame(page, "slide");

  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
});

test("drag reorder updates the panel sequence", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Reorder test" });
  await addFrame(page, "slide");
  await addFrame(page, "canvas-design");
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(3);

  const initial = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll("[data-thumbnail-id]"));
    return tiles.map((t) => (t as HTMLElement).dataset.thumbnailId);
  });

  const last = page.getByTestId("thumbnail-2");
  const first = page.getByTestId("thumbnail-0");
  await last.dragTo(first);
  await page.waitForTimeout(80);

  const after = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll("[data-thumbnail-id]"));
    return tiles.map((t) => (t as HTMLElement).dataset.thumbnailId);
  });
  expect(after[0]).toBe(initial[2]);
  expect(after[1]).toBe(initial[0]);
  expect(after[2]).toBe(initial[1]);
});

// WI-032 Phase 3c — present mode + reorder 의 paradigm-shift 후 timing
// 영향. single PASS, group fail. PresentPage 의 frame paradigm 의 step
// 계산 + thumbnail dnd 의 reconciler 가 align 후 unskip.
test.skip("reorder is reflected in present mode step count + order", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Present order" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);

  // Phase 12d — Present button is in the toolbar.
  await page.getByTestId("toolbar-present").click();

  await expect(page.getByText("1 / 2", { exact: false })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 2", { exact: false })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/design\/[^/]+$/);
  await page.getByTestId("thumbnail-1").dragTo(page.getByTestId("thumbnail-0"));
  await page.waitForTimeout(50);

  await page.getByTestId("toolbar-present").click();
  await expect(page.getByText("1 / 2", { exact: false })).toBeVisible();
});

test("clicking a tile selects the corresponding frame", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Click select" });
  await addFrame(page, "slide");

  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  // tile 0 is the slide frame; clicking selects it.
  await page.getByTestId("thumbnail-0").click();
  expect(page.url()).not.toContain("/sub/");
  // add-target-hint was removed; selection is implicit. URL remains on the
  // design route — the tile click should not navigate elsewhere.
  await expect(page).toHaveURL(/\/design\/[^/]+$/);
});

test("clicking the thumbnail image area selects the frame", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Image-area select" });
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  const id = await firstFrameId(page);
  expect(id).not.toBe("");

  // Click the upper-center of the tile — the preview/image region, which used
  // to swallow the click (only the footer selected). Position is relative to
  // the 160x124 tile; y:42 lands in the preview slot.
  await page.getByTestId("thumbnail-0").click({ position: { x: 80, y: 42 } });
  expect(await selectedIds(page)).toEqual([id]);
});

test("clicking the eye (focus) button also selects the frame", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Eye select" });
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  const id = await firstFrameId(page);

  await page.getByTestId("thumbnail-focus-0").click();
  // The eye also cycles focus to stage 1, but selection must be set too.
  expect(await selectedIds(page)).toEqual([id]);
  await expect(page.getByTestId("thumbnail-focus-0")).toHaveAttribute("data-stage", "1");
});

test("excluding a slide moves it to the group section, where the focus eye still works (WI-100)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Group eye" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);

  // The bottom-right deck-membership button excludes a slide → it drops into
  // the non-slide (group) section.
  await page.getByTestId("thumbnail-slide-toggle-0").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  const groupTile = page.locator('[data-testid^="thumbnail-nonslide-"]').first();
  await expect(groupTile).toBeVisible();

  // WI-100 — the excluded group tile keeps a working focus (눈) button: editing
  // convenience (dim/isolate) is retained even for non-deck frames.
  const groupEye = page.locator('[data-testid^="thumbnail-nonslide-focus-"]').first();
  await expect(groupEye).toHaveCount(1);
  await groupEye.click();
  await expect(groupEye).toHaveAttribute("data-stage", "1");

  // It can be re-included via the same deck button.
  await page.locator('[data-testid^="thumbnail-nonslide-toggle-"]').first().click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
});

test("focusing a frame blocks pointer-events on the other frames' canvas (WI-102)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Focus gate" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    return (w.__weaveDoc?.root.children ?? [])
      .filter((c) => c.kind === "frame")
      .map((c) => String(c.id));
  });
  expect(ids.length).toBe(2);

  // Focus the FIRST frame → stage 1 ("dim") gates frames painted ABOVE it in
  // z-order (its later sibling = the second frame). The gated frame's canvas
  // wrapper must become non-interactive (pointer-events:none) — the regression
  // was that the imperative gate could be raced by motion's style re-apply, so
  // the block is now declared on the style and must hold.
  await page.getByTestId("thumbnail-focus-0").click();
  await expect(page.getByTestId("thumbnail-focus-0")).toHaveAttribute("data-stage", "1");

  const blockedPE = await page.evaluate((fid) => {
    const el = document.querySelector(
      `[data-testid="frame-stage"] [data-frame-id="${fid}"]`,
    ) as Element | null;
    return el === null ? "" : getComputedStyle(el).pointerEvents;
  }, ids[1]);
  expect(blockedPE).toBe("none");

  // The focused frame itself stays interactive.
  const focusedPE = await page.evaluate((fid) => {
    const el = document.querySelector(
      `[data-testid="frame-stage"] [data-frame-id="${fid}"]`,
    ) as Element | null;
    return el === null ? "" : getComputedStyle(el).pointerEvents;
  }, ids[0]);
  expect(focusedPE).not.toBe("none");
});

test("double-clicking a tile fits the camera to that frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Dblclick zoom" });
  // A small frame (20% of the plane) so a successful fit grows it noticeably.
  await addFrame(page, "slide", {
    frame: { x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotation: 0 },
  });
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  const id = await firstFrameId(page);

  const before = await frameScreenWidth(page, id);
  expect(before).toBeGreaterThan(0);

  await page.getByTestId("thumbnail-0").dblclick();

  // Camera fit brings the frame full-screen → its on-screen width grows well
  // past its pre-fit size. Poll to ride out the fit transition.
  await expect
    .poll(() => frameScreenWidth(page, id), { timeout: 4000 })
    .toBeGreaterThan(before * 1.8);
});
