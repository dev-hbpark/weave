// Line-type shapes (직선 / 화살표 / 자유선 / 곡선 / 자유곡선 — an open `poly`) are
// edited via their per-vertex handles, so the selection rubber-band keeps its
// outline + rotate handle but DROPS the bounding-box resize handles. Closed
// polys / polygons (a 면) keep their resize handles.
import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectedId(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
}

test("자유선 hides box resize handles but keeps vertex handles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "LineHandles" });

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-line").click();
  await page.getByTestId("add-line-free").click();
  await page.waitForTimeout(250);

  const id = await selectedId(page);
  const scope = `[data-selection-handle-item-id="${id}"]`;
  // Vertex handles present …
  await expect(page.locator(`${scope} [data-testid^="poly-vertex-"]`).first()).toBeVisible();
  // … but NO bounding-box chrome: no resize handles (corner / edge) AND no
  // rotate handle (endpoint drag already rotates the line).
  expect(await page.locator(`${scope} [data-handle-kind="corner"]`).count()).toBe(0);
  expect(await page.locator(`${scope} [data-handle-kind="edge"]`).count()).toBe(0);
  expect(await page.locator(`${scope} [data-handle-kind="rotation"]`).count()).toBe(0);
});

test("closed 자유 다각형 keeps its box resize handles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "PolyHandles" });

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape").click();
  await page.getByTestId("add-shape-poly").click();
  await page.waitForTimeout(250);

  const id = await selectedId(page);
  const scope = `[data-selection-handle-item-id="${id}"]`;
  expect(await page.locator(`${scope} [data-handle-kind="corner"]`).count()).toBeGreaterThan(0);
});
