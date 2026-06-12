// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// WI-192 — chart manipulation transverse audit: the surfaces that WI-077/078/092
// proved in the `mixed` flavor on a root-level chart, re-proved across the axes
// the original suite never exercised:
//
//   ② slide-deck (presentation) mode — element select + value-handle drag work
//      the same as mixed; the page-bounded hit/move policy does NOT hijack the
//      handle gesture (capture-phase `[data-handle-kind]` wins before frame-move).
//   ③ nested frame + flex + grid — a chart whose on-screen box is a CHILD of a
//      frame (and, under flex/grid, a layout-materialized box) still shows its
//      datum handle ON the rendered chart, and the drag mutates the bound cell.
//   ① gauge direct manipulation — the new angular value handle (WI-192) on the
//      one part-to-whole single-dial type, with Cmd+Z folding the drag.
//
// These close the gap matrix from the chart-manipulation audit (chart type ×
// editor mode × manipulation surface × nesting context). Datum-handle parity for
// the remaining non-cartesian/pie/gauge types is panel-only by DR-126.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** Add a chart (+ its seeded dataset) into `containerId` (the design root when
 *  omitted). Mirrors chart-value-handle.spec's helper but parameterized so a
 *  chart can land inside a frame / flex / grid / slide page. */
async function addChart(
  page: Page,
  containerId?: string,
): Promise<{ chartId: string; datasetId: string }> {
  const chartId = await page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.chart.add", {
      containerId: cid ?? String(w.__weaveDoc!.root.id),
      frame: { x: 0.15, y: 0.15, width: 0.7, height: 0.7, rotation: 0 },
    });
    return String(r.value);
  }, containerId);
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

/** Add a frame into `containerId` (root when omitted), optionally with a layout
 *  spec (auto-flex / auto-grid). Returns the new frame id. */
async function addFrameWithLayout(
  page: Page,
  layout: unknown,
  containerId?: string,
): Promise<string> {
  const id = await page.evaluate(
    ({ lay, cid }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
        __weaveDoc?: { root: { id: unknown } };
      };
      const input: Record<string, unknown> = {
        kind: "frame",
        containerId: cid ?? String(w.__weaveDoc!.root.id),
        frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.7, rotation: 0 },
      };
      if (lay !== null) input.attrs = { layout: lay };
      const r = w.__weaveEditor!.exec("weave.item.add", input);
      return String(r.value);
    },
    { lay: layout ?? null, cid: containerId },
  );
  await page.waitForTimeout(150);
  return id;
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

/** Drive the element selection the way a real mark click would (the DEV-only
 *  diagnostic store the live mark-click path also feeds). */
async function selectDatum(
  page: Page,
  chartId: string,
  rowIndex: number,
  value: number,
): Promise<void> {
  await page.evaluate(
    ({ cid, idx, val }) => {
      const w = window as unknown as { __weaveChartElement?: { set: (r: unknown) => void } };
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

/** The TARGET chart's rendered (client) box — scoped to its frame wrapper so a
 *  sibling chart (flex/grid cases add two) doesn't make the locator ambiguous.
 *  This is the box every manipulation surface must track regardless of nesting /
 *  layout. */
async function chartBox(
  page: Page,
  chartId: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page
    .locator(`[data-frame-id="${chartId}"] [data-testid="chart-echarts"]`)
    .boundingBox();
  if (box === null) throw new Error("no chart box");
  return box;
}

async function switchType(page: Page, chartId: string, chartType: string): Promise<void> {
  await page.evaluate(
    ({ cid, t }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.update", { itemId: cid, attrs: { chartType: t } });
    },
    { cid: chartId, t: chartType },
  );
  await page.waitForTimeout(300);
}

/** Drive a value-handle drag and assert the bound cell moved + reverts in one
 *  Cmd+Z. Shared by the mode / nesting / layout cases (the surface under test is
 *  identical; only the chart's CONTAINER differs). */
async function dragValueHandleRaises(
  page: Page,
  chartId: string,
  datasetId: string,
): Promise<void> {
  await setSelection(page, [chartId]);
  await selectDatum(page, chartId, 0, 30);

  const handle = page.locator('[data-testid="chart-value-handle"]');
  await expect(handle).toBeVisible();
  await page.waitForTimeout(150);

  // The handle must sit ON the rendered chart (proves it tracks the live box,
  // not a stale root-frame position) — the gap-③ invariant under nesting/layout.
  const hBox = (await handle.boundingBox())!;
  const cBox = await chartBox(page, chartId);
  const hcx = hBox.x + hBox.width / 2;
  const hcy = hBox.y + hBox.height / 2;
  const m = 24; // handle can overhang the plot edge by a few px
  expect(hcx).toBeGreaterThanOrEqual(cBox.x - m);
  expect(hcx).toBeLessThanOrEqual(cBox.x + cBox.width + m);
  expect(hcy).toBeGreaterThanOrEqual(cBox.y - m);
  expect(hcy).toBeLessThanOrEqual(cBox.y + cBox.height + m);

  const before = await readValue(page, datasetId, 0);
  await page.mouse.move(hcx, hcy);
  await page.mouse.down();
  await page.mouse.move(hcx, hcy - 30, { steps: 6 });
  await page.mouse.move(hcx, hcy - 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  expect(await readValue(page, datasetId, 0)).toBeGreaterThan(before);

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  expect(await readValue(page, datasetId, 0)).toBe(before);
}

const FLEX_ROW = {
  kind: "auto-flex",
  direction: "row",
  gap: 0.02,
  justify: "start",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

const GRID_2COL = {
  kind: "auto-grid",
  columns: [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ],
  rows: [{ kind: "fr", value: 1 }],
  columnGap: 0,
  rowGap: 0,
  justify: "stretch",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

// ── ② slide-deck (presentation) mode ────────────────────────────────────────

test("② slide-deck — a chart's value handle drags the bound cell; page-bounded mode does not hijack the gesture", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "WI-192-slide" });
  // The active page is the design root's first child (slide-deck seeds one page).
  const pageId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String(w.__weaveDoc!.root.children[0]?.id);
  });
  const { chartId, datasetId } = await addChart(page, pageId);
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  await dragValueHandleRaises(page, chartId, datasetId);
});

// ── ③ nested frame ──────────────────────────────────────────────────────────

test("③ nested frame — a chart inside a child frame keeps its datum handle on the rendered chart", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-192-nested" });
  const frameId = await addFrameWithLayout(page, null); // plain (absolute) frame
  const { chartId, datasetId } = await addChart(page, frameId);
  // Sanity: the chart's parent is the frame, not the root.
  const parentId = await page.evaluate(
    ({ cid }) => {
      const w = window as unknown as {
        __weaveDoc?: {
          root: {
            children: ReadonlyArray<{ id: unknown; children: ReadonlyArray<{ id: unknown }> }>;
          };
        };
      };
      for (const top of w.__weaveDoc!.root.children) {
        if (top.children.some((c) => String(c.id) === cid)) return String(top.id);
      }
      return "root";
    },
    { cid: chartId },
  );
  expect(parentId).toBe(frameId);

  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  await dragValueHandleRaises(page, chartId, datasetId);
});

// ── ③ flex layout ────────────────────────────────────────────────────────────

test("③ flex layout — a chart that is a flex child shows its handle on the layout-computed box", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-192-flex" });
  const flexId = await addFrameWithLayout(page, FLEX_ROW);
  // A sibling first so the flex row actually distributes (chart is not the only child).
  await addChart(page, flexId);
  const { chartId, datasetId } = await addChart(page, flexId);
  await expect(page.locator('[data-testid="chart-echarts"] svg').first()).toBeVisible();
  await page.waitForTimeout(400);

  await dragValueHandleRaises(page, chartId, datasetId);
});

// ── ③ grid layout ────────────────────────────────────────────────────────────

test("③ grid layout — a chart that is a grid cell shows its handle on the layout-computed box", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-192-grid" });
  const gridId = await addFrameWithLayout(page, GRID_2COL);
  await addChart(page, gridId); // cell 1
  const { chartId, datasetId } = await addChart(page, gridId); // cell 2
  await expect(page.locator('[data-testid="chart-echarts"] svg').first()).toBeVisible();
  await page.waitForTimeout(400);

  await dragValueHandleRaises(page, chartId, datasetId);
});

// ── ① gauge direct manipulation (new WI-192 handle) ──────────────────────────

test("① gauge — a single-dial value handle drags the bound cell along the arc; Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-192-gauge" });
  const { chartId, datasetId } = await addChart(page);
  await switchType(page, chartId, "gauge");
  await expect(page.locator('[data-testid="chart-block"]')).toHaveAttribute(
    "data-chart-type",
    "gauge",
  );
  await page.waitForTimeout(400);

  // The gauge shows the FIRST row (A = 30). Drill into it.
  await setSelection(page, [chartId]);
  await selectDatum(page, chartId, 0, 30);

  const handle = page.locator('[data-testid="chart-value-handle"]');
  await expect(handle).toBeVisible();
  // Angular drag → ew-resize cursor (like the pie sweep, unlike a bar's ns).
  await expect(handle).toHaveCSS("cursor", "ew-resize");
  await page.waitForTimeout(150);

  const before = await readValue(page, datasetId, 0);
  const cBox = await chartBox(page, chartId);
  const hBox = (await handle.boundingBox())!;
  const hx = hBox.x + hBox.width / 2;
  const hy = hBox.y + hBox.height / 2;
  // The dial sweeps clockwise from lower-left (min) over the top to lower-right
  // (max). Dragging the handle toward the TOP-RIGHT of the dial raises the value.
  const targetX = cBox.x + cBox.width * 0.85;
  const targetY = cBox.y + cBox.height * 0.2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move((hx + targetX) / 2, (hy + targetY) / 2, { steps: 6 });
  await page.mouse.move(targetX, targetY, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  expect(await readValue(page, datasetId, 0)).toBeGreaterThan(before); // dialled up

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  expect(await readValue(page, datasetId, 0)).toBe(before); // one undo folds the drag
});

// ── ① scatter / bubble direct manipulation (new WI-193 2-D point handle) ──────

/** Add a scatter chart with an explicit 2-quantitative-column dataset (the
 *  seeded sample is category/value — wrong shape for x·y), returning ids. */
async function addScatterChart(page: Page): Promise<{ chartId: string; datasetId: string }> {
  const chartId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.chart.add", {
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.15, y: 0.15, width: 0.7, height: 0.7, rotation: 0 },
      chartType: "scatter",
      dataset: {
        name: "산점도",
        columns: [
          { name: "x", type: "quantitative" },
          { name: "y", type: "quantitative" },
        ],
        rows: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 25 },
        ],
      },
      encoding: { x: { field: "x" }, y: { field: "y" } },
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

/** Read row `rowIndex`'s arbitrary `column` cell as a number. */
async function readCell(
  page: Page,
  datasetId: string,
  rowIndex: number,
  column: string,
): Promise<number> {
  return page.evaluate(
    ({ id, idx, col }) => {
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
      const cell = unit?.attrs?.dataset?.rows?.[idx]?.[col];
      return typeof cell === "number" ? cell : Number(cell);
    },
    { id: datasetId, idx: rowIndex, col: column },
  );
}

/** Element-select a scatter point (the point handle needs only role + rowIndex —
 *  the bound x·y columns come from the chart's encoding, not the ref). */
async function selectPoint(page: Page, chartId: string, rowIndex: number): Promise<void> {
  await page.evaluate(
    ({ cid, idx }) => {
      const w = window as unknown as { __weaveChartElement?: { set: (r: unknown) => void } };
      w.__weaveChartElement?.set({ chartItemId: cid, role: "datum", rowIndex: idx });
    },
    { cid: chartId, idx: rowIndex },
  );
  await page.waitForTimeout(80);
}

test("① scatter — a 2-D point handle drags BOTH x and y dataset cells; Cmd+Z reverts both in one step", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-193-scatter" });
  const { chartId, datasetId } = await addScatterChart(page);
  await expect(page.locator('[data-testid="chart-block"]')).toHaveAttribute(
    "data-chart-type",
    "scatter",
  );
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  await page.waitForTimeout(400);

  await setSelection(page, [chartId]);
  await selectPoint(page, chartId, 1); // the middle point (x=30, y=40)

  const handle = page.locator('[data-testid="chart-point-handle"]');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveCSS("cursor", "move"); // free 2-D drag, not a constrained axis
  await page.waitForTimeout(150);

  const beforeX = await readCell(page, datasetId, 1, "x");
  const beforeY = await readCell(page, datasetId, 1, "y");

  // Drag the point to a clearly different spot in the plot → both x and y move.
  const cBox = await chartBox(page, chartId);
  const hBox = (await handle.boundingBox())!;
  const hx = hBox.x + hBox.width / 2;
  const hy = hBox.y + hBox.height / 2;
  const targetX = cBox.x + cBox.width * 0.75;
  const targetY = cBox.y + cBox.height * 0.75;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move((hx + targetX) / 2, (hy + targetY) / 2, { steps: 6 });
  await page.mouse.move(targetX, targetY, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  const afterX = await readCell(page, datasetId, 1, "x");
  const afterY = await readCell(page, datasetId, 1, "y");
  // BOTH cells changed (the 2-D write) — not just one axis.
  expect(afterX).not.toBeCloseTo(beforeX, 3);
  expect(afterY).not.toBeCloseTo(beforeY, 3);

  // One Cmd+Z reverts BOTH cells (the two setCells folded into one transaction).
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  expect(await readCell(page, datasetId, 1, "x")).toBeCloseTo(beforeX, 6);
  expect(await readCell(page, datasetId, 1, "y")).toBeCloseTo(beforeY, 6);
});
