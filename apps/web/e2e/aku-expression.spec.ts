// WI-103 → WI-104 — 아쿠 expression layer e2e (offline-verifiable subset).
//
// Aku's launcher mascot is driven by @agocraft/sprite-engine (WI-104). The engine
// picks the best tier: in headless CI there's no real GPU, but WebGL2 is available
// (swiftshader), so the **Worker + OffscreenCanvas + WebGL2** GPU tier (DR-045)
// serves — proving the off-main-thread render end-to-end: vendored wasm → vite →
// worker → WebGL2, driven by the same Rust→wasm timeline every tier shares. If
// neither GPU nor Canvas2D could bind, the engine returns null and Aku degrades to
// the CSS fallback tier. The WebGPU pixel path is a real-GPU manual gate.
//
// Because the GPU tier transfers the canvas to the worker, pixels aren't readable
// on the main thread — motion is observed via the engine's tier-agnostic frame
// telemetry, mirrored onto the wrapper's data-frame. Mood TRANSITIONS are
// agent-run-state driven and live in the server-dependent suite (aku-chat.spec).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function mountCollapsedAku(page: Page): Promise<void> {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-Expr-E2E" });
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
  // Dismiss the first-run coachmark so the launcher settles into a stable branch.
  // Otherwise it appears ~800ms in and remounts the launcher (recreating the
  // engine + resetting its frame counter) mid-measurement.
  const ack = page.getByRole("button", { name: "알겠어요" });
  if (await ack.isVisible({ timeout: 4000 }).catch(() => false)) {
    await ack.click();
    await expect(page.getByText("아쿠에게 맡겨보세요")).toHaveCount(0);
  }
}

function frame(page: Page): Promise<number> {
  return page
    .locator("[data-aku-launcher] [data-mood]")
    .getAttribute("data-frame")
    .then((v) => Number(v ?? "0"));
}

test("collapsed launcher renders the idle mascot, backed by the sprite engine", async ({
  page,
}) => {
  await mountCollapsedAku(page);
  const mascot = page.locator("[data-aku-launcher] [data-mood]");
  await expect(mascot).toBeVisible();
  await expect(mascot).toHaveAttribute("data-mood", "idle");

  // The vendored @agocraft/sprite-engine bound a real render tier (headless →
  // webgl2 worker; canvas2d/css are the fallbacks). data-aku-engine starts "init".
  await expect
    .poll(() => mascot.getAttribute("data-aku-engine"), { timeout: 8000 })
    .toMatch(/^(webgpu|webgl2|canvas2d)$/);
});

test("engine animates the mascot (frame telemetry advances)", async ({ page }) => {
  await mountCollapsedAku(page);
  await expect(page.locator("[data-aku-launcher] [data-mood]")).toBeAttached();

  // Once the wasm timeline + atlas are loaded, the render loop advances frames.
  // Poll for the advance (telemetry posts in batches; swiftshader can be slow).
  await expect.poll(() => frame(page), { timeout: 10_000 }).toBeGreaterThan(0);
  const a = await frame(page);
  await expect.poll(() => frame(page), { timeout: 6000 }).toBeGreaterThan(a);
});

test("reduced-motion freezes the mascot (no frame advance)", async ({ page }) => {
  // Load normally first (prepareDesign's networkidle wait dislikes a pre-set
  // emulateMedia), THEN switch to reduced-motion and reload so the engine
  // re-mounts under the preference. The reload reopens the offline design without
  // re-running prepareDesign.
  await mountCollapsedAku(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("[data-aku-launcher] [data-mood]")).toBeAttached();

  // Under reduced-motion the engine renders a single static frame and never runs
  // the loop. Assert the frame counter stays pinned low across time (a normal
  // animation would climb into the dozens). Bounded-low (not strict equality) so a
  // benign launcher remount resetting the counter to 0/1 doesn't flake the test.
  await page.waitForTimeout(1500);
  expect(await frame(page)).toBeLessThanOrEqual(2);
  await page.waitForTimeout(700);
  expect(await frame(page)).toBeLessThanOrEqual(2);
});
