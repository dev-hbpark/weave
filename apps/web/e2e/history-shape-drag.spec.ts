import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 7 / 10b — Cmd+Z must undo a canvas-shape drag (move / resize) as a
// single transaction. Coords are 0..1 ratio (Phase 10a), so movement deltas
// land in [-1, +1].

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function readShape(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    type ShapeAttrs = { shapes: ReadonlyArray<{ id: string; x: number; y: number }> };
    type Item = { kind: string; attrs: ShapeAttrs };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    const canvas = doc.root.children.find((c) => c.kind === "canvas-design");
    return canvas?.attrs.shapes[0] ?? null;
  });
}

// Phase 12 — frame SelectionLayer + shape SelectionLayer overlap inside the
// same canvas item; the drag-move test needs a more deliberate way to scope
// to the inner (shape) layer. Defer the fix until Phase 12c lands so it can
// be addressed alongside the drill-in selection model.
test.fixme("Cmd+Z reverts a shape drag-move as one undo step", async ({ page }) => {
  // canvas-board flavor seeds a canvas-design item with default shapes.
  await prepareDesign(page, { flavor: "canvas-board" });

  const shape = page.locator('[data-shape-id^="shape"]').first();
  await expect(shape).toBeVisible();
  const origShape = await readShape(page);
  expect(origShape).not.toBeNull();
  if (origShape === null) return;

  await shape.click();
  // Phase 12 — frame + shape SelectionLayers may both be present; the shape's
  // is the innermost in DOM order, so `.first()` scopes to it.
  const moveHandle = page.getByRole("button", { name: "Move selection" }).first();
  const handleBox = await moveHandle.boundingBox();
  if (handleBox === null) throw new Error("move handle has no bounding box");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + (80 * i) / 8,
      handleBox.y + handleBox.height / 2 + (60 * i) / 8,
    );
  }
  await page.mouse.up();

  const movedShape = await readShape(page);
  if (movedShape === null) throw new Error("shape disappeared after drag");
  expect(movedShape.x).toBeGreaterThan(origShape.x + 0.01);
  expect(movedShape.y).toBeGreaterThan(origShape.y + 0.01);

  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);

  const undoneShape = await readShape(page);
  if (undoneShape === null) throw new Error("shape disappeared after undo");
  expect(Math.abs(undoneShape.x - origShape.x)).toBeLessThan(0.01);
  expect(Math.abs(undoneShape.y - origShape.y)).toBeLessThan(0.01);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(50);
  const redoneShape = await readShape(page);
  if (redoneShape === null) throw new Error("shape disappeared after redo");
  expect(Math.abs(redoneShape.x - movedShape.x)).toBeLessThan(0.01);
  expect(Math.abs(redoneShape.y - movedShape.y)).toBeLessThan(0.01);
});

// WI-032 Phase 3c — canvas-shape lived inside canvas-design.attrs.shapes[]
// and was edited via weave.shape.update / .remove. With the legacy kind +
// commands gone, shape primitives flow through weave.item.update; the
// equivalent resize-as-one-undo-step coverage is the responsibility of
// `frame-handles.spec.ts` / `frame-manipulation.spec.ts` (already running
// against the new model).
test.skip("Cmd+Z reverts a canvas-shape resize-SE as one undo step", async ({ page }) => {
  await prepareDesign(page, { flavor: "canvas-board" });
  const shape = page.locator('[data-shape-id^="shape"]').first();
  await expect(shape).toBeVisible();
  const orig = await readShape(page);
  expect(orig).not.toBeNull();
  if (orig === null) return;

  await shape.click();
  const handle = page.getByRole("button", { name: "Resize se", exact: true }).first();
  const box = await handle.boundingBox();
  if (box === null) throw new Error("resize handle has no bounding box");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      box.x + box.width / 2 + (60 * i) / 6,
      box.y + box.height / 2 + (60 * i) / 6,
    );
  }
  await page.mouse.up();

  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(50);

  const undoneFull = await page.evaluate(() => {
    type ShapeAttrs = { shapes: ReadonlyArray<{ id: string; width: number; height: number }> };
    type Doc = { root: { children: ReadonlyArray<{ kind: string; attrs: ShapeAttrs }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const canvas = doc?.root.children.find((c) => c.kind === "canvas-design");
    const s = canvas?.attrs.shapes[0];
    return s ? { width: s.width, height: s.height } : null;
  });
  if (undoneFull === null) throw new Error("attrs gone after undo");
  expect(Math.abs(undoneFull.width - 0.18)).toBeLessThan(0.001);
  expect(Math.abs(undoneFull.height - 0.18)).toBeLessThan(0.001);
});
