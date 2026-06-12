// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// WI-196 — inner-element additional handles (corner-radius, layout-edit, chart
// bar/value handles) must share the SELECTION-CHROME layer (z 40 — the same as
// the SelectionLayer resize/rotate handles + rubber-band), NOT a higher z. They
// had drifted to z 49/50, which is at/above the contextual menu (z 50) and the
// Aku panel (z 48), so the handles wrongly painted OVER those surfaces. This pins
// the computed z so it can't drift back above the menu/panel layers again.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

// The layer band the inner-element handles must stay at-or-below. Anything that
// should paint ABOVE them — contextual toolbar (z 46), Aku panel (z 48),
// contextual menu (z 50) — lives above this.
const CHROME_Z = 40;
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

test("WI-196 — the corner-radius handle sits on the selection-chrome layer (z 40, below menus/panel)", async ({
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
  expect(z).toBe(CHROME_Z);
  expect(z).toBeLessThan(MENU_PANEL_FLOOR);
});

test("WI-196 — the chart value handle sits on the selection-chrome layer (z 40, below menus/panel)", async ({
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
  expect(z).toBe(CHROME_Z);
  expect(z).toBeLessThan(MENU_PANEL_FLOOR);
  // The selection outline around the mark stays just below its handles.
  const boundZ = Number(
    await page
      .locator('[data-testid="chart-element-bound"]')
      .first()
      .evaluate((el) => getComputedStyle(el).zIndex),
  );
  expect(boundZ).toBeLessThan(z);
});
