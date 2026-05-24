import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 12b — selected frames carry a SelectionLayer; move / resize / rotate
// the frame just like a canvas shape. Position commits to attrs.frame.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function readFrame(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    type ItemFrame = { x: number; y: number; width: number; height: number; rotation: number };
    type Item = { kind: string; attrs: { frame?: ItemFrame } };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    return doc.root.children[0]?.attrs.frame ?? null;
  });
}

test("selecting a frame shows resize + rotation handles", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");

  // Selecting the slide should reveal the handles.
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  const dirs = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  for (const dir of dirs) {
    await expect(page.getByRole("button", { name: `Resize ${dir}`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Rotate selection" })).toBeVisible();
  // SelectionLayer no longer renders its own "Move selection" body button:
  // move drag is initiated by the underlying frame's pointerdown so the
  // floating chrome can stay pointer-transparent and let inner items
  // (shapes, contenteditable) receive their own clicks.
});

test("move drag updates the frame's x/y (0..1 ratio)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");

  const orig = await readFrame(page);
  expect(orig).not.toBeNull();
  if (orig === null) return;

  // First-press flow: a pointerdown on the frame body both selects the
  // frame and starts the move drag — no need to click first and grab a
  // separate move handle.
  //
  // Drive the gesture by dispatching pointer events directly on the frame
  // element rather than `page.mouse.move + down` against a measured
  // bounding box. The design plane mounts behind a ResizeObserver-driven
  // base-scale recompute (FrameStage.tsx:1004-1015): immediately after
  // `addFrame` the box returned by Playwright can still be the
  // pre-resize layout, and by the time `mouse.move` lands the frame has
  // shifted, putting the press on bare design plane (which then starts
  // the rubber-band gesture instead of a frame drag). Dispatching the
  // pointer events on the frame's own DOM node sidesteps that race: the
  // events go to the motion.div regardless of where it ends up
  // visually, and the post-press setPointerCapture in
  // NestedFrame.startMove takes over for the subsequent moves.
  const frame = page.locator('[data-frame-id]').first();
  // Wait for the frame's box to stabilise before measuring — two equal
  // reads ≈ ResizeObserver / layout have settled. This avoids the
  // pre-resize / post-resize race noted above.
  await page.waitForFunction(
    () => {
      const el = document.querySelector("[data-frame-id]");
      if (el === null) return false;
      const r = el.getBoundingClientRect();
      const w = (window as unknown as { __frameStableW?: number }).__frameStableW;
      (window as unknown as { __frameStableW?: number }).__frameStableW = r.width;
      return typeof w === "number" && Math.abs(w - r.width) < 0.5 && r.width > 10;
    },
    null,
    { timeout: 5000 },
  );
  const box = await frame.boundingBox();
  if (box === null) throw new Error("frame has no bounding box");

  const startX = box.x + 4;
  const startY = box.y + 4;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(startX + (60 * i) / 6, startY + (45 * i) / 6);
  }
  await page.mouse.up();

  const moved = await readFrame(page);
  if (moved === null) throw new Error("frame disappeared after move");
  expect(moved.x).toBeGreaterThan(orig.x + 0.005);
  expect(moved.y).toBeGreaterThan(orig.y + 0.005);
});
