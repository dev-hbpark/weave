// WI-074 / DR-029 — interactive image crop + Canva-style content rotation.
//
// Verifies the full round-trip in the live runtime:
//  • command path (`weave.image.setCrop`) — window + rotation set, Cmd+Z revert,
//    Cmd+Shift+Z redo, plus image-only + range guards.
//  • UI path — double-click enters crop mode; the straighten slider + 완료 commit
//    rotation into `cropRatio`; ESC cancels with no commit.
//
// Rotation is stored INSIDE `cropRatio` (agocraft DR-037 `ImageCrop.rotation`).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// 1×1 transparent PNG — enough for the <img> to mount.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

type Crop =
  | { x: number; y: number; w: number; h: number; rotation?: number }
  | undefined;

async function addImage(page: Page): Promise<string> {
  const id = await page.evaluate((src) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "image",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
      attrsOverride: { src },
    });
    return String(r.value);
  }, PNG);
  await page.waitForTimeout(120);
  return id;
}

async function setCrop(page: Page, input: Record<string, unknown>): Promise<boolean> {
  const ok = await page.evaluate((inp) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { ok?: boolean } };
    };
    return w.__weaveEditor!.exec("weave.image.setCrop", inp).ok !== false;
  }, input);
  await page.waitForTimeout(120);
  return ok;
}

async function readCrop(page: Page, itemId: string): Promise<Crop> {
  return page.evaluate((cid) => {
    type N = {
      id: unknown;
      attrs?: { cropRatio?: { x: number; y: number; w: number; h: number; rotation?: number } };
      children?: ReadonlyArray<N>;
    };
    const w = window as unknown as { __weaveDoc?: { root: N } };
    const find = (n: N | undefined): N | undefined => {
      if (n === undefined) return undefined;
      if (String(n.id) === cid) return n;
      for (const c of n.children ?? []) {
        const hit = find(c);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root)?.attrs?.cropRatio;
  }, itemId);
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("WI-074 — setCrop sets the window + rotation; Cmd+Z reverts, Cmd+Shift+Z redoes", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-cmd" });
  const id = await addImage(page);
  await expect.poll(() => readCrop(page, id)).toBeUndefined();

  expect(
    await setCrop(page, { itemId: id, crop: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, rotation: 0.2 }),
  ).toBe(true);
  await expect.poll(() => readCrop(page, id)).toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0.2 });

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => readCrop(page, id)).toBeUndefined();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect
    .poll(() => readCrop(page, id))
    .toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0.2 });
});

test("WI-074 — guards: non-image and out-of-range crop are rejected", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-guards" });
  const imgId = await addImage(page);

  // out-of-range window (x + w > 1) on a real image → rejected, no change.
  expect(await setCrop(page, { itemId: imgId, crop: { x: 0.6, y: 0, w: 0.6, h: 1 } })).toBe(false);
  await expect.poll(() => readCrop(page, imgId)).toBeUndefined();

  // a shape target → not-an-image.
  const shapeId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "shape",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
    });
    return String(r.value);
  });
  expect(await setCrop(page, { itemId: shapeId, crop: { x: 0, y: 0, w: 1, h: 1 } })).toBe(false);
});

test("WI-074 — UI: double-click enters crop mode; straighten + 완료 commits rotation", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-ui" });
  const id = await addImage(page);

  // Enter crop mode by double-clicking the image.
  await page.locator(`[data-frame-id="${id}"]`).dblclick();
  await expect(page.getByTestId("image-crop-editor")).toBeVisible();

  // Straighten to +20°, then commit.
  await page.getByTestId("image-crop-straighten").fill("20");
  await page.getByTestId("image-crop-apply").click();
  await expect(page.getByTestId("image-crop-editor")).toHaveCount(0);

  const crop = await readCrop(page, id);
  expect(crop).toBeDefined();
  // 20° ≈ 0.349 rad.
  expect(crop?.rotation ?? 0).toBeCloseTo((20 * Math.PI) / 180, 2);

  // Re-enter and ESC → no further commit (rotation stays at 20°).
  await page.locator(`[data-frame-id="${id}"]`).dblclick();
  await expect(page.getByTestId("image-crop-editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("image-crop-editor")).toHaveCount(0);
  expect((await readCrop(page, id))?.rotation ?? 0).toBeCloseTo((20 * Math.PI) / 180, 2);
});
