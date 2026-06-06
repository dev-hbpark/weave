// WI-111 — 아쿠 activity-driven roam/idle/sleep e2e (offline-verifiable).
//
// The single launcher Aku's auto-behaviour is driven by REAL user editing
// activity (pointer/keyboard), owned by useAkuRoam:
//   - user editing → sit IDLE at home (top-left, ~16,72),
//   - user goes quiet → wander to random viewport points,
//   - quiet ≥ 1 min → doze in place (sleeping mood → idle sprite for now),
//   - editing resumes → glide back home, idle.
// This spec covers the fast transitions (editing↔roaming↔home) with real timers.
// The 1-minute doze boundary is the SAME dt-based code path, verified separately
// via a long-run diagnostic (see WI-111 Verification); kept out of the routine
// suite so it doesn't add a minute to every run.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function mountAku(page: Page): Promise<void> {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-Roam-E2E" });
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
  // Dismiss the first-run coachmark — while it shows, roaming is intentionally
  // paused (it anchors to the launcher). Storage was cleared, so it always shows.
  await expect(page.getByText("아쿠에게 맡겨보세요")).toBeVisible({ timeout: 6000 });
  await page.getByRole("button", { name: "알겠어요" }).click();
  await expect(page.getByText("아쿠에게 맡겨보세요")).toHaveCount(0);
}

async function launcherXY(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator("[data-aku-launcher]").boundingBox();
  return { x: box?.x ?? -1, y: box?.y ?? -1 };
}

// A keystroke the watcher counts as "user editing" (not on the Aku surface).
async function edit(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
}

test("user editing keeps Aku home; going quiet starts it roaming; resuming editing brings it home", async ({
  page,
}) => {
  await mountAku(page);

  // 1) Editing → idle at home (top-left). Recent activity pins it there.
  await edit(page);
  await expect.poll(() => launcherXY(page).then((p) => p.x), { timeout: 6000 }).toBeLessThan(160);
  // and it is NOT dozing right after activity.
  await expect(page.locator("[data-aku-launcher] [data-mood]")).not.toHaveAttribute(
    "data-mood",
    "sleeping",
  );

  // 2) Go quiet → after the edit-settle window it wanders well away from home.
  // Track the MAX displacement across a sampling loop (not a single poll instant):
  // a random hop can briefly land near home, so we assert it got far at some point.
  const home = await launcherXY(page);
  let maxD = 0;
  const deadline = Date.now() + 16_000;
  while (Date.now() < deadline && maxD <= 120) {
    await page.waitForTimeout(300);
    const p = await launcherXY(page);
    maxD = Math.max(maxD, Math.hypot(p.x - home.x, p.y - home.y));
  }
  expect(maxD).toBeGreaterThan(120);

  // 3) Resume editing → it glides back home and waits.
  await edit(page);
  await expect.poll(() => launcherXY(page).then((p) => p.x), { timeout: 8000 }).toBeLessThan(160);
});
