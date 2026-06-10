import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// WI-157 (WI-153 P2.4) — camera fit-to-active-page. Page-bounded formats
// base-fit the whole design plane, which frames the page only when the page
// is FULL_FRAME. Activating a NON-full page (e.g. a toolbar-added small
// top-level frame = a new slide) must fit the user camera to the page box;
// returning to a FULL_FRAME page from that fit restores the base camera.
// Infinite-canvas formats never page-scope, so their camera is untouched.

/** Live user-camera channel (vm.camera MotionValues — DEV global). */
async function camera(page: Page): Promise<{ tx: number; ty: number; scale: number }> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        camera: {
          tx: { get: () => number };
          ty: { get: () => number };
          scale: { get: () => number };
        };
      };
    };
    const cam = w.__weaveVm?.camera;
    return cam === undefined
      ? { tx: Number.NaN, ty: Number.NaN, scale: Number.NaN }
      : { tx: cam.tx.get(), ty: cam.ty.get(), scale: cam.scale.get() };
  });
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("non-FULL_FRAME page activation fits the camera; FULL page return restores base (WI-157)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  expect((await camera(page)).scale).toBe(1);

  // helpers.addFrame default = a 0.2×0.2 frame at (0.4, 0.4) — a top-level
  // frame in a page-bounded format is a new (non-full) page.
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-1")).toBeVisible();

  await page.getByTestId("thumbnail-1").click();
  await expect.poll(async () => (await camera(page)).scale).toBeGreaterThan(1.5);

  // Back to the FULL_FRAME wizard seed page → base fit restored exactly.
  await page.getByTestId("thumbnail-0").click();
  await expect.poll(async () => (await camera(page)).scale).toBe(1);
  const cam = await camera(page);
  expect(cam.tx).toBe(0);
  expect(cam.ty).toBe(0);
});

test("mixed (infinite canvas) tile click leaves the camera untouched (WI-157)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();

  await page.getByTestId("thumbnail-1").click();
  await page.waitForTimeout(150);
  const cam = await camera(page);
  expect(cam.scale).toBe(1);
  expect(cam.tx).toBe(0);
  expect(cam.ty).toBe(0);
});
