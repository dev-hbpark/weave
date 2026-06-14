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

test("resizing inside a ROTATED parent grows width along the parent's local x", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // Outer frame O rotated 90°, inner frame I inside it. The item's east handle
  // therefore points screen-VERTICAL; dragging it must still grow the item's
  // (parent-local) width. Without the rotation-aware delta the east drag has a
  // zero local-x component → the item wouldn't resize at all.
  const O = await addFrame(page, rootId, {
    x: 0.25,
    y: 0.2,
    width: 0.4,
    height: 0.4,
    rotation: Math.PI / 2,
  });
  const I = await addFrame(page, O, { x: 0.1, y: 0.1, width: 0.4, height: 0.4, rotation: 0 });

  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, I);

  const frameRatio = async (): Promise<{ width: number; height: number }> =>
    page.evaluate((id) => {
      let f: { width: number; height: number } | undefined;
      const walk = (n: N & { attrs?: { frame?: { width: number; height: number } } }) => {
        if (String(n.id) === id) f = n.attrs?.frame;
        for (const c of n.children) walk(c as never);
      };
      walk((window as unknown as W).__weaveDoc.root as never);
      return { width: f?.width ?? 0, height: f?.height ?? 0 };
    }, I);

  const east = page.locator(`[data-selection-handle-item-id="${I}"] [data-handle-dir="e"]`).first();
  await expect.poll(() => east.count()).toBeGreaterThan(0);
  const itemBox = await page.locator(`[data-frame-id="${I}"]`).first().boundingBox();
  const hb = await east.boundingBox();
  if (itemBox === null || hb === null) throw new Error("no boxes");

  const before = await frameRatio();

  // Drag the handle further along the item-center → handle direction (the item's
  // rendered local +x, screen-vertical for a 90° parent), by ~120 screen px.
  const cx0 = itemBox.x + itemBox.width / 2;
  const cy0 = itemBox.y + itemBox.height / 2;
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  const len = Math.hypot(hx - cx0, hy - cy0) || 1;
  const ux = (hx - cx0) / len;
  const uy = (hy - cy0) / len;
  const D = 120;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + ux * D, hy + uy * D, { steps: 12 });
  await page.mouse.up();

  const after = await frameRatio();
  const msg = `before=${JSON.stringify(before)} after=${JSON.stringify(after)} u=(${ux.toFixed(2)},${uy.toFixed(2)})`;
  // Width (parent-local ratio) grows; height stays ~constant (pure east drag in
  // local space). Without the rotation-aware delta, the width delta would be ~0.
  expect(after.width - before.width, msg).toBeGreaterThan(0.05);
  expect(Math.abs(after.height - before.height), msg).toBeLessThan(0.02);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("MOVING a child of a ROTATED parent follows the cursor (no drift)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // O rotated 90°, child I inside. Dragging I screen-RIGHT must move it
  // screen-right (follow the cursor). Without de-rotating the delta into the
  // parent's local axes, I would drift screen-DOWN (the parent's local +x).
  const O = await addFrame(page, rootId, {
    x: 0.3,
    y: 0.25,
    width: 0.3,
    height: 0.3,
    rotation: Math.PI / 2,
  });
  const I = await addFrame(page, O, { x: 0.3, y: 0.3, width: 0.3, height: 0.3, rotation: 0 });

  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, I);

  const centerOf = async (): Promise<{ x: number; y: number }> => {
    const b = await page.locator(`[data-frame-id="${I}"]`).first().boundingBox();
    if (b === null) throw new Error("no I box");
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const before = await centerOf();

  // Drag I's body screen-RIGHT by D.
  const D = 120;
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + D, before.y, { steps: 14 });
  await page.mouse.up();

  const after = await centerOf();
  const dxScreen = after.x - before.x;
  const dyScreen = after.y - before.y;
  const msg = `dxScreen=${dxScreen} dyScreen=${dyScreen} expected≈(${D},0)`;
  // Follows the cursor: screen-x tracks the drag, screen-y barely moves. With
  // the bug the item drifted screen-DOWN instead (dxScreen≈0, dyScreen≈D).
  expect(dxScreen, msg).toBeGreaterThan(D * 0.7);
  expect(Math.abs(dyScreen), msg).toBeLessThan(D * 0.3);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("Shift+corner aspect-lock holds on a ROTATED item", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // A 45°-rotated item (aspect 2:1). Shift+corner must preserve the aspect ratio
  // (nw/nh == ow/oh) AND grow it — the WI-218 de-rotation feeds the local delta
  // into the aspect-lock step, so it works under rotation.
  const I = await addFrame(page, rootId, {
    x: 0.3,
    y: 0.3,
    width: 0.4,
    height: 0.2,
    rotation: Math.PI / 4,
  });

  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, I);

  const frameRatio = async (): Promise<{ width: number; height: number }> =>
    page.evaluate((id) => {
      let f: { width: number; height: number } | undefined;
      const walk = (n: N & { attrs?: { frame?: { width: number; height: number } } }) => {
        if (String(n.id) === id) f = n.attrs?.frame;
        for (const c of n.children) walk(c as never);
      };
      walk((window as unknown as W).__weaveDoc.root as never);
      return { width: f?.width ?? 0, height: f?.height ?? 0 };
    }, I);

  const before = await frameRatio();
  const aspectBefore = before.width / before.height; // ≈ 2 (0.4 / 0.2)

  const se = page.locator(`[data-selection-handle-item-id="${I}"] [data-handle-dir="se"]`).first();
  await expect.poll(() => se.count()).toBeGreaterThan(0);
  const itemBox = await page.locator(`[data-frame-id="${I}"]`).first().boundingBox();
  const hb = await se.boundingBox();
  if (itemBox === null || hb === null) throw new Error("no boxes");

  // Drag the SE corner outward (item-center → handle direction) with Shift held.
  const cx = itemBox.x + itemBox.width / 2;
  const cy = itemBox.y + itemBox.height / 2;
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  const len = Math.hypot(hx - cx, hy - cy) || 1;
  const D = 120;
  await page.keyboard.down("Shift");
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + ((hx - cx) / len) * D, hy + ((hy - cy) / len) * D, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  const after = await frameRatio();
  const aspectAfter = after.width / after.height;
  const msg = `before=${JSON.stringify(before)} after=${JSON.stringify(after)} aspect ${aspectBefore}→${aspectAfter}`;
  expect(after.width, msg).toBeGreaterThan(before.width); // grew
  // Aspect ratio preserved under rotation (Shift lock); ~5% tolerance.
  expect(aspectAfter, msg).toBeGreaterThan(aspectBefore * 0.95);
  expect(aspectAfter, msg).toBeLessThan(aspectBefore * 1.05);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
