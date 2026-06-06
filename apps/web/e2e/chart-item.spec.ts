// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// WI-077 — data-driven chart item. Verifies in the live runtime: weave.chart.add
// seeds a dataset + chart in one undoable step, the chart renders bars from the
// data, switching chartType re-renders (line/pie), editing the dataset reflows
// the chart (reactivity), removing the dataset shows the placeholder, and Cmd+Z
// reverts the whole create — all via commands.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

interface ChartHandles {
  readonly chartId: string;
  readonly datasetId: string;
}

async function addChart(page: Page): Promise<ChartHandles> {
  const chartId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.chart.add", {
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotation: 0 },
    });
    return String(r.value);
  });
  // Read the seeded dataset id in a SEPARATE evaluate — after React re-renders
  // and refreshes the `__weaveDoc` dev global (the create's new root unit isn't
  // visible in the same synchronous tick as the exec).
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

async function exec(page: Page, name: string, input: unknown): Promise<void> {
  await page.evaluate(
    ({ n, i }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec(n, i);
    },
    { n: name, i: input },
  );
  await page.waitForTimeout(120);
}

test("WI-077 — chart renders bars from the seeded dataset; chartType switches; Cmd+Z reverts the create", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-077-chart" });
  const { chartId } = await addChart(page);

  // Seeded sample dataset → bar by default. ECharts (lazy chunk) mounts an SVG
  // inside the chart container. We assert container attrs + that echarts drew an
  // <svg> (not the exact element shapes — those are echarts internals).
  const block = page.locator('[data-testid="chart-block"]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute("data-chart-type", "bar");
  await expect(block).toHaveAttribute("data-chart-rows", "4");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();

  // Switch to line → container type flips, echarts re-renders (svg still there).
  await exec(page, "weave.item.update", { itemId: chartId, attrs: { chartType: "line" } });
  await expect(block).toHaveAttribute("data-chart-type", "line");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();

  // Switch to pie → container type flips.
  await exec(page, "weave.item.update", { itemId: chartId, attrs: { chartType: "pie" } });
  await expect(block).toHaveAttribute("data-chart-type", "pie");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();

  // One undo per user action removes the whole create (chart + seeded dataset)
  // → block gone. Managed category labels are a NON-undoable derived projection
  // (DR-035), so they never add history entries — the undo counts are exactly
  // the user's three actions (two switches + the create).
  await page.keyboard.press("ControlOrMeta+z"); // revert pie→line
  await page.keyboard.press("ControlOrMeta+z"); // revert line→bar
  await page.keyboard.press("ControlOrMeta+z"); // revert the create
  await page.waitForTimeout(150);
  await expect(page.locator('[data-testid="chart-block"]')).toHaveCount(0);
});

test("WI-080 — radar chart renders from the seeded dataset (polar family)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-080-radar" });
  const { chartId } = await addChart(page);
  const block = page.locator('[data-testid="chart-block"]');
  await expect(block).toHaveAttribute("data-chart-rows", "4");

  // Switch to radar → the registry dispatches to the radar builder, ECharts'
  // RadarChart module draws an <svg> (proves the module is registered + the
  // polar option is valid). The 4 rows (A/B/C/D) become the indicator axes.
  await exec(page, "weave.item.update", { itemId: chartId, attrs: { chartType: "radar" } });
  await expect(block).toHaveAttribute("data-chart-type", "radar");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  // radar draws a polygon path (one per value series); assert echarts emitted
  // the radar coordinate (an axis/split <polygon> or <path> under the svg).
  await expect(page.locator('[data-testid="chart-echarts"] svg path').first()).toBeVisible();

  // radar has no weave-rendered category labels (polar tips use ECharts' own) —
  // the managed text-label layer is empty for radar.
  const labelCount = await page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            children?: ReadonlyArray<{ kind: string; attrs?: { chartLabelRef?: unknown } }>;
          }>;
        };
      };
    };
    const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
    return (chart?.children ?? []).filter((c) => c.kind === "text" && c.attrs?.chartLabelRef)
      .length;
  }, chartId);
  expect(labelCount).toBe(0);
});

test("WI-081 — all 14 chart families render via the registry (ECharts modules load)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-081-all-types" });
  const { chartId, datasetId } = await addChart(page);
  const block = page.locator('[data-testid="chart-block"]');
  const svg = page.locator('[data-testid="chart-echarts"] svg');

  // A missing ECharts series module makes setOption warn ("... not imported")
  // or throw instead of drawing — collect both so we fail if any type's module
  // isn't registered.
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  // Each new family with a fitting dataset + channel encoding. Switching to it
  // must produce an <svg> (proves the series module is registered + the option
  // is valid — a missing module would throw in setOption and draw nothing).
  const cases = [
    {
      type: "area",
      columns: [
        { name: "월", type: "nominal" },
        { name: "값", type: "quantitative" },
      ],
      rows: [
        { 월: "1월", 값: 10 },
        { 월: "2월", 값: 20 },
      ],
      encoding: { category: { field: "월" }, value: [{ field: "값" }] },
    },
    {
      type: "funnel",
      columns: [
        { name: "단계", type: "nominal" },
        { name: "수", type: "quantitative" },
      ],
      rows: [
        { 단계: "방문", 수: 100 },
        { 단계: "구매", 수: 20 },
      ],
      encoding: { category: { field: "단계" }, value: [{ field: "수" }] },
    },
    {
      type: "gauge",
      columns: [{ name: "달성", type: "quantitative" }],
      rows: [{ 달성: 72 }],
      encoding: { value: [{ field: "달성" }] },
    },
    {
      type: "scatter",
      columns: [
        { name: "키", type: "quantitative" },
        { name: "몸무게", type: "quantitative" },
      ],
      rows: [
        { 키: 170, 몸무게: 65 },
        { 키: 180, 몸무게: 80 },
      ],
      encoding: { x: { field: "키" }, y: { field: "몸무게" } },
    },
    {
      type: "bubble",
      columns: [
        { name: "x", type: "quantitative" },
        { name: "y", type: "quantitative" },
        { name: "z", type: "quantitative" },
      ],
      rows: [
        { x: 1, y: 2, z: 30 },
        { x: 3, y: 4, z: 60 },
      ],
      encoding: { x: { field: "x" }, y: { field: "y" }, size: { field: "z" } },
    },
    {
      type: "heatmap",
      columns: [
        { name: "행", type: "nominal" },
        { name: "열", type: "nominal" },
        { name: "값", type: "quantitative" },
      ],
      rows: [
        { 행: "A", 열: "P", 값: 1 },
        { 행: "B", 열: "Q", 값: 5 },
      ],
      encoding: { x: { field: "행" }, y: { field: "열" }, value: { field: "값" } },
    },
    {
      type: "candlestick",
      columns: [
        { name: "날짜", type: "temporal" },
        { name: "시", type: "quantitative" },
        { name: "고", type: "quantitative" },
        { name: "저", type: "quantitative" },
        { name: "종", type: "quantitative" },
      ],
      rows: [{ 날짜: "2026-01-01", 시: 10, 고: 15, 저: 8, 종: 12 }],
      encoding: {
        category: { field: "날짜" },
        open: { field: "시" },
        high: { field: "고" },
        low: { field: "저" },
        close: { field: "종" },
      },
    },
    {
      type: "boxplot",
      columns: [
        { name: "그룹", type: "nominal" },
        { name: "최소", type: "quantitative" },
        { name: "q1", type: "quantitative" },
        { name: "중", type: "quantitative" },
        { name: "q3", type: "quantitative" },
        { name: "최대", type: "quantitative" },
      ],
      rows: [{ 그룹: "A", 최소: 1, q1: 3, 중: 5, q3: 7, 최대: 9 }],
      encoding: {
        category: { field: "그룹" },
        lower: { field: "최소" },
        q1: { field: "q1" },
        median: { field: "중" },
        q3: { field: "q3" },
        upper: { field: "최대" },
      },
    },
    {
      type: "treemap",
      columns: [
        { name: "항목", type: "nominal" },
        { name: "상위", type: "nominal" },
        { name: "값", type: "quantitative" },
      ],
      rows: [
        { 항목: "루트", 상위: "", 값: 0 },
        { 항목: "A", 상위: "루트", 값: 10 },
        { 항목: "B", 상위: "루트", 값: 20 },
      ],
      encoding: { id: { field: "항목" }, parent: { field: "상위" }, value: { field: "값" } },
    },
    {
      type: "sankey",
      columns: [
        { name: "원천", type: "nominal" },
        { name: "대상", type: "nominal" },
        { name: "값", type: "quantitative" },
      ],
      rows: [
        { 원천: "A", 대상: "B", 값: 5 },
        { 원천: "B", 대상: "C", 값: 3 },
      ],
      encoding: { source: { field: "원천" }, target: { field: "대상" }, value: { field: "값" } },
    },
  ] as const;

  for (const c of cases) {
    await exec(page, "weave.dataset.update", {
      id: datasetId,
      dataset: { columns: c.columns, rows: c.rows },
    });
    await exec(page, "weave.item.update", {
      itemId: chartId,
      attrs: { chartType: c.type, encoding: c.encoding },
    });
    await expect(block, `${c.type} container`).toHaveAttribute("data-chart-type", c.type);
    await expect(svg, `${c.type} renders an svg`).toBeVisible();
    // The series module rendered marks → the svg has graphical children beyond
    // the (hidden) clip defs.
    const marks = await page
      .locator('[data-testid="chart-echarts"] svg')
      .locator("path, rect, circle, polyline, polygon")
      .count();
    expect(marks, `${c.type} draws marks`).toBeGreaterThan(0);
  }

  // No "Series … not imported" / module-missing errors across all 14 families.
  const moduleErrors = errors.filter((e) =>
    /not imported|is not exists|requires.*import|ECharts/i.test(e),
  );
  expect(moduleErrors, moduleErrors.join("\n")).toEqual([]);
});

test("WI-083 — switching chart type auto-encodes from typed columns (renders, not placeholder)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-083-autoencode" });
  const { chartId, datasetId } = await addChart(page);

  // A dataset with TWO quantitative columns (so scatter is satisfiable) + the
  // chart bound to bar (category + one value).
  await exec(page, "weave.dataset.update", {
    id: datasetId,
    dataset: {
      columns: [
        { name: "항목", type: "nominal" },
        { name: "키", type: "quantitative" },
        { name: "몸무게", type: "quantitative" },
      ],
      rows: [
        { 항목: "A", 키: 170, 몸무게: 65 },
        { 항목: "B", 키: 180, 몸무게: 80 },
      ],
    },
  });
  await exec(page, "weave.item.update", {
    itemId: chartId,
    attrs: { encoding: { category: { field: "항목" }, value: [{ field: "키" }] } },
  });

  await setSelection(page, [chartId]);
  // Switch to 산점도 (scatter) via the registry-driven picker → setChartType
  // auto-encodes x/y from the two quantitative columns.
  await page.getByRole("button", { name: "Chart type" }).first().click();
  await page.getByRole("menuitemradio", { name: "산점도" }).click();
  await page.waitForTimeout(200);

  const block = page.locator('[data-testid="chart-block"]');
  await expect(block).toHaveAttribute("data-chart-type", "scatter");
  // It RENDERS (not the placeholder) because x/y were auto-mapped.
  await expect(block).not.toHaveAttribute("data-chart-empty", "true");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();

  const enc = await page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs?: { encoding?: { x?: { field?: string }; y?: { field?: string } } };
          }>;
        };
      };
    };
    const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
    return { x: chart?.attrs?.encoding?.x?.field, y: chart?.attrs?.encoding?.y?.field };
  }, chartId);
  expect(enc).toEqual({ x: "키", y: "몸무게" });
});

test("WI-086 — '샘플 데이터' loads fitting data for an unsatisfiable type (candlestick)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-086-sample" });
  const { chartId } = await addChart(page);
  const block = page.locator('[data-testid="chart-block"]');

  // Switch to candlestick: the seed dataset (항목/값) has no OHLC → placeholder.
  await exec(page, "weave.item.update", { itemId: chartId, attrs: { chartType: "candlestick" } });
  await expect(block).toHaveAttribute("data-chart-empty", "true");

  // The panel offers "샘플 데이터" (only when the chart is a placeholder).
  await setSelection(page, [chartId]);
  const sampleBtn = page.locator('[data-testid="chart-load-sample"]');
  await expect(sampleBtn).toBeVisible();
  await sampleBtn.click();
  await page.waitForTimeout(200);

  // Now it renders (OHLC sample + encoding loaded), no longer a placeholder.
  await expect(block).not.toHaveAttribute("data-chart-empty", "true");
  await expect(block).toHaveAttribute("data-chart-type", "candlestick");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();
  // The button is gone once the chart is satisfiable.
  await expect(sampleBtn).toHaveCount(0);

  // One undo reverts the sample load (dataset replace + encoding) in one step.
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  await expect(block).toHaveAttribute("data-chart-empty", "true");
});

test("WI-085 — value aggregate: the 집계 picker collapses repeated categories", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-085-agg" });
  const { chartId, datasetId } = await addChart(page);

  // Raw (un-aggregated) data: category "A" repeats across rows.
  await exec(page, "weave.dataset.update", {
    id: datasetId,
    dataset: {
      columns: [
        { name: "제품", type: "nominal" },
        { name: "매출", type: "quantitative" },
      ],
      rows: [
        { 제품: "A", 매출: 10 },
        { 제품: "A", 매출: 30 },
        { 제품: "B", 매출: 20 },
      ],
    },
  });
  await exec(page, "weave.item.update", {
    itemId: chartId,
    attrs: {
      chartType: "bar",
      encoding: { category: { field: "제품" }, value: [{ field: "매출" }] },
    },
  });

  const readLabels = () =>
    page.evaluate((cid) => {
      const w = window as unknown as {
        __weaveDoc?: {
          root: {
            children: ReadonlyArray<{
              id: unknown;
              attrs?: { encoding?: { value?: ReadonlyArray<{ aggregate?: string }> } };
              children?: ReadonlyArray<{
                kind: string;
                attrs?: { text?: unknown; chartLabelRef?: unknown };
              }>;
            }>;
          };
        };
      };
      const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
      const labels = (chart?.children ?? [])
        .filter((c) => c.kind === "text" && c.attrs?.chartLabelRef)
        .map((c) => c.attrs?.text);
      return { labels, agg: chart?.attrs?.encoding?.value?.[0]?.aggregate };
    }, chartId);

  // Raw: "A" appears twice (one label per row).
  await expect.poll(async () => (await readLabels()).labels.length).toBe(3);

  // Set 집계 = 합계 via the panel → categories collapse to A, B.
  await setSelection(page, [chartId]);
  await page.getByTestId("toolbar-more-trigger").click();
  await page.getByTestId("chart-aggregate").click();
  await page.getByTestId("chart-aggregate-option-sum").click();
  await page.waitForTimeout(200);

  const after = await readLabels();
  expect(after.agg).toBe("sum");
  expect(after.labels.slice().sort()).toEqual(["A", "B"]); // distinct after aggregation
});

test("WI-084 — long-format `series` channel: distinct-category labels, edit renames the group", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-084-long" });
  const { chartId, datasetId } = await addChart(page);

  // Tidy/long data: one value column (매출) + a series-split column (지역).
  await exec(page, "weave.dataset.update", {
    id: datasetId,
    dataset: {
      columns: [
        { name: "월", type: "nominal" },
        { name: "지역", type: "nominal" },
        { name: "매출", type: "quantitative" },
      ],
      rows: [
        { 월: "1월", 지역: "서울", 매출: 10 },
        { 월: "1월", 지역: "부산", 매출: 20 },
        { 월: "2월", 지역: "서울", 매출: 15 },
        { 월: "2월", 지역: "부산", 매출: 25 },
      ],
    },
  });
  await exec(page, "weave.item.update", {
    itemId: chartId,
    attrs: {
      chartType: "bar",
      encoding: {
        category: { field: "월" },
        value: [{ field: "매출" }],
        series: { field: "지역" },
      },
    },
  });

  const readLabels = () =>
    page.evaluate((cid) => {
      const w = window as unknown as {
        __weaveDoc?: {
          root: {
            children: ReadonlyArray<{
              id: unknown;
              children?: ReadonlyArray<{
                kind: string;
                attrs?: { text?: unknown; chartLabelRef?: unknown };
              }>;
            }>;
          };
        };
      };
      const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
      return (chart?.children ?? [])
        .filter((c) => c.kind === "text" && c.attrs?.chartLabelRef)
        .map((c) => c.attrs?.text);
    }, chartId);

  // DISTINCT categories → exactly 2 labels (1월, 2월), NOT one per row (4).
  await expect.poll(async () => (await readLabels()).slice().sort().join(",")).toBe("1월,2월");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();

  // Edit the "1월" label → renames EVERY row in that group (long-format binding).
  await page.locator('[data-testid="text-block"]').filter({ hasText: "1월" }).first().dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await expect(editable).toBeVisible({ timeout: 3000 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("Q1");
  await editable.evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(250);

  const months = await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { units: ReadonlyArray<{ kind: string; id: unknown; attrs: { dataset?: unknown } }> };
      };
    };
    const ds = w.__weaveDoc?.root.units.find((u) => u.kind === "dataset" && String(u.id) === id);
    return (ds?.attrs.dataset as { rows: Array<Record<string, unknown>> }).rows.map((r) => r.월);
  }, datasetId);
  // BOTH 1월 rows became Q1; 2월 rows untouched.
  expect(months).toEqual(["Q1", "Q1", "2월", "2월"]);
  await expect.poll(async () => (await readLabels()).slice().sort().join(",")).toBe("2월,Q1");
});

test("WI-079 — spec-driven encoding editor: multi-value chips add series", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-079-channels" });
  const { chartId, datasetId } = await addChart(page);

  // Give the dataset a SECOND quantitative column (항목 + 매출 + 비용).
  await exec(page, "weave.dataset.update", {
    id: datasetId,
    dataset: {
      columns: [
        { name: "항목", type: "nominal" },
        { name: "매출", type: "quantitative" },
        { name: "비용", type: "quantitative" },
      ],
      rows: [
        { 항목: "A", 매출: 30, 비용: 10 },
        { 항목: "B", 매출: 80, 비용: 40 },
      ],
    },
  });
  // Re-point the chart's value channel at 매출 (seed pointed at 값, now gone).
  await exec(page, "weave.item.update", {
    itemId: chartId,
    attrs: { encoding: { category: { field: "항목" }, value: [{ field: "매출" }] } },
  });

  await setSelection(page, [chartId]);
  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  await expect(popover).toBeVisible();

  // The value slot is `multiple` → toggle chips. 매출 is on, 비용 is off.
  const chipCost = popover.locator('[data-testid="chart-channel-chip-비용"]');
  await expect(chipCost).toHaveAttribute("aria-pressed", "false");
  await chipCost.click();
  await page.waitForTimeout(150);

  // The value channel now carries BOTH columns → two series.
  const valueFields = await page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs?: { encoding?: { value?: ReadonlyArray<{ field?: string }> } };
          }>;
        };
      };
    };
    const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
    return (chart?.attrs?.encoding?.value ?? []).map((f) => f.field);
  }, chartId);
  expect(valueFields).toEqual(["매출", "비용"]);
  await expect(chipCost).toHaveAttribute("aria-pressed", "true");
});

test("WI-077 — editing the dataset reflows the chart; removing it shows the placeholder", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-077-chart-data" });
  const { datasetId } = await addChart(page);

  const block = page.locator('[data-testid="chart-block"]');
  await expect(block).toHaveAttribute("data-chart-rows", "4");
  await expect(page.locator('[data-testid="chart-echarts"] svg')).toBeVisible();

  // Shrink the dataset to 2 rows → chart reflows (reactivity, no per-chart
  // wiring). The container row-count tracks the live dataset.
  await exec(page, "weave.dataset.update", {
    id: datasetId,
    dataset: {
      columns: ["항목", "값"],
      rows: [
        { 항목: "X", 값: 10 },
        { 항목: "Y", 값: 20 },
      ],
    },
  });
  await expect(block).toHaveAttribute("data-chart-rows", "2");

  // Remove the dataset → dangling ref → placeholder (graceful, no crash).
  await exec(page, "weave.dataset.remove", { id: datasetId });
  await expect(page.locator('[data-testid="chart-block"][data-chart-empty="true"]')).toBeVisible();
});

test("WI-077 — the dataset grid: add-row, Excel block paste reflows the chart, Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-077-dataset-grid" });
  const { chartId } = await addChart(page);
  const block = page.locator('[data-testid="chart-block"]');
  await expect(block).toHaveAttribute("data-chart-rows", "4");

  // Select the chart → ContextualToolbar shows ChartSection → open the editor.
  await setSelection(page, [chartId]);
  await page.locator('[data-testid="chart-edit-data"]').click();
  await expect(page.locator('[data-testid="dataset-editor"]')).toBeVisible();
  // The grid is lazy — wait for the react-data-grid chunk to mount.
  const grid = page.locator('[data-testid="dataset-grid"]');
  await expect(grid).toBeVisible();
  await expect(page.locator('[data-testid="dataset-col-name"]')).toHaveCount(2);

  // Add a row via the panel → chart reflows to 5 (shared dataset, live).
  await page.locator('[data-testid="dataset-row-add"]').click();
  await expect(block).toHaveAttribute("data-chart-rows", "5");
  await page.waitForTimeout(550); // past the 500ms history-merge window

  // Paste an Excel/Sheets block (TSV, header row auto-detected) → the whole
  // table is replaced; the chart reflows to the pasted 3 data rows.
  await grid.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "항목\t값\nX\t1\nY\t2\nZ\t3");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  });
  await expect(block).toHaveAttribute("data-chart-rows", "3");
  await page.waitForTimeout(550);

  // Close, then Cmd+Z: undo the paste → back to 5, undo add-row → back to 4.
  // Managed labels are a non-undoable derived projection (DR-035) — they add no
  // history entries, so the undo counts track the user's data edits exactly.
  await page.locator('[data-testid="dataset-editor-done"]').click();
  await page.waitForTimeout(150);
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  await expect(block).toHaveAttribute("data-chart-rows", "5");
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  await expect(block).toHaveAttribute("data-chart-rows", "4");
  await expect(block).toBeVisible(); // chart.add itself is NOT undone
});

test("WI-077 — anchor paste: a block fills from the selected cell, preserving the rest", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-077-anchor-paste" });
  const { chartId, datasetId } = await addChart(page);

  await setSelection(page, [chartId]);
  await page.locator('[data-testid="chart-edit-data"]').click();
  const grid = page.locator('[data-testid="dataset-grid"]');
  await expect(grid).toBeVisible();

  // Select the top-left data cell (항목 = "A", rowIdx 0, col 0) → it becomes the
  // paste anchor.
  await grid.locator('[role="gridcell"]').filter({ hasText: "A" }).first().click();

  // Paste a 2×2 block from the anchor. Rows 0–1 are overwritten; rows 2–3 (C/45,
  // D/60) stay. No header detection — this is an in-place fill, not an import.
  await grid.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "X\t99\nY\t88");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  });
  await page.waitForTimeout(200);

  const rows = await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { units: ReadonlyArray<{ kind: string; id: unknown; attrs: { dataset?: unknown } }> };
      };
    };
    const u = w.__weaveDoc?.root.units.find((x) => x.kind === "dataset" && String(x.id) === id);
    return (u?.attrs.dataset as { rows: Array<Record<string, unknown>> }).rows;
  }, datasetId);

  // Anchored block landed at rows 0–1; rows 2–3 preserved (4 rows total).
  expect(rows).toHaveLength(4);
  expect(rows[0]).toEqual({ 항목: "X", 값: 99 });
  expect(rows[1]).toEqual({ 항목: "Y", 값: 88 });
  expect(rows[2]).toMatchObject({ 항목: "C" });
  await expect(page.locator('[data-testid="chart-block"]')).toHaveAttribute("data-chart-rows", "4");
});

test("WI-088 — legend click selects the SERIES; outline applies to the whole series", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-088-series" });
  const { chartId, datasetId } = await addChart(page);

  // Two value columns → two series → a legend (매출, 비용).
  await exec(page, "weave.dataset.update", {
    id: datasetId,
    dataset: {
      columns: [
        { name: "항목", type: "nominal" },
        { name: "매출", type: "quantitative" },
        { name: "비용", type: "quantitative" },
      ],
      rows: [
        { 항목: "A", 매출: 30, 비용: 10 },
        { 항목: "B", 매출: 80, 비용: 40 },
      ],
    },
  });
  await exec(page, "weave.item.update", {
    itemId: chartId,
    attrs: {
      encoding: { category: { field: "항목" }, value: [{ field: "매출" }, { field: "비용" }] },
    },
  });
  await setSelection(page, [chartId]);

  // Click the legend item "매출" (the legend acts as a SERIES selector, DR-037).
  const legend = page.locator('[data-testid="chart-echarts"] text', { hasText: "매출" }).first();
  await expect(legend).toBeVisible();
  await legend.click();

  // The element editor opens for the whole series (not a single datum).
  const editor = page.locator('[data-testid="chart-element-editor"]');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("시리즈: 매출");

  // Bump the outline → a SERIES override (applies to every 매출 bar).
  await page.locator('[data-testid="chart-element-thickness"]').fill("3");
  await page.waitForTimeout(250);

  const overrides = await page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs?: {
              overrides?: { series?: Record<string, { borderWidth?: number }>; datum?: unknown };
            };
          }>;
        };
      };
    };
    const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
    return chart?.attrs?.overrides;
  }, chartId);
  // Series-level override landed (NOT a datum override).
  expect(overrides?.series?.매출?.borderWidth).toBe(3);
  expect(overrides?.datum).toBeUndefined();
});

test("WI-078 — click a bar → emphasis editor → per-element override persists (data unchanged)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-078-emphasis" });
  const { chartId, datasetId } = await addChart(page);
  await setSelection(page, [chartId]);

  const echarts = page.locator('[data-testid="chart-echarts"]');
  await expect(echarts.locator("svg")).toBeVisible();

  // Click the tallest bar (seed 값 = 30/80/45/60 → 2nd category is tallest).
  const boxBefore = await echarts.boundingBox();
  if (boxBefore === null) throw new Error("no chart box");
  await page.mouse.click(
    boxBefore.x + boxBefore.width * 0.37,
    boxBefore.y + boxBefore.height * 0.6,
  );

  // The emphasis editor appears in the contextual toolbar.
  await expect(page.locator('[data-testid="chart-element-editor"]')).toBeVisible();

  // Bump the outline thickness → a per-element override is written.
  await page.locator('[data-testid="chart-element-thickness"]').fill("4");
  await page.waitForTimeout(250);

  const { overrides, datasetRows } = await page.evaluate(
    ({ cid, did }) => {
      const w = window as unknown as {
        __weaveDoc?: {
          root: {
            children: ReadonlyArray<{ id: unknown; attrs?: { overrides?: unknown } }>;
            units: ReadonlyArray<{ kind: string; id: unknown; attrs: { dataset?: unknown } }>;
          };
        };
      };
      const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
      const ds = w.__weaveDoc?.root.units.find((u) => u.kind === "dataset" && String(u.id) === did);
      return {
        overrides: chart?.attrs?.overrides as { datum?: Record<string, unknown> } | undefined,
        datasetRows: (ds?.attrs.dataset as { rows: unknown[] }).rows,
      };
    },
    { cid: chartId, did: datasetId },
  );

  // Presentation override landed (keyed by category)…
  expect(overrides?.datum).toBeTruthy();
  expect(Object.keys(overrides?.datum ?? {}).length).toBeGreaterThanOrEqual(1);
  // …and the DATA is untouched (emphasis is presentation, not data).
  expect(datasetRows).toHaveLength(4);
});

test("WI-078 — chart labels are REAL text Items (auto-placed); double-click edit → dataset", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-078-labels" });
  const { chartId, datasetId } = await addChart(page);

  // The sync controller materializes one REAL text Item per category (A/B/C/D),
  // parented to the chart, rendered via NestedFrame (ECharts' own labels hidden).
  const readChart = () =>
    page.evaluate((cid) => {
      const w = window as unknown as {
        __weaveDoc?: {
          root: {
            children: ReadonlyArray<{
              id: unknown;
              children?: ReadonlyArray<{
                kind: string;
                attrs?: { text?: unknown; chartLabelRef?: unknown };
              }>;
            }>;
            units: ReadonlyArray<{ kind: string; id: unknown; attrs: { dataset?: unknown } }>;
          };
        };
      };
      const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
      const labels = (chart?.children ?? []).filter(
        (c) => c.kind === "text" && c.attrs?.chartLabelRef,
      );
      return labels.map((c) => c.attrs?.text);
    }, chartId);

  await expect.poll(async () => (await readChart()).slice().sort().join(",")).toBe("A,B,C,D");
  await expect(
    page.locator('[data-testid="text-block"]').filter({ hasText: "A" }).first(),
  ).toBeVisible();

  // Double-click the "A" label (native text editing) → routes to the dataset.
  await page.locator('[data-testid="text-block"]').filter({ hasText: "A" }).first().dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await expect(editable).toBeVisible({ timeout: 3000 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("1분기");
  await editable.evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(250);

  // The category cell (row 0) was renamed in the dataset (the label edit routed
  // there), and the controller reconciles the label text to match.
  const rows = await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { units: ReadonlyArray<{ kind: string; id: unknown; attrs: { dataset?: unknown } }> };
      };
    };
    const ds = w.__weaveDoc?.root.units.find((u) => u.kind === "dataset" && String(u.id) === id);
    return (ds?.attrs.dataset as { rows: Array<Record<string, unknown>> }).rows;
  }, datasetId);
  expect(rows[0]?.항목).toBe("1분기");
  await expect.poll(async () => (await readChart()).includes("1분기")).toBe(true);
});

test("WI-078 — pie slices also get REAL text-item labels, placed on the circle", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-078-pie-labels" });
  const { chartId } = await addChart(page);

  const readLabels = () =>
    page.evaluate((cid) => {
      const w = window as unknown as {
        __weaveDoc?: {
          root: {
            children: ReadonlyArray<{
              id: unknown;
              children?: ReadonlyArray<{
                kind: string;
                attrs?: {
                  text?: unknown;
                  chartLabelRef?: unknown;
                  frame?: { x: number; y: number };
                };
              }>;
            }>;
          };
        };
      };
      const chart = w.__weaveDoc?.root.children.find((c) => String(c.id) === cid);
      return (chart?.children ?? [])
        .filter((c) => c.kind === "text" && c.attrs?.chartLabelRef)
        .map((c) => ({ text: c.attrs?.text, frame: c.attrs?.frame }));
    }, chartId);

  // Bar by default → 4 labels along the bottom axis (y near the bottom inset).
  await expect.poll(async () => (await readLabels()).length).toBe(4);
  const barLabels = await readLabels();
  expect(barLabels.every((l) => (l.frame?.y ?? 0) > 0.7)).toBe(true);

  // Switch to pie → the SAME 4 labels reposition onto the slice circle (spread
  // in both axes around the center, no longer a flat bottom row).
  await exec(page, "weave.item.update", { itemId: chartId, attrs: { chartType: "pie" } });
  await expect(page.locator('[data-testid="chart-block"][data-chart-type="pie"]')).toBeVisible();

  await expect
    .poll(async () => {
      const ls = await readLabels();
      if (ls.length !== 4) return false;
      const ys = ls.map((l) => l.frame?.y ?? 0.5);
      const xs = ls.map((l) => l.frame?.x ?? 0.5);
      // Pie labels are spread vertically (not all in the bottom row) and span
      // both sides horizontally around the center.
      const spreadY = Math.max(...ys) - Math.min(...ys);
      const spreadX = Math.max(...xs) - Math.min(...xs);
      return spreadY > 0.2 && spreadX > 0.2;
    })
    .toBe(true);
  // Still real text Items A/B/C/D.
  expect((await readLabels()).map((l) => l.text).sort()).toEqual(["A", "B", "C", "D"]);
});

test("WI-078 — click a bar → edit its value → the dataset value cell updates, chart reflows", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-078-value" });
  const { chartId, datasetId } = await addChart(page);
  await setSelection(page, [chartId]);

  const echarts = page.locator('[data-testid="chart-echarts"]');
  await expect(echarts.locator("svg")).toBeVisible();

  // Click the tallest bar (seed 값 = 30/80/45/60 → 2nd category).
  const box = await echarts.boundingBox();
  if (box === null) throw new Error("no chart box");
  await page.mouse.click(box.x + box.width * 0.37, box.y + box.height * 0.6);
  await expect(page.locator('[data-testid="chart-element-editor"]')).toBeVisible();

  // Edit the value → routes to the dataset's value cell.
  const valueInput = page.locator('[data-testid="chart-element-value"]');
  await expect(valueInput).toBeVisible();
  await valueInput.fill("200");
  await valueInput.press("Enter");
  await page.waitForTimeout(200);

  const rows = await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { units: ReadonlyArray<{ kind: string; id: unknown; attrs: { dataset?: unknown } }> };
      };
    };
    const ds = w.__weaveDoc?.root.units.find((u) => u.kind === "dataset" && String(u.id) === id);
    return (ds?.attrs.dataset as { rows: Array<Record<string, unknown>> }).rows;
  }, datasetId);

  // Exactly one value cell became 200 (the clicked bar's row).
  expect(rows.filter((r) => r.값 === 200)).toHaveLength(1);
});

test("WI-078 — deleting a mark removes its dataset row; chart reflows", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-078-delete-row" });
  const { chartId, datasetId } = await addChart(page);
  await setSelection(page, [chartId]);
  const block = page.locator('[data-testid="chart-block"]');
  await expect(block).toHaveAttribute("data-chart-rows", "4");

  // Click the tallest bar (값 80 → category B), then delete its row.
  const box = await page.locator('[data-testid="chart-echarts"]').boundingBox();
  if (box === null) throw new Error("no chart box");
  await page.mouse.click(box.x + box.width * 0.37, box.y + box.height * 0.6);
  await expect(page.locator('[data-testid="chart-element-editor"]')).toBeVisible();
  await page.locator('[data-testid="chart-element-delete-row"]').click();
  await page.waitForTimeout(200);

  // The dataset lost one row and the chart reflows to 3.
  await expect(block).toHaveAttribute("data-chart-rows", "3");
  const rows = await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { units: ReadonlyArray<{ kind: string; id: unknown; attrs: { dataset?: unknown } }> };
      };
    };
    const ds = w.__weaveDoc?.root.units.find((u) => u.kind === "dataset" && String(u.id) === id);
    return (ds?.attrs.dataset as { rows: Array<Record<string, unknown>> }).rows;
  }, datasetId);
  expect(rows).toHaveLength(3);
  expect(rows.some((r) => r.항목 === "B")).toBe(false); // the deleted category is gone
});
