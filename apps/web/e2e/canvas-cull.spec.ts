// WI-058 / DR-021 — infinite-canvas viewport culling.
//
// A frame panned far outside the viewport (beyond the one-viewport
// IntersectionObserver buffer) must drop to `visibility: hidden` so the
// browser frees its paint + raster. Panning it back into view restores it.
// This is the DOM-preserving fix for the unbounded GPU/layer memory growth
// documented in records/rendering-reviews/RPR-001.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function frameIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    return (w.__weaveDoc?.root.children ?? [])
      .filter((c) => c.kind === "frame")
      .map((c) => String(c.id));
  });
}

/** Computed `visibility` of a frame wrapper, or "missing" when absent. */
async function frameVisibility(page: Page, id: string): Promise<string> {
  return page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`);
    if (el === null) return "missing";
    return getComputedStyle(el).visibility;
  }, id);
}

test("frame panned off-viewport is culled, restored when panned back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Cull" });

  // One frame near the design-plane centre — visible at the initial
  // whole-plane fit.
  await addFrame(page, "slide", {
    frame: { x: 0.45, y: 0.45, width: 0.1, height: 0.1, rotation: 0 },
  });
  const ids = await frameIds(page);
  expect(ids.length).toBe(1);
  const id = ids[0] as string;

  // Initially on-screen → not culled.
  await expect.poll(() => frameVisibility(page, id), { timeout: 4000 }).not.toBe("hidden");

  // Pan the content far up (plain wheel = pan; deltaY pushes the plane up by
  // ~6000px, well past the one-viewport cull buffer).
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.mouse.move(Math.floor(vp.w * 0.5), Math.floor(vp.h * 0.3));
  await page.mouse.wheel(0, 6000);

  // IntersectionObserver fires asynchronously → poll for the cull.
  await expect.poll(() => frameVisibility(page, id), { timeout: 8000 }).toBe("hidden");

  // Pan back → the frame re-enters the viewport and is restored.
  await page.mouse.wheel(0, -6000);
  await expect.poll(() => frameVisibility(page, id), { timeout: 8000 }).not.toBe("hidden");
});

/** Count `<img>` elements inside a given frame's wrapper. */
async function imgsInFrame(page: Page, id: string): Promise<number> {
  return page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`);
    return el === null ? -1 : el.querySelectorAll("img").length;
  }, id);
}

test("culled image frame drops its <img> (frees decode), restores on return", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Cull decode" });

  // A 64×64 data-URI image so decode is real but cheap.
  const src = await page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#3b82f6";
    g.fillRect(0, 0, 64, 64);
    return cv.toDataURL("image/png");
  });
  await page.evaluate(
    ({ src }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      type Doc = { root: { id: string | number } };
      const w = window as unknown as { __weaveEditor?: Editor; __weaveDoc?: Doc };
      w.__weaveEditor!.exec("weave.item.add", {
        kind: "image",
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.45, y: 0.45, width: 0.12, height: 0.12, rotation: 0 },
        attrsOverride: { src, fit: "cover" },
      });
    },
    { src },
  );
  // image items are kind "image" (not "frame"); wait for the doc mirror to
  // commit, then read the new id straight off the doc.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
    };
    return (w.__weaveDoc?.root.children.length ?? 0) >= 1;
  });
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: string | number }> } };
    };
    return String(w.__weaveDoc!.root.children.at(-1)!.id);
  });
  expect(id.length).toBeGreaterThan(0);

  // On-screen: the <img> is mounted.
  await expect.poll(() => imgsInFrame(page, id), { timeout: 8000 }).toBe(1);

  // Pan far off → frame culled → <img> dropped (decode freed).
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.mouse.move(Math.floor(vp.w * 0.5), Math.floor(vp.h * 0.3));
  await page.mouse.wheel(0, 6000);
  await expect.poll(() => frameVisibility(page, id), { timeout: 8000 }).toBe("hidden");
  await expect.poll(() => imgsInFrame(page, id), { timeout: 8000 }).toBe(0);

  // Pan back → frame restored → <img> remounts.
  await page.mouse.wheel(0, -6000);
  await expect.poll(() => imgsInFrame(page, id), { timeout: 8000 }).toBe(1);
});
