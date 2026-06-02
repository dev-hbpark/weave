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
  | {
      x: number;
      y: number;
      w: number;
      h: number;
      rotation?: number;
      flipH?: boolean;
      flipV?: boolean;
    }
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

async function descendantCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    type N = { children?: ReadonlyArray<N> };
    const w = window as unknown as { __weaveDoc?: { root: N } };
    const count = (n: N | undefined): number =>
      n === undefined ? 0 : (n.children ?? []).reduce((acc, c) => acc + 1 + count(c), 0);
    return count(w.__weaveDoc?.root);
  });
}

async function readCrop(page: Page, itemId: string): Promise<Crop> {
  return page.evaluate((cid) => {
    type N = {
      id: unknown;
      attrs?: {
        cropRatio?: {
          x: number;
          y: number;
          w: number;
          h: number;
          rotation?: number;
          flipH?: boolean;
          flipV?: boolean;
        };
      };
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

async function readFlip(
  page: Page,
  itemId: string,
): Promise<{ flipH?: boolean; flipV?: boolean } | null> {
  return page.evaluate((cid) => {
    type U = { kind?: string; attrs?: { flipH?: boolean; flipV?: boolean } };
    type N = { id: unknown; units?: ReadonlyArray<U>; children?: ReadonlyArray<N> };
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
    const u = find(w.__weaveDoc?.root)?.units?.find((x) => x.kind === "transform.flip");
    return u?.attrs ?? null;
  }, itemId);
}

async function flip(page: Page, itemId: string, axis: "horizontal" | "vertical"): Promise<boolean> {
  const ok = await page.evaluate(
    ([id, ax]) =>
      (
        window as unknown as {
          __weaveEditor?: { exec: (n: string, i: unknown) => { ok?: boolean } };
        }
      ).__weaveEditor!.exec("weave.item.flip", { itemId: id, axis: ax }).ok !== false,
    [itemId, axis] as const,
  );
  await page.waitForTimeout(100);
  return ok;
}

async function addKind(page: Page, kind: string): Promise<string> {
  const id = await page.evaluate((k) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    return String(
      w.__weaveEditor!.exec("weave.item.add", {
        kind: k,
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
      }).value,
    );
  }, kind);
  await page.waitForTimeout(120);
  return id;
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
  await expect
    .poll(() => readCrop(page, id))
    .toEqual({ x: 0.2, y: 0.2, w: 0.6, h: 0.6, rotation: 0.2 });

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

test("WI-074 — crop mode (D8): dragging pans the crop window (cropRatio x/y)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-pan" });
  const id = await addImage(page);
  // Need a sub-window first so there is room to pan.
  await setCrop(page, { itemId: id, crop: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } });

  await page.locator(`[data-frame-id="${id}"]`).dblclick();
  await expect(page.getByTestId("image-crop-editor")).toBeVisible();

  // Drag from the frame centre — the bright crop (pointer-events:none) passes the
  // press through to the dimmed full-image pan layer.
  const fbox = await page.locator(`[data-frame-id="${id}"]`).boundingBox();
  if (fbox === null) throw new Error("no frame box");
  const cx = fbox.x + fbox.width / 2;
  const cy = fbox.y + fbox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId("image-crop-apply").click();

  const crop = await readCrop(page, id);
  expect(crop).toBeDefined();
  // window size unchanged; x moved (dragging right reveals the image's left → x↓).
  expect(crop?.w ?? 0).toBeCloseTo(0.6, 5);
  expect(crop?.x ?? 0.2).toBeLessThan(0.2);
});

test("WI-074 — flip toggles a transform.flip unit (display mirrored); Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-flip" });
  const id = await addImage(page);

  expect(await flip(page, id, "horizontal")).toBe(true);
  await expect.poll(() => readFlip(page, id)).toEqual({ flipH: true, flipV: false });
  // committed render mirrors the frame view (NestedFrame flip layer).
  await expect
    .poll(() => page.locator(`[data-frame-id="${id}"] div[style*="scaleX(-1)"]`).count())
    .toBeGreaterThan(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => readFlip(page, id)).toBeNull();
});

test("WI-074 — flipping a CROPPED image preserves the visible region (cropRatio unchanged)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-flip-crop" });
  const id = await addImage(page);

  await setCrop(page, { itemId: id, crop: { x: 0.2, y: 0.1, w: 0.5, h: 0.6 } });
  await expect.poll(() => readCrop(page, id)).toEqual({ x: 0.2, y: 0.1, w: 0.5, h: 0.6 });

  // Flip — the crop window (cropRatio) must stay identical; flip is a separate unit.
  expect(await flip(page, id, "horizontal")).toBe(true);
  expect(await readCrop(page, id)).toEqual({ x: 0.2, y: 0.1, w: 0.5, h: 0.6 });
  expect(await readFlip(page, id)).toEqual({ flipH: true, flipV: false });
});

test("WI-074 — flip generalizes to shapes; qr is rejected", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-flip-generic" });

  const shapeId = await addKind(page, "shape");
  expect(await flip(page, shapeId, "horizontal")).toBe(true);
  await expect.poll(() => readFlip(page, shapeId)).toEqual({ flipH: true, flipV: false });

  const qrId = await addKind(page, "qr");
  expect(await flip(page, qrId, "horizontal")).toBe(false); // flip-not-supported
  expect(await readFlip(page, qrId)).toBeNull();
});

test("WI-074 — frame flip is display-only (content mirrored + pointer-events:none)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-flip-frame" });
  const frameId = await addKind(page, "frame");

  expect(await flip(page, frameId, "horizontal")).toBe(true);
  await expect.poll(() => readFlip(page, frameId)).toEqual({ flipH: true, flipV: false });

  // The frame's content is mirrored AND made non-interactive (display-only).
  const wrapper = page.locator(`[data-frame-id="${frameId}"] div[style*="scaleX(-1)"]`).first();
  await expect.poll(() => wrapper.count()).toBeGreaterThan(0);
  expect(await wrapper.getAttribute("style")).toContain("pointer-events");
});

test("WI-074 — crop mode suspends editor hotkeys; restored after exit (Step 5 gate)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-074-gate" });
  const id = await addImage(page);
  const before = await descendantCount(page);

  // In crop mode the `r` tool hotkey must NOT add a rectangle.
  await page.locator(`[data-frame-id="${id}"]`).dblclick();
  await expect(page.getByTestId("image-crop-editor")).toBeVisible();
  await page.keyboard.press("r");
  await page.waitForTimeout(140);
  expect(await descendantCount(page)).toBe(before);

  // After exit, the same hotkey works again.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("image-crop-editor")).toHaveCount(0);
  await page.keyboard.press("r");
  await expect.poll(() => descendantCount(page)).toBeGreaterThan(before);
});
