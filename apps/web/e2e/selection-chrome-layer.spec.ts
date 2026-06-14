// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// WI-196 + DR-design-033 — inner-element additional handles (corner-radius,
// layout-edit, chart bar/value handles) must obey the SelectionChromeZ contract:
// POINT handles (draggable dots: corner-radius, chart datum) ride the
// `pointHandle` tier, the non-interactive guide outline rides `lineHandle` just
// below them, and ALL of it stays below the floating overlays (contextual
// toolbar z 46, Aku panel z 48, menu z 50). This pins the computed z to the
// single-source contract so it can't drift back above the menu/panel layers (or
// behind a line handle) again. Imported direct from source (not the package
// index) to keep React out of the node test context.

import { expect, type Page, test } from "@playwright/test";
import { SelectionChromeZ } from "../../../packages/design-system/src/selection-chrome-z.js";
import { addFrame, clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

const MENU_PANEL_FLOOR = 46; // the lowest "above the handles" surface

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function zIndexOf(page: Page, testId: string): Promise<number> {
  const z = await page
    .getByTestId(testId)
    .first()
    .evaluate((el) => getComputedStyle(el).zIndex);
  return Number(z);
}

async function addChart(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.chart.add", {
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.2, y: 0.2, width: 0.6, height: 0.6, rotation: 0 },
    });
    return String(r.value);
  });
  await page.waitForTimeout(150);
  return id;
}

test("WI-196 / DR-design-033 — the corner-radius handle rides the POINT-handle tier, below menus/panel", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-196-corner" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const id = await page.evaluate(() => {
    const root = (window as unknown as { __weaveDoc: { root: { children: { id: unknown }[] } } })
      .__weaveDoc.root;
    return String(root.children[root.children.length - 1]!.id);
  });
  await setSelection(page, [id]);

  await expect(page.getByTestId("corner-radius-handle-tr")).toBeVisible();
  const z = await zIndexOf(page, "corner-radius-handle-tr");
  expect(z).toBe(SelectionChromeZ.pointHandle);
  expect(z).toBeLessThan(MENU_PANEL_FLOOR);
});

test("WI-196 / DR-design-033 — the chart value handle rides the POINT-handle tier; its guide outline sits below it", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-196-chart" });
  const chartId = await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  await setSelection(page, [chartId]);
  await page.evaluate((cid) => {
    const w = window as unknown as { __weaveChartElement?: { set: (r: unknown) => void } };
    w.__weaveChartElement?.set({
      chartItemId: cid,
      role: "datum",
      category: "B",
      seriesName: "값",
      rowIndex: 1,
      value: 80,
    });
  }, chartId);

  const handle = page.locator('[data-testid="chart-value-handle"]');
  await expect(handle).toBeVisible();
  const z = Number(await handle.first().evaluate((el) => getComputedStyle(el).zIndex));
  expect(z).toBe(SelectionChromeZ.pointHandle);
  expect(z).toBeLessThan(MENU_PANEL_FLOOR);
  // The guide outline around the mark rides the LINE tier, just below its
  // POINT handles.
  const boundZ = Number(
    await page
      .locator('[data-testid="chart-element-bound"]')
      .first()
      .evaluate((el) => getComputedStyle(el).zIndex),
  );
  expect(boundZ).toBe(SelectionChromeZ.lineHandle);
  expect(boundZ).toBeLessThan(z);
});
