// WI-079 / DR-036 — the generalized chart data model (grammar of graphics).
//
// A chart references a typed dataset (DatasetColumn[], see dataset-store) and
// maps its columns onto VISUAL CHANNELS via an encoding. This leaf module owns
// the channel vocabulary, the chart-type union (14 families), the variant flags,
// and the legacy→channel migration + channel accessors. It imports only
// `FieldType` from the dataset store (no dependency on the app's central
// `types.ts`), so `types.ts` can import the chart model without a cycle.

import type { FieldType } from "../../dataset/dataset-store.js";

export type { FieldType };

/** The 14 base chart types (DR-036). Variants (doughnut / stacked / 100% /
 *  horizontal / smooth) are `ChartVariant` flags, NOT separate types. */
export type ChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "funnel"
  | "gauge"
  | "scatter"
  | "bubble"
  | "radar"
  | "heatmap"
  | "candlestick"
  | "boxplot"
  | "treemap"
  | "sankey";

/** Chart geometry family — drives axis/label layout strategy. */
export type ChartFamily = "cartesian" | "part-to-whole" | "polar" | "matrix" | "hierarchy" | "flow";

/** Aggregation for a channel's field (reserved — not applied in the first
 *  implementation; boxplot/candlestick expect pre-aggregated columns). */
export type Aggregate = "sum" | "mean" | "count" | "min" | "max" | "median";

/** A reference from a channel to a dataset column (by stable NAME). `type`
 *  overrides the column's declared type for this encoding (rare). */
export interface FieldRef {
  readonly field: string;
  readonly type?: FieldType;
  readonly aggregate?: Aggregate;
}

/** The closed channel vocabulary covering all 14 families. A chart type uses the
 *  subset its geometry needs (see CHART_TYPE_REGISTRY). `value` may be a single
 *  field or many (many = wide-format multiple series). */
export interface ChartEncoding {
  // ── dimensions / positional ──
  readonly category?: FieldRef; // single categorical/temporal key (bar/line/area/pie/funnel/radar/boxplot)
  readonly x?: FieldRef; // positional X (scatter/bubble=quant; heatmap=cat; candlestick=temporal)
  readonly y?: FieldRef; // positional Y (scatter/bubble=quant; heatmap=cat)
  readonly series?: FieldRef; // series split / color (long format)
  // ── measures ──
  readonly value?: FieldRef | ReadonlyArray<FieldRef>; // magnitude; array = multiple series (wide)
  readonly size?: FieldRef; // bubble radius
  // ── financial (candlestick) ──
  readonly open?: FieldRef;
  readonly high?: FieldRef;
  readonly low?: FieldRef;
  readonly close?: FieldRef;
  // ── statistical (boxplot, pre-aggregated 5-number) ──
  readonly lower?: FieldRef;
  readonly q1?: FieldRef;
  readonly median?: FieldRef;
  readonly q3?: FieldRef;
  readonly upper?: FieldRef;
  // ── hierarchy (treemap) ──
  readonly id?: FieldRef;
  readonly parent?: FieldRef;
  // ── flow (sankey) ──
  readonly source?: FieldRef;
  readonly target?: FieldRef;
}

/** Every encoding channel name (for spec-driven UI / validation). */
export type Channel = keyof ChartEncoding;

/** Presentation variants — config flags, not chart types. */
export interface ChartVariant {
  readonly stacked?: boolean; // bar/line/area
  readonly normalized?: boolean; // 100% stacked
  readonly horizontal?: boolean; // bar
  readonly smooth?: boolean; // line/area
  readonly innerRadius?: number; // pie → doughnut (0..1 of outer radius)
}

/** Legacy (WI-077/078) encoding shape, pre-DR-036. */
interface LegacyEncoding {
  readonly category?: string;
  readonly values?: ReadonlyArray<string>;
}

/** DR-036 migration — normalize any persisted encoding to the channel map.
 *  Legacy `{ category: string, values: string[] }` becomes
 *  `{ category: {field}, value: [{field}…] }`. A value already in channel shape
 *  is returned unchanged. */
export function migrateEncoding(raw: ChartEncoding | LegacyEncoding | undefined): ChartEncoding {
  if (raw === undefined) return {};
  const r = raw as Record<string, unknown>;
  const legacy = typeof r.category === "string" || Array.isArray(r.values);
  if (!legacy) return raw as ChartEncoding;
  const enc: Mutable<ChartEncoding> = {};
  if (typeof r.category === "string" && r.category !== "") enc.category = { field: r.category };
  if (Array.isArray(r.values)) {
    const fields = (r.values as unknown[]).filter(
      (v): v is string => typeof v === "string" && v !== "",
    );
    if (fields.length > 0) enc.value = fields.map((field) => ({ field }));
  }
  return enc;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ── channel accessors (centralize reading channels so consumers never poke at
//    `.field` / single-vs-array directly) ──

/** The category channel's column name (or undefined). */
export function categoryField(enc: ChartEncoding): string | undefined {
  return enc.category?.field;
}

/** The value channel as an array of column names (single → 1-element). */
export function valueFields(enc: ChartEncoding): ReadonlyArray<string> {
  return valueRefs(enc).map((f) => f.field);
}

/** The value channel as FieldRefs (single → 1-element) — keeps `aggregate`. */
export function valueRefs(enc: ChartEncoding): ReadonlyArray<FieldRef> {
  const v = enc.value;
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v as FieldRef];
}

/** The aggregate applied to the value channel (first ref that carries one), or
 *  undefined for raw plotting. */
export function valueAggregate(enc: ChartEncoding): Aggregate | undefined {
  return valueRefs(enc).find((r) => r.aggregate !== undefined)?.aggregate;
}

/** Set (or clear, with `undefined`) the aggregate on EVERY value field. No-op
 *  when there's no value channel. */
export function setValueAggregate(enc: ChartEncoding, agg: Aggregate | undefined): ChartEncoding {
  const refs = valueRefs(enc);
  if (refs.length === 0) return enc;
  const value = refs.map((r) => {
    if (agg === undefined) {
      const { aggregate: _drop, ...rest } = r;
      return rest;
    }
    return { ...r, aggregate: agg };
  });
  return { ...enc, value };
}

/** The series channel's column name (or undefined). */
export function seriesField(enc: ChartEncoding): string | undefined {
  return enc.series?.field;
}

/** The column name(s) bound to ANY channel (single → 1-element; `value` may be
 *  many). Powers the spec-driven encoding editor. */
export function channelFields(enc: ChartEncoding, channel: Channel): ReadonlyArray<string> {
  const v = enc[channel];
  if (v === undefined) return [];
  if (Array.isArray(v)) return v.map((f) => f.field);
  return [(v as FieldRef).field];
}

/** Bind `fields` to `channel` (omitting the channel when empty). `multiple`
 *  stores an array (wide series); otherwise a single FieldRef from `fields[0]`.
 *  Pure — returns the next encoding. */
export function setChannel(
  enc: ChartEncoding,
  channel: Channel,
  fields: ReadonlyArray<string>,
  multiple: boolean,
): ChartEncoding {
  const next: Record<string, unknown> = { ...enc };
  if (fields.length === 0) {
    delete next[channel];
  } else if (multiple) {
    next[channel] = fields.map((field) => ({ field }));
  } else {
    next[channel] = { field: fields[0] };
  }
  return next as ChartEncoding;
}
