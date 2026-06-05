// WI-092 — weave-owned chart datum drag handle. Verifies in the live runtime:
// a selected bar shows a value handle at its top; dragging the handle up
// increases the bound dataset cell (and the bar re-renders); Cmd+Z reverts the
// whole drag as ONE undo step (the 60 Hz burst folded via mergeKeyOf).
//
// The element selection is driven through the SAME store a real mark click feeds
// (`window.__weaveChartElement`, a DEV-only diagnostic), so the test exercises
// the novel path — geometry anchor → drag → value mapping → setCell → re-render
// → undo — deterministically, without depending on hit-testing an SVG <path>.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addChart(page: Page): Promise<{ chartId: string; datasetId: string }> {
  const chartId = await page.evaluate(() => {
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
  const datasetId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { units: ReadonlyArray<{ kind: string; id: unknown }> } };
    };
    const datasets = w.__weaveDoc!.root.units.filter((u) => u.kind === "dataset");
    return String(datasets[datasets.length - 1]?.id);
  });
  return { chartId, datasetId };
}

/** Read row `rowIndex`'s `값` cell from the dataset unit. */
async function readValue(page: Page, datasetId: string, rowIndex: number): Promise<number> {
  return page.evaluate(
    ({ id, idx }) => {
      const w = window as unknown as {
        __weaveDoc?: {
          root: {
            units: ReadonlyArray<{
              id: unknown;
              kind: string;
              attrs?: { dataset?: { rows?: ReadonlyArray<Record<string, unknown>> } };
            }>;
          };
        };
      };
      const unit = w.__weaveDoc?.root.units.find(
        (u) => String(u.id) === id && u.kind === "dataset",
      );
      const cell = unit?.attrs?.dataset?.rows?.[idx]?.값;
      return typeof cell === "number" ? cell : Number(cell);
    },
    { id: datasetId, idx: rowIndex },
  );
}

/** Click at a fraction (0..1) of the chart's rendered box (real DOM click). */
async function clickChartAt(page: Page, fx: number, fy: number): Promise<void> {
  const box = await page.locator('[data-testid="chart-echarts"]').boundingBox();
  if (box === null) throw new Error("no chart box");
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(120);
}

/** Drive the element selection the way a real bar click would. */
async function selectDatum(
  page: Page,
  chartId: string,
  rowIndex: number,
  value: number,
): Promise<void> {
  await page.evaluate(
    ({ cid, idx, val }) => {
      const w = window as unknown as {
        __weaveChartElement?: { set: (r: unknown) => void };
      };
      w.__weaveChartElement?.set({
        chartItemId: cid,
        role: "datum",
        category: ["A", "B", "C", "D"][idx],
        seriesName: "값",
        rowIndex: idx,
        value: val,
      });
    },
    { cid: chartId, idx: rowIndex, val: value },
  );
  await page.waitForTimeout(80);
}

test("WI-092 — dragging a bar's value handle up raises the dataset cell; Cmd+Z reverts in one step", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-handle" });
  const { chartId, datasetId } = await addChart(page);

  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  // Seeded sample: row 0 = A = 30.
  expect(await readValue(page, datasetId, 0)).toBe(30);

  // Let the managed category labels (DR-035) materialize + the chart re-layout
  // settle BEFORE selecting, so the bar geometry is stable when we drag.
  await page.waitForTimeout(400);

  // Select the chart item (so its selection chrome — incl. our VM — renders),
  // then element-select bar 0.
  await setSelection(page, [chartId]);
  await selectDatum(page, chartId, 0, 30);

  // The value handle appears at the bar top. Read its box immediately before the
  // drag (the rAF keeps it pinned to the live bar position).
  const handle = page.locator('[data-testid="chart-value-handle"]');
  await expect(handle).toBeVisible();
  await page.waitForTimeout(150);
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  // Drag the handle UP (smaller client-y = taller bar = larger value).
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 30, { steps: 6 });
  await page.mouse.move(cx, cy - 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  const raised = await readValue(page, datasetId, 0);
  expect(raised).toBeGreaterThan(30); // dragged up → value increased

  // One Cmd+Z reverts the entire drag (mergeKeyOf folded the 60 Hz writes).
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  expect(await readValue(page, datasetId, 0)).toBe(30);
});

/** The whole `overrides.datum` map of per-category styles for the chart item. */
async function readDatumOverrides(
  page: Page,
  chartId: string,
): Promise<Record<string, { barWidth?: number }>> {
  return page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs?: { overrides?: { datum?: Record<string, { barWidth?: number }> } };
          }>;
        };
      };
    };
    const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
    return chart?.attrs?.overrides?.datum ?? {};
  }, chartId);
}

test("WI-092 — width-handle changes ONLY the selected bar (per-datum); Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-width" });
  const { chartId } = await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  expect(await readDatumOverrides(page, chartId)).toEqual({}); // no per-bar widths yet

  await setSelection(page, [chartId]);
  await selectDatum(page, chartId, 1, 80); // bar B (tallest → easy side grab)

  // The bar-width handle appears on the bar's side edge.
  const widthHandle = page.locator('[data-testid="chart-width-handle"]');
  await expect(widthHandle).toBeVisible();
  await expect(widthHandle).toHaveCSS("cursor", "ew-resize");
  await page.waitForTimeout(150);
  const box = await widthHandle.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  // Drag the side handle OUTWARD (away from the bar center) → thicker bar.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 25, cy, { steps: 6 });
  await page.mouse.move(cx + 50, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  // ONLY bar B got a width override; A / C / D are untouched.
  const after = await readDatumOverrides(page, chartId);
  expect(after.B?.barWidth).toBeGreaterThan(0);
  expect(after.B?.barWidth).toBeLessThanOrEqual(1);
  expect(Object.keys(after).filter((k) => after[k]?.barWidth !== undefined)).toEqual(["B"]);

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  expect((await readDatumOverrides(page, chartId)).B?.barWidth).toBeUndefined(); // reverted
});

/** Rendered bar mark boxes (client geometry), left→right, with real height. */
async function barRects(page: Page): Promise<Array<{ w: number; h: number; x: number }>> {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="chart-echarts"] svg');
    return Array.from(svg?.querySelectorAll("path,rect") ?? [])
      .map((p) => {
        const b = (p as SVGGraphicsElement).getBBox();
        return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x) };
      })
      .filter((b) => b.h > 30 && b.w > 2 && b.w < 400)
      .sort((a, b) => a.x - b.x);
  });
}

/** Rendered bar fill colours, left→right. */
async function barFills(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="chart-echarts"] svg');
    return Array.from(svg?.querySelectorAll("path,rect") ?? [])
      .map((p) => ({ fill: p.getAttribute("fill"), b: (p as SVGGraphicsElement).getBBox() }))
      .filter((o) => o.b.height > 30 && o.b.width > 2 && o.b.width < 400)
      .sort((a, b) => a.b.x - b.b.x)
      .map((o) => o.fill ?? "");
  });
}

/** Patch chart attrs (the wiring the toolbar/element controls drive). */
async function patchAttrs(page: Page, chartId: string, attrs: unknown): Promise<void> {
  await page.evaluate(
    ({ cid, a }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.update", { itemId: cid, attrs: a });
    },
    { cid: chartId, a: attrs },
  );
  await page.waitForTimeout(300);
}

test("WI-092 — colour follows selection (ALL types): chart=all marks (palette), element=single (per-datum wins)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-color" });
  const { chartId } = await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  // CHART selected, no element drilled → the parent-level "all marks colour"
  // control shows for the chart type; the per-element editor does not.
  await setSelection(page, [chartId]);
  await page.waitForTimeout(150);
  await expect(page.locator('[data-testid="chart-color"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="chart-element-editor"]')).toHaveCount(0);

  // All-marks colour = the palette (universal across types) → every bar red.
  await patchAttrs(page, chartId, { palette: ["#ff0000"] });
  expect(await barFills(page)).toEqual(["#ff0000", "#ff0000", "#ff0000", "#ff0000"]);

  // The control is offered for non-bar types too (line, pie).
  await patchAttrs(page, chartId, { chartType: "line" });
  await expect(page.locator('[data-testid="chart-color"]')).toHaveCount(1);
  await patchAttrs(page, chartId, { chartType: "pie" });
  await expect(page.locator('[data-testid="chart-color"]')).toHaveCount(1);
  await patchAttrs(page, chartId, { chartType: "bar" });

  // Drill into bar B → the parent control hides, the per-element editor shows.
  await selectDatum(page, chartId, 1, 80);
  await page.waitForTimeout(120);
  await expect(page.locator('[data-testid="chart-color"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="chart-element-editor"]')).toHaveCount(1);

  // Single-mark colour (datum override) → ONLY B changes; the rest keep the
  // palette colour (per-datum wins over the chart-wide default).
  await patchAttrs(page, chartId, {
    palette: ["#ff0000"],
    overrides: { datum: { B: { color: "#0000ff" } } },
  });
  expect(await barFills(page)).toEqual(["#ff0000", "#0000ff", "#ff0000", "#ff0000"]);
});

test("WI-092 — CHART-level width: handle on every bar, drag one → ALL bars together; bar-level is per-bar", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-global" });
  const { chartId } = await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  // CHART selected, no bar drilled → a global width handle on EVERY bar (4) but
  // all HIDDEN until hovered; no per-bar value/width handle yet.
  await setSelection(page, [chartId]);
  await page.waitForTimeout(150);
  const globalHandles = page.locator('[data-testid="chart-global-width-handle"]');
  const hidden = page.locator(
    '[data-testid="chart-global-width-handle"][data-handle-hidden="true"]',
  );
  await expect(globalHandles).toHaveCount(4);
  await expect(hidden).toHaveCount(4); // hidden until hover
  await expect(page.locator('[data-testid="chart-value-handle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="chart-width-handle"]')).toHaveCount(0);

  const before = await barRects(page);
  expect(before.length).toBe(4);

  // HOVER bar B → only its handle reveals.
  const chartBox = await page.locator('[data-testid="chart-echarts"]').boundingBox();
  await page.mouse.move(chartBox!.x + chartBox!.width * 0.37, chartBox!.y + chartBox!.height * 0.6);
  await page.waitForTimeout(150);
  await expect(hidden).toHaveCount(3); // one revealed

  // Drag that handle inward → the chart-wide barWidth shrinks → ALL bars become
  // narrower AND equal width.
  const box = await globalHandles.nth(1).boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x - 25, box!.y + box!.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await barRects(page);
  expect(after.length).toBe(4);
  for (const b of after) expect(b.w).toBeLessThan(before[0]!.w); // every bar got narrower
  const widths = after.map((b) => b.w);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2); // all equal
  const bw = await page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { children: ReadonlyArray<{ id: unknown; attrs?: { barWidth?: number } }> };
      };
    };
    return w.__weaveDoc?.root.children.find((c) => String(c.id) === cid)?.attrs?.barWidth;
  }, chartId);
  expect(bw).toBeGreaterThan(0);
  expect(bw).toBeLessThan(1);

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(200);
  const reverted = await barRects(page);
  expect(reverted[0]!.w).toBeGreaterThan(after[0]!.w); // back to the wider default
});

test("WI-092 — per-bar widths actually RENDER (custom series): wide vs narrow vs default", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-render" });
  const { chartId } = await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  // A narrow (0.2), B wide (0.95), C/D default → switches to the custom renderer.
  await page.evaluate((cid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: cid,
      attrs: { overrides: { datum: { A: { barWidth: 0.2 }, B: { barWidth: 0.95 } } } },
    });
  }, chartId);
  await page.waitForTimeout(400);

  const bars = await barRects(page);
  expect(bars.length).toBe(4); // all four bars still render (not empty / flat)
  for (const b of bars) expect(b.h).toBeGreaterThan(30); // real height, not collapsed
  const [a, bWide, c] = bars;
  // A (0.2) clearly narrower than the default C (~0.6) clearly narrower than B (0.95).
  expect(a!.w).toBeLessThan(c!.w);
  expect(c!.w).toBeLessThan(bWide!.w);
  expect(bWide!.w / a!.w).toBeGreaterThan(2); // wide bar is much fatter than the narrow one
});

test("WI-092 — a pie slice gets an angular sweep handle", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-pie" });
  const { chartId } = await addChart(page);
  await page.evaluate((cid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", { itemId: cid, attrs: { chartType: "pie" } });
  }, chartId);
  await page.waitForTimeout(150);
  await expect(page.locator('[data-testid="chart-block"]')).toHaveAttribute(
    "data-chart-type",
    "pie",
  );

  await setSelection(page, [chartId]);
  await selectDatum(page, chartId, 1, 80); // slice B

  const handle = page.locator('[data-testid="chart-value-handle"]');
  await expect(handle).toBeVisible();
  // The pie handle drives an angular drag → ew-resize cursor (vs ns for bars).
  await expect(handle).toHaveCSS("cursor", "ew-resize");
});

/** Read the chart item's `variant.innerRadius`. */
async function readInnerRadius(page: Page, chartId: string): Promise<number | undefined> {
  return page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; attrs?: { variant?: { innerRadius?: number } } }>;
        };
      };
    };
    const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
    return chart?.attrs?.variant?.innerRadius;
  }, chartId);
}

test("WI-092 — dragging a pie slice's inner-radius handle opens a donut; Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-donut" });
  const { chartId } = await addChart(page);
  await page.evaluate((cid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", { itemId: cid, attrs: { chartType: "pie" } });
  }, chartId);
  await page.waitForTimeout(400);
  expect(await readInnerRadius(page, chartId)).toBeUndefined(); // solid pie initially

  await setSelection(page, [chartId]);
  await selectDatum(page, chartId, 1, 80);

  const radiusHandle = page.locator('[data-testid="chart-inner-radius-handle"]');
  await expect(radiusHandle).toBeVisible();
  await page.waitForTimeout(150);

  // Drag the handle radially OUTWARD (away from the chart/pie center) → bigger hole.
  const chartBox = await page.locator('[data-testid="chart-echarts"]').boundingBox();
  const hBox = await radiusHandle.boundingBox();
  expect(chartBox).not.toBeNull();
  expect(hBox).not.toBeNull();
  const ccx = chartBox!.x + chartBox!.width / 2;
  const ccy = chartBox!.y + chartBox!.height / 2;
  const hx = hBox!.x + hBox!.width / 2;
  const hy = hBox!.y + hBox!.height / 2;
  const len = Math.hypot(hx - ccx, hy - ccy) || 1;
  const ux = (hx - ccx) / len;
  const uy = (hy - ccy) / len;

  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + ux * 30, hy + uy * 30, { steps: 6 });
  await page.mouse.move(hx + ux * 55, hy + uy * 55, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  const inner = await readInnerRadius(page, chartId);
  expect(inner).toBeGreaterThan(0); // donut hole opened
  expect(inner).toBeLessThanOrEqual(0.9);

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  expect(await readInnerRadius(page, chartId)).toBeUndefined(); // back to solid pie
});

test("WI-092 — selection hierarchy via REAL clicks: chart → bar → back to chart", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-092-hierarchy" });
  await addChart(page);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  await setSelection(page, []); // start with nothing selected

  const bound = page.locator('[data-testid="chart-element-bound"]');
  const heightHandle = page.locator('[data-testid="chart-value-handle"]');
  const widthHandle = page.locator('[data-testid="chart-width-handle"]');

  // DRILL step 1 — clicking directly ON a bar while nothing is selected selects
  // the CHART (parent) first, NOT the bar (same as a frame: container before
  // child). So no datum chrome appears yet.
  await clickChartAt(page, 0.37, 0.6);
  await expect(bound).toHaveCount(0);
  await expect(heightHandle).toHaveCount(0);

  // DRILL step 2 — a SECOND click on the bar (chart now selected) drills into it
  // → its bound + height + width handles appear.
  await clickChartAt(page, 0.37, 0.6);
  await expect(bound).toBeVisible();
  await expect(heightHandle).toBeVisible();
  await expect(widthHandle).toBeVisible();

  // Back to Level 1 — clicking the blank plot drops the bar (chart stays
  // selected: the chrome can reappear without re-selecting the chart).
  await clickChartAt(page, 0.15, 0.18);
  await expect(bound).toHaveCount(0);
  await expect(heightHandle).toHaveCount(0);

  // Re-drill to a bar, then Escape clears the bar (layered Escape).
  await clickChartAt(page, 0.37, 0.6);
  await expect(heightHandle).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  await expect(heightHandle).toHaveCount(0);

  // Re-drill, then deselecting the chart item clears the bar chrome (cleanup).
  await clickChartAt(page, 0.37, 0.6);
  await expect(heightHandle).toBeVisible();
  await setSelection(page, []);
  await page.waitForTimeout(120);
  await expect(heightHandle).toHaveCount(0);
  await expect(bound).toHaveCount(0);
});
