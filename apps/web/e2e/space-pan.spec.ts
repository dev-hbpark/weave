// WI-018 follow-up — Space+drag pans the infinite canvas.
//
// Background: FrameStage's Space-down handler flips `vm.mode` to
// "hand" (cursor: grab, rubber-band hover hint stands down). When the
// user then starts dragging, PanBinding tries to claim mode "panning".
// Pre-fix, `vm.requestMode` rejected this transition because non-idle
// modes were exclusive — the gesture was silently dropped. Fix: vm
// whitelists the `hand → panning` promotion and restores "hand" on
// release.

import { expect, test } from "@playwright/test";
import { prepareDesign } from "./helpers";

test("Space+drag pans the camera on the infinite canvas", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  const stage = page.locator('[data-testid="frame-stage"]');
  const sbox = await stage.boundingBox();
  if (sbox === null) throw new Error("no stage box");

  const readPanTransform = async () =>
    await page.evaluate(() => {
      // The pan layer is the outermost transform-bearing div inside
      // the frame-stage. We look for `matrix(1, 0, 0, 1, tx, ty)` —
      // identity scale, pure translate — that's the pan transform.
      const stage = document.querySelector('[data-testid="frame-stage"]') as HTMLElement | null;
      if (stage === null) return null;
      const all: string[] = [];
      const walk = (el: HTMLElement) => {
        const t = window.getComputedStyle(el).transform;
        if (t !== "none") all.push(t);
        for (const c of Array.from(el.children)) walk(c as HTMLElement);
      };
      walk(stage);
      return all.find((t) => /^matrix\(1,\s*0,\s*0,\s*1,/.test(t)) ?? null;
    });

  const before = await readPanTransform();

  await page.keyboard.down("Space");
  await page.waitForTimeout(80);
  // Cursor should switch to grab when Space-armed.
  const armedCursor = await page.evaluate(
    () =>
      window.getComputedStyle(document.querySelector('[data-testid="frame-stage"]') as HTMLElement)
        .cursor,
  );
  expect(armedCursor).toBe("grab");

  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(sbox.x + sbox.width / 2 + 20 * i, sbox.y + sbox.height / 2 + 15 * i);
  }
  await page.mouse.up();
  await page.keyboard.up("Space");
  await page.waitForTimeout(120);

  const after = await readPanTransform();
  expect(after).not.toBeNull();
  // Identity matrix → moved-by-120,90 matrix.
  const m = after?.match(/matrix\(1,\s*0,\s*0,\s*1,\s*([-\d.]+),\s*([-\d.]+)\)/);
  expect(m).not.toBeNull();
  const tx = Number.parseFloat(m?.[1] ?? "0");
  const ty = Number.parseFloat(m?.[2] ?? "0");
  // Drag delta = 120 × 90; pan should match to within a few pixels.
  expect(Math.abs(tx - 120)).toBeLessThan(5);
  expect(Math.abs(ty - 90)).toBeLessThan(5);
  void before;
});
