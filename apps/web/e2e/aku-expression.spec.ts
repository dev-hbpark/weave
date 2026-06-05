// WI-103 — 아쿠 expression layer e2e (offline-verifiable subset).
//
// The mood TRANSITIONS (thinking → working → finalizing → idle) are driven by
// the live reverse-MCP agent run-state, so — like the conversational assertions
// in aku-chat.spec — they require a running agent-server + model and live in the
// server-dependent suite (not run in offline CI). See FR-020 / DR-070.
//
// What's verifiable WITHOUT the agent and asserted here:
//   1. the collapsed launcher renders the expression-aware mascot at rest
//      (data-mood="idle") — i.e. the renderer seam is wired end-to-end;
//   2. the idle mascot animates by default, and STOPS under
//      prefers-reduced-motion: reduce (the hard accessibility gate, RISK_NOTES R5).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function mountCollapsedAku(page: Page): Promise<void> {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-Expr-E2E" });
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
}

test("collapsed launcher renders the idle expression mascot", async ({ page }) => {
  await mountCollapsedAku(page);
  const mascot = page.locator("[data-aku-launcher] [data-mood]");
  await expect(mascot).toBeVisible();
  await expect(mascot).toHaveAttribute("data-mood", "idle");
});

test("idle mascot animates by default and stops under reduced-motion", async ({ page }) => {
  await mountCollapsedAku(page);
  const animName = () =>
    page.evaluate(() => {
      const el = document.querySelector("[data-aku-launcher] .aku-expr");
      return el ? getComputedStyle(el).animationName : null;
    });

  // default: the idle bob animation is live
  expect(await animName()).not.toBe("none");
  expect(await animName()).not.toBeNull();

  // reduced-motion: every expression keyframe is disabled (animation: none)
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animName()).toBe("none");
});
