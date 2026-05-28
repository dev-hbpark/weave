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
    const el = document.querySelector(
      `[data-testid="frame-stage"] [data-frame-id="${frameId}"]`,
    );
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
