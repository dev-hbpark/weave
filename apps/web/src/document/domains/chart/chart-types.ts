// WI-079 / DR-036 — the ChartTypeSpec registry: the SINGLE source that both the
// renderer (which builder?) and the encoding-editor UI (which channels?) read.
// Adding a chart type = one entry here (+ its option builder + its ECharts
// modules in the renderer). No `switch (chartType)` anywhere — this is Rule 6.
//
// All 14 base families (DR-036) are registered: cartesian (bar/line/area/scatter/
// bubble/heatmap/candlestick/boxplot), part-to-whole (pie/funnel/gauge), polar
// (radar), hierarchy (treemap), flow (sankey).

import type { DatasetColumn, DatasetRow } from "../../dataset/dataset-store.js";
import {
  type Channel,
  type ChartEncoding,
  type ChartFamily,
  type ChartType,
  channelFields,
  type FieldType,
} from "./chart-model.js";
import {
  boxplotOption,
  type ChartRenderInput,
  candlestickOption,
  cartesianOption,
  type EChartsOptionLike,
  funnelOption,
  gaugeOption,
  heatmapOption,
  pieOption,
  radarOption,
  sankeyOption,
  scatterOption,
  treemapOption,
  withStaticInteraction,
} from "./echarts-option.js";

/** One encoding slot a chart type consumes — drives BOTH validation and the
 *  spec-driven field-picker UI (the picker filters columns by `accepts`). */
export interface ChannelSlot {
  readonly channel: Channel;
  /** UI label for the slot, e.g. "값", "지표", "시작가". */
  readonly label: string;
  readonly required: boolean;
  /** `value` accepts multiple fields → multiple (wide) series. */
  readonly multiple?: boolean;
  /** Column types valid for this slot (picker filter). */
  readonly accepts: ReadonlyArray<FieldType>;
}

export interface ChartTypeSpec {
  readonly type: ChartType;
  readonly family: ChartFamily;
  /** Display name in the chart-type picker. */
  readonly label: string;
  readonly channels: ReadonlyArray<ChannelSlot>;
  /** Build the ECharts option from resolved render input. */
  readonly buildOption: (input: ChartRenderInput) => EChartsOptionLike;
  /** ECharts series/component modules this type needs (registered in the lazy
   *  renderer). Documented here so the renderer can register per used type. */
  readonly echartsModules: ReadonlyArray<string>;
  /** Whether the builder collapses repeated categories by the value channel's
   *  `aggregate` (sum/mean/…) — drives the "집계" picker in the panel. */
  readonly aggregatable?: boolean;
}

// Common column-type sets.
const KEYS: ReadonlyArray<FieldType> = ["nominal", "ordinal", "temporal"];
const CATS: ReadonlyArray<FieldType> = ["nominal", "ordinal"];
const QUANT: ReadonlyArray<FieldType> = ["quantitative"];
const CARTESIAN_COMPONENTS = ["GridComponent", "LegendComponent", "TooltipComponent"] as const;

/** bar/line/area share the cartesian category × value(s) channel shape. Two
 *  layouts are supported: WIDE — several value columns, each its own series; and
 *  LONG/tidy — one value column split into a series per distinct `series`-column
 *  value (the optional `series` channel). */
function cartesianChannels(): ReadonlyArray<ChannelSlot> {
  return [
    { channel: "category", label: "항목(축)", required: true, accepts: KEYS },
    { channel: "value", label: "값", required: true, multiple: true, accepts: QUANT },
    { channel: "series", label: "계열(분할)", required: false, accepts: CATS },
  ];
}

/** The chart-type registry. Keyed by `ChartType`; only implemented types appear
 *  (a `Partial` map — `buildChartOption` falls back to bar for an unimplemented
 *  type, so a chart whose type has no builder yet still renders). */
export const CHART_TYPE_REGISTRY: Partial<Record<ChartType, ChartTypeSpec>> = {
  bar: {
    type: "bar",
    family: "cartesian",
    label: "막대",
    channels: cartesianChannels(),
    buildOption: (i) => cartesianOption("bar", i),
    echartsModules: ["BarChart", ...CARTESIAN_COMPONENTS],
    aggregatable: true,
  },
  line: {
    type: "line",
    family: "cartesian",
    label: "선",
    channels: cartesianChannels(),
    buildOption: (i) => cartesianOption("line", i),
    echartsModules: ["LineChart", ...CARTESIAN_COMPONENTS],
    aggregatable: true,
  },
  pie: {
    type: "pie",
    family: "part-to-whole",
    label: "파이",
    channels: [
      { channel: "category", label: "항목", required: true, accepts: CATS },
      { channel: "value", label: "값", required: true, accepts: QUANT },
    ],
    buildOption: (i) => pieOption(i),
    echartsModules: ["PieChart", "LegendComponent", "TooltipComponent"],
    aggregatable: true,
  },
  radar: {
    type: "radar",
    family: "polar",
    label: "레이더",
    channels: [
      { channel: "category", label: "지표", required: true, accepts: KEYS },
      { channel: "value", label: "값", required: true, multiple: true, accepts: QUANT },
    ],
    buildOption: (i) => radarOption(i),
    echartsModules: ["RadarChart", "LegendComponent", "TooltipComponent"],
  },
  area: {
    type: "area",
    family: "cartesian",
    label: "영역",
    channels: cartesianChannels(),
    buildOption: (i) => cartesianOption("area", i),
    echartsModules: ["LineChart", ...CARTESIAN_COMPONENTS],
    aggregatable: true,
  },
  funnel: {
    type: "funnel",
    family: "part-to-whole",
    label: "퍼널",
    channels: [
      { channel: "category", label: "단계", required: true, accepts: CATS },
      { channel: "value", label: "값", required: true, accepts: QUANT },
    ],
    buildOption: (i) => funnelOption(i),
    echartsModules: ["FunnelChart", "LegendComponent", "TooltipComponent"],
    aggregatable: true,
  },
  gauge: {
    type: "gauge",
    family: "part-to-whole",
    label: "게이지",
    channels: [{ channel: "value", label: "값", required: true, accepts: QUANT }],
    buildOption: (i) => gaugeOption(i),
    echartsModules: ["GaugeChart"],
  },
  scatter: {
    type: "scatter",
    family: "cartesian",
    label: "산점도",
    channels: [
      { channel: "x", label: "X", required: true, accepts: QUANT },
      { channel: "y", label: "Y", required: true, accepts: QUANT },
    ],
    buildOption: (i) => scatterOption(i),
    echartsModules: ["ScatterChart", ...CARTESIAN_COMPONENTS],
  },
  bubble: {
    type: "bubble",
    family: "cartesian",
    label: "버블",
    channels: [
      { channel: "x", label: "X", required: true, accepts: QUANT },
      { channel: "y", label: "Y", required: true, accepts: QUANT },
      { channel: "size", label: "크기", required: true, accepts: QUANT },
    ],
    buildOption: (i) => scatterOption(i),
    echartsModules: ["ScatterChart", ...CARTESIAN_COMPONENTS],
  },
  heatmap: {
    type: "heatmap",
    family: "matrix",
    label: "히트맵",
    channels: [
      { channel: "x", label: "X(행)", required: true, accepts: CATS },
      { channel: "y", label: "Y(열)", required: true, accepts: CATS },
      { channel: "value", label: "값", required: true, accepts: QUANT },
    ],
    buildOption: (i) => heatmapOption(i),
    echartsModules: ["HeatmapChart", "GridComponent", "VisualMapComponent", "TooltipComponent"],
  },
  candlestick: {
    type: "candlestick",
    family: "cartesian",
    label: "캔들",
    channels: [
      { channel: "category", label: "시간", required: true, accepts: KEYS },
      { channel: "open", label: "시가", required: true, accepts: QUANT },
      { channel: "high", label: "고가", required: true, accepts: QUANT },
      { channel: "low", label: "저가", required: true, accepts: QUANT },
      { channel: "close", label: "종가", required: true, accepts: QUANT },
    ],
    buildOption: (i) => candlestickOption(i),
    echartsModules: ["CandlestickChart", "GridComponent", "TooltipComponent"],
  },
  boxplot: {
    type: "boxplot",
    family: "cartesian",
    label: "박스플롯",
    channels: [
      { channel: "category", label: "항목", required: true, accepts: KEYS },
      { channel: "lower", label: "최소", required: true, accepts: QUANT },
      { channel: "q1", label: "Q1", required: true, accepts: QUANT },
      { channel: "median", label: "중앙값", required: true, accepts: QUANT },
      { channel: "q3", label: "Q3", required: true, accepts: QUANT },
      { channel: "upper", label: "최대", required: true, accepts: QUANT },
    ],
    buildOption: (i) => boxplotOption(i),
    echartsModules: ["BoxplotChart", "GridComponent", "TooltipComponent"],
  },
  treemap: {
    type: "treemap",
    family: "hierarchy",
    label: "트리맵",
    channels: [
      { channel: "id", label: "항목", required: true, accepts: CATS },
      { channel: "value", label: "값", required: true, accepts: QUANT },
      { channel: "parent", label: "상위", required: false, accepts: CATS },
    ],
    buildOption: (i) => treemapOption(i),
    echartsModules: ["TreemapChart", "TooltipComponent"],
  },
  sankey: {
    type: "sankey",
    family: "flow",
    label: "산키",
    channels: [
      { channel: "source", label: "원천", required: true, accepts: CATS },
      { channel: "target", label: "대상", required: true, accepts: CATS },
      { channel: "value", label: "값", required: true, accepts: QUANT },
    ],
    buildOption: (i) => sankeyOption(i),
    echartsModules: ["SankeyChart", "TooltipComponent"],
  },
};

/** The chart-type spec, or `undefined` if not yet implemented. */
export function chartTypeSpec(type: ChartType): ChartTypeSpec | undefined {
  return CHART_TYPE_REGISTRY[type];
}

/** WI-172 — central row-shape guard for EVERY builder: a persisted dataset may
 *  predate the command-boundary normalization (or arrive via an old snapshot),
 *  so the render path re-asserts the shape it iterates: `rows` must be an array
 *  and every row a plain record. Null / array / primitive entries are dropped
 *  rather than crashing the builders (and through them the whole canvas tree). */
function sanitizeRenderRows(rows: unknown): ReadonlyArray<DatasetRow> {
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (r): r is DatasetRow => r !== null && typeof r === "object" && !Array.isArray(r),
  );
}

/** Build the ECharts option for `input.chartType` via the registry. Falls back
 *  to bar for a type without a builder yet, so the chart still renders. */
export function buildChartOption(input: ChartRenderInput): EChartsOptionLike {
  const spec = CHART_TYPE_REGISTRY[input.chartType] ?? CHART_TYPE_REGISTRY.bar;
  // WI-172 — guard the row shape once, ahead of all 14 builders.
  const safeInput: ChartRenderInput = { ...input, rows: sanitizeRenderRows(input.rows) };
  const option =
    (spec ?? CHART_TYPE_REGISTRY.bar)?.buildOption(safeInput) ?? cartesianOption("bar", safeInput);
  // WI-092 — weave owns interaction; ECharts renders statically (no hover
  // emphasis / tooltip / cursor / select-explode). One central strip (Rule 6).
  return withStaticInteraction(option);
}

/** The chart types the UI can currently offer (those with a registered spec). */
export function availableChartTypes(): ReadonlyArray<ChartTypeSpec> {
  return Object.values(CHART_TYPE_REGISTRY).filter((s): s is ChartTypeSpec => s !== undefined);
}

/** Whether `enc` binds every REQUIRED channel of `type`'s spec — the generic
 *  plottability test (replaces the bar/line-specific "has a value column"). An
 *  unregistered type falls back to "has a value channel". */
export function requiredChannelsSatisfied(type: ChartType, enc: ChartEncoding): boolean {
  const spec = CHART_TYPE_REGISTRY[type];
  if (spec === undefined) return channelFields(enc, "value").length > 0;
  return spec.channels
    .filter((s) => s.required)
    .every((s) => channelFields(enc, s.channel).length > 0);
}

/** Build a best-effort encoding for `type` from the dataset's TYPED columns:
 *  for each channel slot, KEEP the previous binding when it's still valid
 *  (column exists + its type is accepted), otherwise auto-pick the first unused
 *  column whose type the slot accepts. Required slots with no candidate stay
 *  unbound (the chart shows the placeholder). Used when the user switches chart
 *  type so the new type renders without re-doing the encoding by hand. */
export function autoEncode(
  type: ChartType,
  columns: ReadonlyArray<DatasetColumn>,
  prev?: ChartEncoding,
): ChartEncoding {
  const spec = CHART_TYPE_REGISTRY[type];
  if (spec === undefined) return prev ?? {};
  const used = new Set<string>();
  const next: Record<string, ChartEncoding[Channel]> = {};
  for (const slot of spec.channels) {
    const accepts = (name: string): boolean => {
      const col = columns.find((c) => c.name === name);
      return col !== undefined && slot.accepts.includes(col.type);
    };
    // Keep the previous binding(s) when still valid. Auto-pick a fresh column
    // ONLY for REQUIRED slots (so the chart renders) — optional channels (e.g.
    // a long-format `series` split, treemap `parent`) stay opt-in.
    const kept = (prev ? channelFields(prev, slot.channel) : []).filter(accepts);
    let fields = kept;
    if (kept.length === 0 && slot.required) {
      const pick = columns.find((c) => slot.accepts.includes(c.type) && !used.has(c.name));
      fields = pick !== undefined ? [pick.name] : [];
    }
    const first = fields[0];
    if (first === undefined) continue;
    for (const f of fields) used.add(f);
    next[slot.channel] = slot.multiple ? fields.map((field) => ({ field })) : { field: first };
  }
  return next as ChartEncoding;
}
