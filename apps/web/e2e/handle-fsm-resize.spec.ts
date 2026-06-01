// WI-067 P3 — resize handle drives the UNIFORM handle-interaction pipeline
// (DR-032): pointerdown on the handle → FrameStage dispatcher → frame-resize
// gesture (FSM) → sink → frameAccess.computeResize + commitFrame → doc → render.
//
// The legacy `frame-handles.spec.ts` mouse-at-bbox-center probe is flaky in
// headless (the 8–10px handle isn't reliably hit by elementsFromPoint) — that
// limitation predates this work and is identical for the old GestureRouter.
// Here we drive the SAME production path deterministically by dispatching real
// pointer events (pointerdown on the handle element so the dispatcher resolves
// it; pointermove on document where the gesture runner listens).

import { expect, type Page, test } from "@playwright/test";
import { prepareDesign } from "./helpers";

async function frameWH(page: Page, id: string): Promise<{ w: number; h: number } | null> {
  return page.evaluate((cid) => {
    type N = {
      id: unknown;
      attrs?: { frame?: { width?: number; height?: number } };
      children?: ReadonlyArray<N>;
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    const find = (ns: ReadonlyArray<N>): N | undefined => {
      for (const n of ns) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    const f = find(w.__weaveDoc?.root.children ?? [])?.attrs?.frame;
    return f === undefined ? null : { w: f.width ?? 0, h: f.height ?? 0 };
  }, id);
}

test("WI-067 P3 — se resize handle changes the frame's width/height via the FSM; Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "canvas-board" });
  const frame = page.locator("[data-frame-id]").first();
  await frame.waitFor();
  const itemId = (await frame.getAttribute("data-frame-id")) as string;
  const fbox = await frame.boundingBox();
  if (fbox === null) throw new Error("no frame box");

  // Select the frame so its handles mount.
  await page.mouse.click(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);
  const se = page.getByRole("button", { name: "Resize se", exact: true }).first();
  await expect(se).toBeVisible();
  const sbox = await se.boundingBox();
  if (sbox === null) throw new Error("no handle box");
  const cx = sbox.x + sbox.width / 2;
  const cy = sbox.y + sbox.height / 2;

  const before = await frameWH(page, itemId);
  if (before === null) throw new Error("frame gone");

  // pointerdown ON the handle → FrameStage capture dispatcher resolves it.
  await se.dispatchEvent("pointerdown", { clientX: cx, clientY: cy, button: 0, bubbles: true });
  // Drag se outward (grow) — moves on document, where the gesture runner listens.
  for (let i = 1; i <= 6; i++) {
    await page.evaluate(
      ({ x, y }) => {
        document.dispatchEvent(
          new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
        );
      },
      { x: cx + 18 * i, y: cy + 14 * i },
    );
  }
  await page.evaluate(
    ({ x, y }) => {
      document.dispatchEvent(
        new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true }),
      );
    },
    { x: cx + 18 * 6, y: cy + 14 * 6 },
  );
  await page.waitForTimeout(100);

  const after = await frameWH(page, itemId);
  if (after === null) throw new Error("frame gone after resize");
  // se drag grows width + height — the FSM pipeline applied computeResize.
  expect(after.w + after.h).toBeGreaterThan(before.w + before.h + 0.001);

  // One undo reverts the whole drag (mergeKey folded the 60Hz moves).
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => {
      const r = await frameWH(page, itemId);
      return r === null ? -1 : Math.abs(r.w - before.w) + Math.abs(r.h - before.h);
    })
    .toBeLessThan(0.001);
});
