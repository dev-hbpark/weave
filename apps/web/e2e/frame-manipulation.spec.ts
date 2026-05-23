import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

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
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();

  // Selecting the slide should reveal the handles.
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  const dirs = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  for (const dir of dirs) {
    await expect(page.getByRole("button", { name: `Resize ${dir}`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Rotate selection" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move selection" })).toBeVisible();
});

test("move drag updates the frame's x/y (0..1 ratio)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });

  const orig = await readFrame(page);
  expect(orig).not.toBeNull();
  if (orig === null) return;

  const move = page.getByRole("button", { name: "Move selection" });
  const box = await move.boundingBox();
  if (box === null) throw new Error("move handle has no bounding box");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      box.x + box.width / 2 + (60 * i) / 6,
      box.y + box.height / 2 + (45 * i) / 6,
    );
  }
  await page.mouse.up();

  const moved = await readFrame(page);
  if (moved === null) throw new Error("frame disappeared after move");
  expect(moved.x).toBeGreaterThan(orig.x + 0.005);
  expect(moved.y).toBeGreaterThan(orig.y + 0.005);
});
