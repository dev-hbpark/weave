// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// WI-195 — per-bar-width charts must NOT flicker on hover. A per-datum `barWidth`
// override switches the bar series to ECharts' CUSTOM renderer. A non-silent
// custom series re-invokes `renderItem` on every pointer-move (mouseover/mouseout
// as the cursor crosses bars), rewriting the rect's SVG attributes ~3×/move → a
// visible whole-chart flicker (reported: "차트 내 요소 드릴 + 두께/높이 조정 후
// 호버 시 차트 프레임 전체가 깜박"). The fix makes the custom series `silent`
// (the ONLY lever that stops the re-invoke — emphasis/blur/select/animation/
// hoverLayerThreshold were all measured ineffective) and restores element-select
// CLICK + hover-reveal for those bars via a zrender-level hit-test.
//
// This spec pins BOTH halves: (1) no SVG churn on a moving hover over a custom
// series; (2) clicking a custom bar still drills it (the silent marks emit no
// ECharts click of their own).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addChart(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.chart.add", {
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.15, y: 0.15, width: 0.7, height: 0.7, rotation: 0 },
    });
    return String(r.value);
  });
  await page.waitForTimeout(150);
  return id;
}

async function setBarWidthOverride(page: Page, chartId: string): Promise<void> {
  await page.evaluate((cid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: cid,
      attrs: { overrides: { datum: { B: { barWidth: 0.95 } } } },
    });
  }, chartId);
  await page.waitForTimeout(400);
}

test("WI-195 — a per-bar-width (CUSTOM series) chart does NOT churn its SVG on a moving hover", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-195-flicker" });
  const chartId = await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(500);
  await setBarWidthOverride(page, chartId); // → custom (per-datum width) series

  // Observe SVG attribute + child mutations while the pointer sweeps the marks.
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="chart-echarts"] svg');
    const w = window as unknown as { __m?: number; __obs?: MutationObserver };
    w.__m = 0;
    if (el) {
      const obs = new MutationObserver((recs) => {
        for (const r of recs) {
          w.__m =
            (w.__m ?? 0) +
            (r.type === "attributes" ? 1 : r.addedNodes.length + r.removedNodes.length);
        }
      });
      obs.observe(el, { attributes: true, subtree: true, childList: true });
      w.__obs = obs;
    }
  });

  const box = (await page.locator('[data-testid="chart-echarts"]').boundingBox())!;
  for (let i = 0; i < 40; i++) {
    const fx = 0.25 + ((i * 13) % 50) / 100;
    const fy = 0.35 + ((i * 7) % 45) / 100;
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(40);
  }

  const mutations = await page.evaluate(() => {
    const w = window as unknown as { __m?: number; __obs?: MutationObserver };
    w.__obs?.disconnect();
    return w.__m ?? 0;
  });
  // The static chart must not repaint on hover (was ~111 before the fix). Allow a
  // tiny slack for any single incidental relayout; the regression is a per-move storm.
  expect(mutations).toBeLessThanOrEqual(4);
});

test("WI-195 — a CUSTOM (silent) bar is still element-selectable by a real click (zr hit-test)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-195-click" });
  const chartId = await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(500);
  await setBarWidthOverride(page, chartId); // custom series (all bars silent)

  // Select the chart, then REAL-click bar B → it must drill (value handle shows),
  // even though the silent custom marks emit no ECharts click of their own (the
  // zr-level hit-test resolves the bar). This is the core click-restoration.
  await setSelection(page, [chartId]);
  const box = (await page.locator('[data-testid="chart-echarts"]').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.37, box.y + box.height * 0.62);
  await page.waitForTimeout(200);

  await expect(page.locator('[data-testid="chart-value-handle"]')).toBeVisible();
});
