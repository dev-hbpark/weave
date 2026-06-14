// Regression: resizing an item INSIDE a nested frame via its handle must track
// the pointer 1:1 in screen px. The flat scene renderer (WI-217/DR-138) makes
// every frame a sibling under the design plane, so `el.parentElement` is the
// plane for EVERY item — `parentRectOf` therefore returned the full design rect
// even for nested items, and `dx / parentWidth` divided by a too-large width →
// the item resized far less than the pointer moved. The fix resolves the LOGICAL
// parent from the doc and reads that frame's rendered rect.
//
// A correct resize: dragging the east handle by D screen px grows the item's
// on-screen width by ~D (zoom/nesting-independent), because
//   newWidthRatio = orig + D/parentScreen  ⇒  newScreenW = oldScreenW + D.
// With the bug (parent = plane) the growth was D × (parentScreen / planeScreen).
//
// Bootstraps without networkidle (the sandbox vite never settles).

import { expect, test } from "@playwright/test";

type W = {
  __weaveEditor: { exec: (n: string, i: unknown) => { ok: boolean; value?: string } };
  __weaveDoc: { root: { id: string | number; children: N[] } };
  __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
};
type N = { id: string | number; children: N[] };

async function bootstrap(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
    window.localStorage.setItem("weave.dev.unlock-flavors", "1");
  });
  await page.goto("/");
  await page.getByTestId("landing-new-design").click();
  await page.getByTestId("new-design-flavor-canvas-board").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();
  await page.waitForURL(/\/design\/[^/]+$/);
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __weaveEditor?: unknown;
      __weaveDoc?: unknown;
      __weaveVm?: unknown;
    };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined && w.__weaveVm !== undefined;
  });
  await page.locator('[data-design-plane="true"]').first().waitFor();
}

const allIds = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const walk = (n: N) => {
      out.push(String(n.id));
      for (const c of n.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return out;
  });

async function addFrame(
  page: import("@playwright/test").Page,
  containerId: string,
  frame: object,
): Promise<string> {
  const before = new Set(await allIds(page));
  await page.evaluate(
    ({ containerId, frame }) =>
      (window as unknown as W).__weaveEditor.exec("weave.item.add", {
        kind: "frame",
        containerId,
        frame,
      }),
    { containerId, frame },
  );
  await page.waitForFunction((n) => {
    const ids: string[] = [];
    const walk = (x: N) => {
      ids.push(String(x.id));
      for (const c of x.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return ids.length > n;
  }, before.size);
  const id = (await allIds(page)).find((x) => !before.has(x));
  if (id === undefined) throw new Error("no new id");
  return id;
}

test("resizing a nested item's handle tracks the pointer 1:1 in screen px", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // Outer frame O (half the design), inner frame I nested inside it.
  const O = await addFrame(page, rootId, { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 });
  const I = await addFrame(page, O, { x: 0.1, y: 0.1, width: 0.4, height: 0.4, rotation: 0 });

  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, I);

  const east = page.locator(`[data-selection-handle-item-id="${I}"] [data-handle-dir="e"]`).first();
  await expect.poll(() => east.count()).toBeGreaterThan(0);

  const widthOf = async (): Promise<number> => {
    const box = await page.locator(`[data-frame-id="${I}"]`).first().boundingBox();
    if (box === null) throw new Error("no I box");
    return box.width;
  };
  const before = await widthOf();

  const hb = await east.boundingBox();
  if (hb === null) throw new Error("no east handle");
  const D = 120; // screen px to drag right
  const cx = hb.x + hb.width / 2;
  const cy = hb.y + hb.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + D, cy, { steps: 12 });
  await page.mouse.up();

  const after = await widthOf();
  const delta = after - before;
  const msg = `before=${before} after=${after} delta=${delta} expected≈${D}`;
  // The item's on-screen width must grow by ~the pointer delta. With the bug
  // (parent = plane, O is half the design) the growth would be ~D×0.5 = 60.
  expect(delta, msg).toBeGreaterThan(D * 0.8); // 1:1 tracking (was ~0.5× when broken)
  expect(delta, msg).toBeLessThan(D * 1.2);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
