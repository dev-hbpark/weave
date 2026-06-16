// WI-239 Phase 1 — present-mode whiteboard ink e2e.
//
// Covers the three things unit tests can't: (1) the regression guard that
// present nav is untouched while ink is OFF, (2) drawing produces a real
// SVG mark anchored in the design plane, (3) the blank board toggles and
// accepts ink. Strokes are ephemeral (DR-154) — no persistence assertions.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** Create a slide-deck via the wizard WITHOUT the shared helper's
 *  `waitForLoadState("networkidle")` step. In this sandbox the offline-forced
 *  navigator + vendored-engine @fs request frequently never lets the page go
 *  network-idle (documented baseline — see WI-153 notes), which times out
 *  `prepareDesign` before the feature is ever exercised. The meaningful
 *  readiness signal is the editor handshake (`__weaveEditor/__weaveDoc/
 *  __weaveVm`); we gate on that and skip networkidle. */
async function createDeckNoIdle(page: Page, title: string): Promise<string> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
  });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("weave.dev.unlock-flavors", "1"));
  await page.getByTestId("landing-new-design").click();
  const titleInput = page.getByTestId("new-design-title");
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(title);
  await page.getByTestId("new-design-flavor-slide-deck").click();
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
  const match = new URL(page.url()).pathname.match(/^\/design\/([^/]+)$/);
  if (match === null) throw new Error(`unexpected URL: ${page.url()}`);
  return match[1] as string;
}

/** Enter present mode on a slide deck with one slide to draw on. */
async function enterPresent(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await createDeckNoIdle(page, "Ink E2E");
  await addFrame(page, "slide", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } });
  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("ink-toolbar")).toBeVisible();
}

test("ink mode gate: slide layer is pointer-inert when off, armed when on", async ({ page }) => {
  await enterPresent(page);

  // The slide ink layer exists but is pointer-transparent while ink is OFF, so
  // it cannot intercept present input (the R3 regression guard — DR-154). The
  // CSS `pointer-events: none` is the structural proof; `data-ink-enabled` is
  // the single-source gate's projection.
  const slideLayer = page.locator('[data-ink-layer^="slide:"]');
  await expect(slideLayer).toHaveAttribute("data-ink-enabled", "false");
  await expect(slideLayer).toHaveCSS("pointer-events", "none");

  // Engaging ink arms the layer; disengaging returns it to inert.
  await page.getByTestId("ink-toggle").click();
  await expect(slideLayer).toHaveAttribute("data-ink-enabled", "true");
  await expect(slideLayer).toHaveCSS("pointer-events", "auto");

  await page.getByTestId("ink-toggle").click();
  await expect(slideLayer).toHaveAttribute("data-ink-enabled", "false");
  await expect(slideLayer).toHaveCSS("pointer-events", "none");
});

test("ink ON: drawing on the slide produces a stroke; undo removes it", async ({ page }) => {
  await enterPresent(page);

  await page.getByTestId("ink-toggle").click();
  const slideLayer = page.locator('[data-ink-layer^="slide:"]');
  await expect(slideLayer).toHaveAttribute("data-ink-enabled", "true");

  // Draw a short stroke across the middle of the viewport.
  const box = await slideLayer.boundingBox();
  if (box === null) throw new Error("slide ink layer has no box");
  const cy = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, cy, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.6, cy, { steps: 6 });
  await page.mouse.up();

  // A path (multi-point) mark now lives in the slide layer's SVG.
  const marks = slideLayer.locator("svg path, svg circle");
  await expect(marks).toHaveCount(1);

  // Undo clears it.
  await page.getByTestId("ink-undo").click();
  await expect(marks).toHaveCount(0);
});

test("blank board: toggles open, accepts ink, and closes", async ({ page }) => {
  await enterPresent(page);

  await page.getByTestId("ink-toggle").click();
  await page.getByTestId("ink-board-toggle").click();
  const board = page.getByTestId("ink-board");
  await expect(board).toBeVisible();

  // While the board is open the slide layer is inert (board owns input).
  await expect(page.locator('[data-ink-layer^="slide:"]')).toHaveAttribute(
    "data-ink-enabled",
    "false",
  );

  const boardLayer = board.locator("[data-ink-layer]");
  const box = await boardLayer.boundingBox();
  if (box === null) throw new Error("board ink layer has no box");
  const cy = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.3, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, cy, { steps: 8 });
  await page.mouse.up();
  await expect(boardLayer.locator("svg path, svg circle")).toHaveCount(1);

  // Toggle the board off — overlay gone, slide layer re-armed.
  await page.getByTestId("ink-board-toggle").click();
  await expect(page.getByTestId("ink-board")).toHaveCount(0);
  await expect(page.locator('[data-ink-layer^="slide:"]')).toHaveAttribute(
    "data-ink-enabled",
    "true",
  );
});
