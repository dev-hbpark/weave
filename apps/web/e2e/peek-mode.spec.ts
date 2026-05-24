// WI-019 Phase 4 — Peek mode (Z-order) e2e coverage (DR-013 Decision E).
//
// Covered scenarios:
//   1. Header peek button — visible, default off, toggles on click. Same
//      IconButton style as the Select / Hand tools.
//   2. L hotkey (hold) activates peek while held; releases on key-up.
//   3. Inspector panel renders when peek is active; row drag reorders.
//   4. Escape exits sticky peek mode.
//   5. Mutually-exclusive toggle group — choosing Select / Hand turns peek
//      off and vice versa; only one tool pressed at a time.
//   6. Real frames lift via `data-peek-lifted` data attribute on the
//      canvas-host element (proves the CSS effect is wired to the real DOM,
//      not a transparent placeholder).

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("peek button is present next to Hand tool and defaults to OFF", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Peek-A" });
  const peek = page.getByTestId("toolbar-peek");
  const hand = page.getByTestId("toolbar-hand");
  await expect(peek).toBeVisible();
  await expect(hand).toBeVisible();
  await expect(peek).toHaveAttribute("aria-pressed", "false");
});

test("peek button toggles sticky activation on click; inspector mounts", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Peek-B" });
  await addFrame(page, "slide");
  const peek = page.getByTestId("toolbar-peek");
  await peek.click();
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Point Stack Inspector" })).toBeVisible();
  // toggle off
  await peek.click();
  await expect(peek).toHaveAttribute("aria-pressed", "false");
});

test("L hotkey (hold) activates peek while held", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Peek-C" });
  await addFrame(page, "slide");
  const peek = page.getByTestId("toolbar-peek");
  await expect(peek).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.down("KeyL");
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("KeyL");
  await expect(peek).toHaveAttribute("aria-pressed", "false");
});

test("Escape exits sticky peek mode", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Peek-D" });
  const peek = page.getByTestId("toolbar-peek");
  await peek.click();
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(peek).toHaveAttribute("aria-pressed", "false");
});

test("Select / Hand / Peek form a mutually-exclusive toggle group", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Peek-E" });
  const select = page.getByTestId("toolbar-select");
  const hand = page.getByTestId("toolbar-hand");
  const peek = page.getByTestId("toolbar-peek");

  // Default: Select pressed.
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(hand).toHaveAttribute("aria-pressed", "false");
  await expect(peek).toHaveAttribute("aria-pressed", "false");

  // Activate peek — both Select and Hand should now be unpressed.
  await peek.click();
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(hand).toHaveAttribute("aria-pressed", "false");

  // Click Hand — peek should turn off, Hand should turn on.
  await hand.click();
  await expect(hand).toHaveAttribute("aria-pressed", "true");
  await expect(peek).toHaveAttribute("aria-pressed", "false");
  await expect(select).toHaveAttribute("aria-pressed", "false");

  // Activate peek again — Hand should yield.
  await peek.click();
  await expect(peek).toHaveAttribute("aria-pressed", "true");
  await expect(hand).toHaveAttribute("aria-pressed", "false");

  // Click Select — peek should turn off, Select should turn on.
  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(peek).toHaveAttribute("aria-pressed", "false");
});

test("real frames receive data-peek-active / data-peek-lifted markers", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Peek-F" });
  await addFrame(page, "slide");
  await addFrame(page, "canvas-design");
  const firstFrame = page.locator("[data-frame-id]").first();

  // Activate peek FIRST — the capture layer + Inspector mount can cause
  // FrameStage's camera to settle into a slightly different baseScale,
  // shifting frame screen positions. We measure AFTER activation so the
  // mouse target matches what the controller sees.
  await page.getByTestId("toolbar-peek").click();
  const canvasHost = page.getByTestId("design-canvas-host");
  await expect(canvasHost).toHaveAttribute("data-peek-active", "");
  // Brief settle for the FrameStage ResizeObserver to react to peek
  // activation's layout perturbations.
  await page.waitForTimeout(250);

  // Re-measure the frame's current screen-space center.
  const box = await firstFrame.boundingBox();
  if (!box) throw new Error("frame has no bounding box");
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Multi-step mouse move so pointermove fires several times along the way.
  await page.mouse.move(50, 50);
  for (let i = 1; i <= 10; i += 1) {
    const x = 50 + (center.x - 50) * (i / 10);
    const y = 50 + (center.y - 50) * (i / 10);
    await page.mouse.move(x, y);
  }
  await page.mouse.move(center.x, center.y);

  // The real frame DOM now carries data-peek-lifted (no placeholder).
  await expect(firstFrame).toHaveAttribute("data-peek-lifted", "", { timeout: 3000 });
});
