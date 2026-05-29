// Rotation bug fixes — two regressions pinned end-to-end.
//
// 1) Rotation pivot: dragging the rotation handle must track the mouse's
//    ANGLE around the item's on-screen center, not vertical motion. The
//    bug was a coordinate-space mismatch — the pivot was read in stage-
//    local (camera) space while the pointer arrives in client space, so
//    the pivot sat off by the stage's screen offset and the angle was
//    computed around the wrong point. Fixed by reading the rendered
//    element's client-rect center as the pivot.
//
// 2) Reparent rotation: moving an item between frames dropped
//    `frame.rotation`, so the item snapped back to 0°. Fixed by carrying
//    the (parent-rotation-compensated) angle into the new frame ratio.
//
// Both tests read `frame.rotation` from the document model (the source
// value), not the computed CSS matrix — that avoids the downstream
// matrix-shape flakiness that kept the older rotate e2e out of the suite.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, execReparent, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type FrameVal = { x: number; y: number; width: number; height: number; rotation?: number };

async function readRotationOf(page: import("@playwright/test").Page, id: string): Promise<number> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: string | number;
      readonly attrs: Record<string, unknown>;
      readonly children: ReadonlyArray<Node>;
    }
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    if (doc === undefined) return Number.NaN;
    function find(n: Node): Node | null {
      if (String(n.id) === targetId) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    }
    const node = find(doc.root);
    if (node === null) return Number.NaN;
    const f = (node.attrs as { frame?: { rotation?: number } }).frame;
    return f?.rotation ?? 0;
  }, id);
}

async function rootChildIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const doc = (
      window as unknown as {
        __weaveDoc?: { root: { children: ReadonlyArray<{ id: string | number }> } };
      }
    ).__weaveDoc;
    if (doc === undefined) return [];
    return doc.root.children.map((c) => String(c.id));
  });
}

async function setRotation(
  page: import("@playwright/test").Page,
  id: string,
  rotation: number,
): Promise<void> {
  await page.evaluate(
    ({ id, rotation }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      const w = window as unknown as { __weaveEditor?: Editor };
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: id,
        patch: (it: { attrs: { frame?: FrameVal } }) => ({
          ...it,
          attrs: { ...it.attrs, frame: { ...(it.attrs.frame as FrameVal), rotation } },
        }),
      });
    },
    { id, rotation },
  );
}

async function waitFrameStable(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector("[data-frame-id]");
      if (el === null) return false;
      const r = el.getBoundingClientRect();
      const prev = (window as unknown as { __frameStableW?: number }).__frameStableW;
      (window as unknown as { __frameStableW?: number }).__frameStableW = r.width;
      return typeof prev === "number" && Math.abs(prev - r.width) < 0.5 && r.width > 10;
    },
    null,
    { timeout: 5000 },
  );
}

test("rotation handle tracks the mouse angle around the item center", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");
  await waitFrameStable(page);

  const frame = page.locator("[data-frame-id]").first();
  await frame.click({ position: { x: 4, y: 4 } });
  const rotateBtn = page.getByRole("button", { name: "Rotate selection" });
  await expect(rotateBtn).toBeVisible();

  const fbox = await frame.boundingBox();
  const hbox = await rotateBtn.boundingBox();
  if (fbox === null || hbox === null) throw new Error("missing boxes");
  const C = { x: fbox.x + fbox.width / 2, y: fbox.y + fbox.height / 2 };
  const H = { x: hbox.x + hbox.width / 2, y: hbox.y + hbox.height / 2 };

  // Press the handle, then sweep the pointer to a known angle around C.
  const startAngle = Math.atan2(H.y - C.y, H.x - C.x);
  const R = Math.hypot(H.x - C.x, H.y - C.y);
  const delta = Math.PI / 3; // +60°
  const targetAngle = startAngle + delta;
  const T = { x: C.x + R * Math.cos(targetAngle), y: C.y + R * Math.sin(targetAngle) };

  await page.mouse.move(H.x, H.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(H.x + ((T.x - H.x) * i) / 8, H.y + ((T.y - H.y) * i) / 8);
  }
  await page.mouse.up();
  await page.waitForTimeout(80);

  const id = (await rootChildIds(page)).at(-1)!;
  const rot = await readRotationOf(page, id);
  // The applied rotation must equal the swept angle (±~3°). With the old
  // off-center pivot this same drag produced a very different angle.
  expect(rot).toBeCloseTo(delta, 1);
});

test("reparent preserves a rotated item's angle (no reset to 0)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  const before = await rootChildIds(page);
  await addFrame(page, "slide", {
    frame: { x: 0.45, y: 0.45, width: 0.2, height: 0.2, rotation: 0 },
  });
  const afterA = await rootChildIds(page);
  const aId = afterA.find((x) => !before.includes(x))!;
  await addFrame(page, "slide", {
    frame: { x: 0.05, y: 0.05, width: 0.35, height: 0.35, rotation: 0 },
  });
  const afterB = await rootChildIds(page);
  const bId = afterB.find((x) => !afterA.includes(x))!;

  const angle = 0.7;
  await setRotation(page, aId, angle);
  expect(await readRotationOf(page, aId)).toBeCloseTo(angle, 5);

  await execReparent(page, [{ itemId: aId, newParentId: bId }]);
  await page.waitForTimeout(60);

  // A and B both sit under the (unrotated) root, so A's own rotation must
  // carry over unchanged — and definitely not reset to 0.
  const after = await readRotationOf(page, aId);
  expect(after).toBeCloseTo(angle, 5);
  expect(Math.abs(after)).toBeGreaterThan(0.1);
});
