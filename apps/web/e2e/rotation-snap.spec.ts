// WI-074 — rotation snap guide + Shift 10° step on the rotate handle.
// Covers the NORMAL frame rotate handle here; the crop straighten handle shares
// the same snapRotation() core (unit-tested) and its 360° drag is in
// image-crop.spec.ts. Both publish the `rotation-snap-guide` overlay.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const deg = (d: number): number => (d * Math.PI) / 180;

async function addImage(page: Page): Promise<string> {
  const id = await page.evaluate((src) => {
    const w = window as unknown as {
      __weaveEditor: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc: { root: { id: unknown } };
    };
    return String(
      w.__weaveEditor.exec("weave.item.add", {
        kind: "image",
        containerId: String(w.__weaveDoc.root.id),
        frame: { x: 0.35, y: 0.35, width: 0.3, height: 0.3, rotation: 0 },
        attrsOverride: { src },
      }).value,
    );
  }, PNG);
  await page.waitForTimeout(120);
  return id;
}

async function readRotation(page: Page, itemId: string): Promise<number> {
  return page.evaluate((cid) => {
    interface N {
      id: string | number;
      attrs: { frame?: { rotation?: number } };
      children: ReadonlyArray<N>;
    }
    const doc = (window as unknown as { __weaveDoc: { root: N } }).__weaveDoc;
    const find = (n: N): N | null => {
      if (String(n.id) === cid) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    };
    return find(doc.root)?.attrs.frame?.rotation ?? 0;
  }, itemId);
}

/** Drag the rotate handle by `delta` radians around the frame center, in `steps`
 *  moves, optionally holding Shift. Leaves the button DOWN if `release` is false. */
async function rotateBy(
  page: Page,
  id: string,
  delta: number,
  opts: { shift?: boolean; release?: boolean; steps?: number } = {},
): Promise<void> {
  const { shift = false, release = true, steps = 20 } = opts;
  const fb = await page.locator(`[data-frame-id="${id}"]`).boundingBox();
  const rot = page
    .locator(`[data-selection-handle-item-id="${id}"] [data-handle-kind="rotation"]`)
    .first();
  await expect.poll(() => rot.count()).toBeGreaterThan(0);
  const rb = await rot.boundingBox();
  if (fb === null || rb === null) throw new Error("missing boxes");
  const cx = fb.x + fb.width / 2;
  const cy = fb.y + fb.height / 2;
  const hx = rb.x + rb.width / 2;
  const hy = rb.y + rb.height / 2;
  const r = Math.hypot(hx - cx, hy - cy);
  const a0 = Math.atan2(hy - cy, hx - cx);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  if (shift) await page.keyboard.down("Shift");
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (delta * i) / steps;
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  if (release) {
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
  }
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("WI-074 — frame rotate snaps to a cardinal (≈90°) and shows the guide", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "rotsnap-cardinal" });
  const id = await addImage(page);
  await page.locator(`[data-frame-id="${id}"]`).click();

  // Drag to ~87° — inside the 5° threshold of 90°, so it locks to exactly 90°.
  await rotateBy(page, id, deg(87), { release: false });
  // Guide is visible mid-drag while locked to a cardinal.
  await expect(page.getByTestId("rotation-snap-guide")).toBeVisible();
  expect(await page.getByTestId("rotation-snap-guide").getAttribute("data-snap-deg")).toBe("90");
  await page.mouse.up();

  const rotation = await readRotation(page, id);
  expect(Math.abs(Math.abs(rotation) - Math.PI / 2)).toBeLessThan(deg(1));
  // Guide clears on release.
  await expect(page.getByTestId("rotation-snap-guide")).toHaveCount(0);
});

test("WI-074 — frame rotate with Shift quantizes to 10° (no cardinal guide)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "rotsnap-shift" });
  const id = await addImage(page);
  await page.locator(`[data-frame-id="${id}"]`).click();

  // ~34° with Shift → 30°. (Without the feature it would be ~34°.)
  await rotateBy(page, id, deg(34), { shift: true });
  const rotation = await readRotation(page, id);
  expect((Math.abs(rotation) * 180) / Math.PI).toBeCloseTo(30, 0);
});

test("WI-074 — free rotate (no Shift, off-cardinal) does NOT snap or show a guide", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "rotsnap-free" });
  const id = await addImage(page);
  await page.locator(`[data-frame-id="${id}"]`).click();

  await rotateBy(page, id, deg(40), { release: false });
  await expect(page.getByTestId("rotation-snap-guide")).toHaveCount(0);
  await page.mouse.up();
  const rotation = await readRotation(page, id);
  // ~40°, untouched (well outside the 5° cardinal threshold).
  expect((Math.abs(rotation) * 180) / Math.PI).toBeGreaterThan(34);
  expect((Math.abs(rotation) * 180) / Math.PI).toBeLessThan(46);
});
