// WI-092 — builds the per-chart `ChartGeometryProvider` that the SelectionLayer
// view-model uses. This is the ONE impure seam: it closes over a laid-out
// echarts instance (cartesian families answer via `convertToPixel` /
// `convertFromPixel`; the pie family is computed from the pure `chart-geometry`
// kernel because echarts has no pie convert) and the container element (for the
// zoom-aware client↔container transform). All algebra lives in `chart-geometry`.
//
// Family dispatch is a REGISTRY keyed off the laid-out series type (Rule 6 — no
// switch in business logic): bar/line/area → the cartesian adapter, pie → the
// pie adapter. Reading the family from the rendered option keeps the handle in
// lockstep with what echarts actually drew (aggregation / variant included).
//
// A family may offer MORE than one handle: a bar carries a value handle (top,
// vertical → dataset cell) AND a width handle (side edge, horizontal → the
// chart's `barWidth` attr). Each handle's `valueAt` re-reads the live geometry,
// so it stays correct while the chart moves mid-drag.

import type { ChartElementRef } from "./chart-element-store.js";
import {
  angleFromCenter,
  type ContainerBox,
  clientToContainer,
  containerToClient,
  distanceFromCenter,
  gaugeAngleForValue,
  gaugeLayout,
  gaugeValueFromPoint,
  pieLayout,
  pieValueFromAngle,
  pointOnGauge,
  pointOnPie,
} from "./chart-geometry.js";
import type {
  ChartElementBounds,
  ChartGeometryProvider,
  ChartHandleAnchor,
  ChartHandleKind,
  ChartHandleSpec,
  ChartHandleValue,
} from "./chart-geometry-store.js";

/** The slice of the echarts instance the provider needs. Loosely typed so this
 *  module never imports the heavy library. */
export interface EchartsLike {
  convertToPixel(finder: unknown, value: unknown): number[] | number | null;
  convertFromPixel(finder: unknown, value: unknown): number[] | number | null;
  getOption(): {
    series?: ReadonlyArray<{
      readonly type?: string;
      readonly name?: string;
      readonly data?: unknown;
      readonly barWidth?: unknown;
      readonly radius?: unknown;
      readonly min?: unknown;
      readonly max?: unknown;
    }>;
  };
}

export interface ChartGeometryDeps {
  /** Live echarts instance, or null before mount / after dispose. */
  readonly getChart: () => EchartsLike | null;
  /** Live container element, or null. */
  readonly getEl: () => HTMLElement | null;
  /** WI-092 — resolve the selected bar's CURRENT thickness fraction (0..1) from
   *  the live document (per-datum override → chart default → DEFAULT_BAR_FRAC).
   *  Needed because a custom (per-bar-width) bar series carries no `barWidth` the
   *  provider could read back. Omitted → fall back to the laid-out series value. */
  readonly barFracAt?: (ref: ChartElementRef) => number | undefined;
}

/** Default bar thickness fraction when `barWidth` is unset (ECharts auto ≈ this
 *  for a single series), used to position the width handle before any drag. */
const DEFAULT_BAR_FRAC = 0.6;
const MIN_BAR_FRAC = 0.05;

/** Magnitude of a laid-out datum across the shapes weave emits: a bare number, a
 *  `{ value }` (override) datum, or the WI-092 custom-bar `{ value: [catIdx, v] }`
 *  tuple — take the last element of an array value. */
function datumValue(d: unknown): number {
  const scalar = (v: unknown): number => {
    if (Array.isArray(v)) return scalar(v[v.length - 1]);
    return typeof v === "number" ? v : Number(v) || 0;
  };
  if (typeof d === "number") return d;
  if (d !== null && typeof d === "object" && "value" in d)
    return scalar((d as { value: unknown }).value);
  return Number(d) || 0;
}

function boxOf(el: HTMLElement): ContainerBox {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    offsetWidth: el.offsetWidth,
    offsetHeight: el.offsetHeight,
  };
}

interface Ctx {
  readonly chart: EchartsLike;
  readonly box: ContainerBox;
  readonly ref: ChartElementRef;
  readonly series: ReadonlyArray<{
    type?: string;
    name?: string;
    data?: unknown;
    barWidth?: unknown;
    radius?: unknown;
    min?: unknown;
    max?: unknown;
  }>;
  /** Live per-bar thickness resolver (see {@link ChartGeometryDeps.barFracAt}). */
  readonly barFracAt?: (ref: ChartElementRef) => number | undefined;
}

/** True for a series that draws bars — the normal `bar` OR the WI-092 `custom`
 *  single-series-bar renderer (per-datum widths). */
function isBarSeries(type: string | undefined): boolean {
  return type === "bar" || type === "custom";
}

/** One handle a family offers for the selected element. `anchor`/`valueAt` both
 *  take a FRESH ctx so they reflect live geometry (anchor recomputed each frame,
 *  valueAt recomputed each drag move). */
interface FamilyHandle {
  readonly kind: ChartHandleKind;
  anchor(ctx: Ctx): ChartHandleAnchor | null;
  valueAt(ctx: Ctx, clientX: number, clientY: number): ChartHandleValue | null;
}

interface FamilyGeometry {
  handles(ctx: Ctx): ReadonlyArray<FamilyHandle>;
  /** The selected mark's client-coord bounding box (selection outline), or null
   *  when the family has no rectangular bound. */
  bounds?(ctx: Ctx): ChartElementBounds | null;
}

/** Find the laid-out series index for the selected element (by name; falls back
 *  to series 0 for a single-series chart). */
function seriesIndexOf(ctx: Ctx): number {
  const name = ctx.ref.seriesName;
  if (name !== undefined) {
    const i = ctx.series.findIndex((s) => s.name === name);
    if (i >= 0) return i;
  }
  return 0;
}

// ── cartesian value handle (bar height / line·area point): vertical drag ─────
const valueHandle: FamilyHandle = {
  kind: "value",
  anchor(ctx) {
    const si = seriesIndexOf(ctx);
    const catIdx = ctx.ref.rowIndex ?? -1;
    if (catIdx < 0) return null;
    const data = ctx.series[si]?.data;
    const value = Array.isArray(data) ? datumValue(data[catIdx]) : (ctx.ref.value ?? 0);
    const px = ctx.chart.convertToPixel({ seriesIndex: si }, [catIdx, value]);
    if (!Array.isArray(px)) return null;
    const pt = containerToClient(ctx.box, px[0] ?? 0, px[1] ?? 0);
    return { x: pt.x, y: pt.y, axis: "y" };
  },
  valueAt(ctx, clientX, clientY) {
    const si = seriesIndexOf(ctx);
    const c = clientToContainer(ctx.box, clientX, clientY);
    const res = ctx.chart.convertFromPixel({ seriesIndex: si }, [c.x, c.y]);
    if (!Array.isArray(res)) return null;
    const v = res[1];
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : null;
  },
};

// ── bar width handle (side edge): horizontal drag → barWidth fraction ────────
/** Category band width in container px, from the gap between adjacent category
 *  centers (works for any index when ≥ 2 categories); falls back to a share of
 *  the plot width for a single category. */
function bandWidthPx(ctx: Ctx, si: number, catIdx: number): number {
  const x = (i: number): number | null => {
    const p = ctx.chart.convertToPixel({ seriesIndex: si }, [i, 0]);
    return Array.isArray(p) ? (p[0] ?? null) : null;
  };
  const here = x(catIdx);
  const next = x(catIdx + 1);
  const prev = x(catIdx - 1);
  if (here !== null && next !== null) return Math.abs(next - here);
  if (here !== null && prev !== null) return Math.abs(here - prev);
  return ctx.box.offsetWidth * 0.6; // single-category fallback
}

/** Current bar thickness fraction. A custom (per-bar) series exposes no width, so
 *  prefer the live document resolver (`barFracAt`); else parse the laid-out
 *  normal-bar `barWidth: "<pct>%"`; else the ECharts-ish default. */
function currentBarFrac(ctx: Ctx, si: number): number {
  const fromDoc = ctx.barFracAt?.(ctx.ref);
  if (fromDoc !== undefined && Number.isFinite(fromDoc)) return fromDoc;
  const bw = ctx.series[si]?.barWidth;
  if (typeof bw === "string" && bw.endsWith("%")) {
    const n = Number.parseFloat(bw);
    if (Number.isFinite(n)) return n / 100;
  }
  return DEFAULT_BAR_FRAC;
}

/** The width-handle anchor for an EXPLICIT category index (right-edge, vertical
 *  middle of the bar). Shared by the per-bar handle (uses the selected datum's
 *  index) and the chart-level handles (iterate every index). */
function barWidthAnchorAt(
  ctx: Ctx,
  si: number,
  catIdx: number,
  frac: number,
): ChartHandleAnchor | null {
  if (catIdx < 0) return null;
  const data = ctx.series[si]?.data;
  const value = Array.isArray(data) ? datumValue(data[catIdx]) : 0;
  const top = ctx.chart.convertToPixel({ seriesIndex: si }, [catIdx, value]);
  const base = ctx.chart.convertToPixel({ seriesIndex: si }, [catIdx, 0]);
  if (!Array.isArray(top) || !Array.isArray(base)) return null;
  const cx = top[0] ?? 0;
  const midY = ((top[1] ?? 0) + (base[1] ?? 0)) / 2;
  const half = (frac * bandWidthPx(ctx, si, catIdx)) / 2;
  const pt = containerToClient(ctx.box, cx + half, midY);
  return { x: pt.x, y: pt.y, axis: "x" };
}

/** Cursor → bar thickness fraction for an EXPLICIT category index. */
function barWidthFracAt(
  ctx: Ctx,
  si: number,
  catIdx: number,
  clientX: number,
  clientY: number,
): number | null {
  if (catIdx < 0) return null;
  const base = ctx.chart.convertToPixel({ seriesIndex: si }, [catIdx, 0]);
  if (!Array.isArray(base)) return null;
  const cx = base[0] ?? 0;
  const band = bandWidthPx(ctx, si, catIdx);
  if (band <= 0) return null;
  const c = clientToContainer(ctx.box, clientX, clientY);
  const half = Math.abs(c.x - cx);
  return Math.min(1, Math.max(MIN_BAR_FRAC, (2 * half) / band));
}

const widthHandle: FamilyHandle = {
  kind: "bar-width",
  anchor(ctx) {
    const si = seriesIndexOf(ctx);
    return barWidthAnchorAt(ctx, si, ctx.ref.rowIndex ?? -1, currentBarFrac(ctx, si));
  },
  valueAt(ctx, clientX, clientY) {
    return barWidthFracAt(ctx, seriesIndexOf(ctx), ctx.ref.rowIndex ?? -1, clientX, clientY);
  },
};

/** Exactly one bar-like series → per-bar width is meaningful (a single bar per
 *  category, no grouped sub-slots that widening would overlap). */
function singleBarChart(ctx: Ctx): boolean {
  const si = seriesIndexOf(ctx);
  if (!isBarSeries(ctx.series[si]?.type)) return false;
  return ctx.series.filter((s) => isBarSeries(s.type)).length === 1;
}

const cartesianGeometry: FamilyGeometry = {
  handles(ctx) {
    // The width handle exists only for a single-series bar (per-bar width);
    // line/area marks have no thickness, grouped bars would overlap.
    return singleBarChart(ctx) ? [valueHandle, widthHandle] : [valueHandle];
  },
  // Only a single-series BAR has a rectangular bound; the height/width handles
  // sit on its top-center / right-center edges.
  bounds(ctx) {
    const si = seriesIndexOf(ctx);
    if (!singleBarChart(ctx)) return null;
    const catIdx = ctx.ref.rowIndex ?? -1;
    if (catIdx < 0) return null;
    const data = ctx.series[si]?.data;
    const value = Array.isArray(data) ? datumValue(data[catIdx]) : (ctx.ref.value ?? 0);
    const top = ctx.chart.convertToPixel({ seriesIndex: si }, [catIdx, value]);
    const base = ctx.chart.convertToPixel({ seriesIndex: si }, [catIdx, 0]);
    if (!Array.isArray(top) || !Array.isArray(base)) return null;
    const cx = top[0] ?? 0;
    const half = (currentBarFrac(ctx, si) * bandWidthPx(ctx, si, catIdx)) / 2;
    const tl = containerToClient(ctx.box, cx - half, Math.min(top[1] ?? 0, base[1] ?? 0));
    const br = containerToClient(ctx.box, cx + half, Math.max(top[1] ?? 0, base[1] ?? 0));
    return {
      left: Math.min(tl.x, br.x),
      top: Math.min(tl.y, br.y),
      width: Math.abs(br.x - tl.x),
      height: Math.abs(br.y - tl.y),
    };
  },
};

// ── pie: sweep handle on the slice's trailing edge ──────────────────────────
function pieValues(ctx: Ctx): ReadonlyArray<number> {
  const data = ctx.series[0]?.data;
  return Array.isArray(data) ? data.map(datumValue) : [];
}

const pieSweepHandle: FamilyHandle = {
  kind: "value",
  anchor(ctx) {
    const idx = ctx.ref.rowIndex ?? -1;
    if (idx < 0) return null;
    const layout = pieLayout(pieValues(ctx), ctx.box.offsetWidth, ctx.box.offsetHeight);
    const sector = layout.sectors[idx];
    if (sector === undefined) return null;
    const p = pointOnPie(layout, sector.endDeg, layout.r);
    const pt = containerToClient(ctx.box, p.x, p.y);
    return { x: pt.x, y: pt.y, axis: "angular" };
  },
  valueAt(ctx, clientX, clientY) {
    const idx = ctx.ref.rowIndex ?? -1;
    if (idx < 0) return null;
    const layout = pieLayout(pieValues(ctx), ctx.box.offsetWidth, ctx.box.offsetHeight);
    const sector = layout.sectors[idx];
    if (sector === undefined) return null;
    const c = clientToContainer(ctx.box, clientX, clientY);
    const deg = angleFromCenter(layout, c.x, c.y);
    return pieValueFromAngle(sector, layout.total - sector.value, deg);
  },
};

// Minimum grab radius (fraction of the outer) so the inner-radius handle is
// reachable even on a solid pie (innerRadius 0 → handle near, not AT, the center).
const PIE_INNER_MIN_GRAB_FRAC = 0.18;
const PIE_INNER_MAX_FRAC = 0.9;

/** Current donut inner-radius as a fraction of the outer, read from the laid-out
 *  pie `radius` (we render it as `[inner%, outer%]`; a bare string = solid pie). */
function currentInnerFrac(ctx: Ctx): number {
  const r = ctx.series[0]?.radius;
  if (Array.isArray(r) && r.length >= 2) {
    const inner = Number.parseFloat(String(r[0]));
    const outer = Number.parseFloat(String(r[1]));
    if (Number.isFinite(inner) && Number.isFinite(outer) && outer > 0) {
      return Math.min(1, Math.max(0, inner / outer));
    }
  }
  return 0;
}

// ── pie inner-radius (donut) handle: radial drag near the center ─────────────
const pieInnerRadiusHandle: FamilyHandle = {
  kind: "pie-inner-radius",
  anchor(ctx) {
    const idx = ctx.ref.rowIndex ?? -1;
    if (idx < 0) return null;
    const layout = pieLayout(pieValues(ctx), ctx.box.offsetWidth, ctx.box.offsetHeight);
    const sector = layout.sectors[idx];
    if (sector === undefined) return null;
    const grabR = Math.max(currentInnerFrac(ctx), PIE_INNER_MIN_GRAB_FRAC) * layout.r;
    const p = pointOnPie(layout, sector.midDeg, grabR);
    const pt = containerToClient(ctx.box, p.x, p.y);
    return { x: pt.x, y: pt.y, axis: "radial" };
  },
  valueAt(ctx, clientX, clientY) {
    const layout = pieLayout(pieValues(ctx), ctx.box.offsetWidth, ctx.box.offsetHeight);
    if (layout.r <= 0) return null;
    const c = clientToContainer(ctx.box, clientX, clientY);
    const dist = distanceFromCenter(layout, c.x, c.y);
    return Math.min(PIE_INNER_MAX_FRAC, Math.max(0, dist / layout.r));
  },
};

const pieGeometry: FamilyGeometry = {
  handles: () => [pieSweepHandle, pieInnerRadiusHandle],
};

// ── gauge: a single value handle riding the dial arc (angular drag) ──────────
/** Read a numeric option field, or a fallback when absent / non-finite. */
function optNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** The gauge dial's [min,max] domain as the laid-out option carries it
 *  (`gaugeOption` sets `min:0` + a nice-ceiling `max`; defaults guard skew). */
function gaugeDomain(ctx: Ctx): { min: number; max: number } {
  const s = ctx.series[0];
  const min = optNum(s?.min, 0);
  const max = optNum(s?.max, min + 1);
  return { min, max: max > min ? max : min + 1 };
}

/** The gauge's displayed value (the FIRST data item — the dial shows one row). */
function gaugeDisplayValue(ctx: Ctx): number {
  const data = ctx.series[0]?.data;
  const idx = ctx.ref.rowIndex ?? 0;
  if (Array.isArray(data)) return datumValue(data[idx >= 0 ? idx : 0]);
  return ctx.ref.value ?? 0;
}

const gaugeValueHandle: FamilyHandle = {
  kind: "value",
  anchor(ctx) {
    const { min, max } = gaugeDomain(ctx);
    const layout = gaugeLayout(min, max, ctx.box.offsetWidth, ctx.box.offsetHeight);
    const p = pointOnGauge(layout, gaugeAngleForValue(layout, gaugeDisplayValue(ctx)));
    const pt = containerToClient(ctx.box, p.x, p.y);
    return { x: pt.x, y: pt.y, axis: "angular" };
  },
  valueAt(ctx, clientX, clientY) {
    const { min, max } = gaugeDomain(ctx);
    const layout = gaugeLayout(min, max, ctx.box.offsetWidth, ctx.box.offsetHeight);
    const c = clientToContainer(ctx.box, clientX, clientY);
    return gaugeValueFromPoint(layout, c.x, c.y);
  },
};

const gaugeGeometry: FamilyGeometry = {
  handles: () => [gaugeValueHandle],
};

// ── scatter / bubble: a 2-D point handle (free drag → x·y dataset cells) ─────
/** A scatter datum is laid out as `[x, y]` (bubble adds a 3rd `size` slot). Read
 *  the positional pair; null when the shape isn't a usable point. */
function pointXY(d: unknown): readonly [number, number] | null {
  if (!Array.isArray(d) || d.length < 2) return null;
  const x = Number(d[0]);
  const y = Number(d[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

const scatterPointHandle: FamilyHandle = {
  kind: "point",
  anchor(ctx) {
    const si = seriesIndexOf(ctx);
    const idx = ctx.ref.rowIndex ?? -1;
    if (idx < 0) return null;
    const data = ctx.series[si]?.data;
    const pt = Array.isArray(data) ? pointXY(data[idx]) : null;
    if (pt === null) return null;
    const px = ctx.chart.convertToPixel({ seriesIndex: si }, [pt[0], pt[1]]);
    if (!Array.isArray(px)) return null;
    const c = containerToClient(ctx.box, px[0] ?? 0, px[1] ?? 0);
    return { x: c.x, y: c.y, axis: "free" };
  },
  valueAt(ctx, clientX, clientY) {
    const si = seriesIndexOf(ctx);
    const c = clientToContainer(ctx.box, clientX, clientY);
    const res = ctx.chart.convertFromPixel({ seriesIndex: si }, [c.x, c.y]);
    if (!Array.isArray(res)) return null;
    const x = res[0];
    const y = res[1];
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  },
};

const scatterGeometry: FamilyGeometry = {
  handles: () => [scatterPointHandle],
};

/** Laid-out series type → handle family (registry, not switch). */
const FAMILY_BY_SERIES_TYPE: Readonly<Record<string, FamilyGeometry>> = {
  bar: cartesianGeometry,
  line: cartesianGeometry, // area is a line series with areaStyle
  custom: cartesianGeometry, // WI-092 single-series bar (per-datum widths)
  pie: pieGeometry,
  gauge: gaugeGeometry, // WI-192 single-dial value handle (angular drag)
  scatter: scatterGeometry, // WI-193 2-D point handle (bubble renders as scatter too)
};

export function createChartGeometryProvider(deps: ChartGeometryDeps): ChartGeometryProvider {
  function ctxFor(ref: ChartElementRef): Ctx | null {
    const chart = deps.getChart();
    const el = deps.getEl();
    if (chart === null || el === null) return null;
    const series = chart.getOption().series ?? [];
    if (series.length === 0) return null;
    return {
      chart,
      box: boxOf(el),
      ref,
      series,
      ...(deps.barFracAt !== undefined ? { barFracAt: deps.barFracAt } : {}),
    };
  }
  function familyFor(ctx: Ctx): FamilyGeometry | null {
    const si = ctx.ref.role === "datum" ? seriesIndexOf(ctx) : 0;
    const type = ctx.series[si]?.type ?? ctx.series[0]?.type ?? "";
    return FAMILY_BY_SERIES_TYPE[type] ?? null;
  }
  return {
    handles(ref) {
      const ctx = ctxFor(ref);
      if (ctx === null) return [];
      const family = familyFor(ctx);
      if (family === null) return [];
      const specs: ChartHandleSpec[] = [];
      for (const fh of family.handles(ctx)) {
        const anchor = fh.anchor(ctx);
        if (anchor === null) continue;
        specs.push({
          kind: fh.kind,
          anchor,
          // Re-read the live geometry each move so the mapping tracks the chart.
          valueAtClient: (cx, cy) => {
            const fresh = ctxFor(ref);
            return fresh === null ? null : fh.valueAt(fresh, cx, cy);
          },
        });
      }
      return specs;
    },
    bounds(ref) {
      const ctx = ctxFor(ref);
      if (ctx === null) return null;
      const family = familyFor(ctx);
      return family?.bounds?.(ctx) ?? null;
    },
    barWidthHandles() {
      // A ref-less context (chart-level): series 0, the chart-wide default width.
      const ref: ChartElementRef = { chartItemId: "", role: "series" };
      const ctx = ctxFor(ref);
      if (ctx === null || !singleBarChart(ctx)) return [];
      const si = seriesIndexOf(ctx);
      const data = ctx.series[si]?.data;
      const n = Array.isArray(data) ? data.length : 0;
      const frac = ctx.barFracAt?.(ref) ?? DEFAULT_BAR_FRAC; // global default
      const out: ChartHandleSpec[] = [];
      for (let catIdx = 0; catIdx < n; catIdx++) {
        const anchor = barWidthAnchorAt(ctx, si, catIdx, frac);
        if (anchor === null) continue;
        out.push({
          kind: "global-bar-width",
          anchor,
          rowIndex: catIdx,
          valueAtClient: (cx, cy) => {
            const fresh = ctxFor(ref);
            return fresh === null ? null : barWidthFracAt(fresh, si, catIdx, cx, cy);
          },
        });
      }
      return out;
    },
  };
}
