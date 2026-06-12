// WI-092 — PURE chart geometry kernel (echarts-free, unit-tested fast).
//
// The SelectionLayer draws weave-owned drag handles OUTSIDE the chart DOM, but a
// mark's pixel position is known only to the laid-out chart. Two coordinate
// problems are solved here, both pure:
//
//   1. container ↔ client transform — the echarts div lives inside weave's
//      CSS-transform canvas zoom, so an internal pixel (px,py from echarts'
//      convertToPixel) maps to a client point by the element's measured scale
//      (rect.size / offset.size). The cartesian families (bar/line/area) feed
//      echarts' own convert through these.
//   2. pie angle math — echarts exposes no convert for a pie, so the sector
//      layout (center, radius, per-datum sweep) and the inverse "cursor angle →
//      this datum's value" are computed here from the raw values.
//
// Keeping this echarts-free means the angle/value algebra is tested without the
// 150 KB library; the impure DOM reads + convertToPixel calls live in the
// EChartView-built provider.

/** The element's measured box: its on-screen client rect plus its un-zoomed
 *  layout size (offsetWidth/Height). `rect.width / offsetWidth` is the live CSS
 *  zoom factor of weave's canvas. */
export interface ContainerBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Internal echarts pixel → client (screen) coords, applying the canvas zoom. */
export function containerToClient(box: ContainerBox, px: number, py: number): Point {
  const sx = box.offsetWidth > 0 ? box.width / box.offsetWidth : 1;
  const sy = box.offsetHeight > 0 ? box.height / box.offsetHeight : 1;
  return { x: box.left + px * sx, y: box.top + py * sy };
}

/** Client (screen) coords → internal echarts pixel, undoing the canvas zoom. */
export function clientToContainer(box: ContainerBox, clientX: number, clientY: number): Point {
  const sx = box.offsetWidth > 0 ? box.width / box.offsetWidth : 1;
  const sy = box.offsetHeight > 0 ? box.height / box.offsetHeight : 1;
  return { x: (clientX - box.left) / sx, y: (clientY - box.top) / sy };
}

// ── Pie layout (echarts has no convertToPixel for pies) ─────────────────────

/** Matches the pie option built in `echarts-option.ts` (radius "70%", default
 *  center 50%/50%, default startAngle 90° measured math-CCW from +x = 12
 *  o'clock, sweeping CLOCKWISE). Kept here so the handle geometry stays in lockstep
 *  with the rendered option. */
export const PIE_RADIUS_FRAC = 0.7;
export const PIE_START_ANGLE_DEG = 90;

export interface PieSector {
  /** Leading boundary, math-degrees (CCW from +x). */
  readonly startDeg: number;
  /** Trailing boundary, math-degrees (always `startDeg - sweep`, clockwise). */
  readonly endDeg: number;
  readonly midDeg: number;
  readonly value: number;
}

export interface PieLayout {
  /** Center in internal (un-zoomed) container pixels. */
  readonly cx: number;
  readonly cy: number;
  /** Outer radius in internal pixels. */
  readonly r: number;
  readonly total: number;
  readonly sectors: ReadonlyArray<PieSector>;
}

/** Build the pie sector layout from the ordered datum values + the container's
 *  un-zoomed layout size. Non-finite / negative values are treated as 0. */
export function pieLayout(
  values: ReadonlyArray<number>,
  offsetW: number,
  offsetH: number,
): PieLayout {
  const cx = offsetW / 2;
  const cy = offsetH / 2;
  const r = (Math.min(offsetW, offsetH) / 2) * PIE_RADIUS_FRAC;
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((a, b) => a + b, 0);
  const sectors: PieSector[] = [];
  let acc = 0;
  for (const v of safe) {
    const frac = total > 0 ? v / total : 0;
    const startDeg = PIE_START_ANGLE_DEG - (acc / Math.max(total, 1e-9)) * 360;
    const endDeg = startDeg - frac * 360;
    sectors.push({ startDeg, endDeg, midDeg: (startDeg + endDeg) / 2, value: v });
    acc += v;
  }
  return { cx, cy, r, total, sectors };
}

/** A point on the pie at `deg` (math-degrees) and radius `rad`, in internal px.
 *  Screen-y grows downward, hence the `-sin`. */
export function pointOnPie(layout: PieLayout, deg: number, rad: number): Point {
  const t = (deg * Math.PI) / 180;
  return { x: layout.cx + rad * Math.cos(t), y: layout.cy - rad * Math.sin(t) };
}

/** Math-degrees of a container-pixel point relative to the pie center. */
export function angleFromCenter(layout: PieLayout, px: number, py: number): number {
  return (Math.atan2(-(py - layout.cy), px - layout.cx) * 180) / Math.PI;
}

/** Pixel distance of a container point from the pie center (radial drags use this
 *  to derive the donut inner-radius fraction = dist / outer-radius). */
export function distanceFromCenter(layout: PieLayout, px: number, py: number): number {
  return Math.hypot(px - layout.cx, py - layout.cy);
}

/** Smallest non-negative `a - b` taken CLOCKWISE (degrees), in [0, 360). */
function clockwiseSpan(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d < 0) d += 360;
  return d;
}

/** Inverse of the sweep handle: given the cursor's math-angle, what value must
 *  this sector take so its trailing edge lands there? Growing this datum raises
 *  the total, so the closed-form keeps the OTHER datums' values fixed:
 *
 *    f = sweep/360 = v' / (restTotal + v')   ⇒   v' = f·restTotal / (1 − f)
 *
 *  `restTotal = total − thisValue`. Clamped so a sector can't vanish or eat the
 *  whole pie (f ∈ [minFrac, maxFrac]). Returns null when there is no rest mass
 *  to proportion against (single datum). */
export function pieValueFromAngle(
  sector: PieSector,
  restTotal: number,
  cursorDeg: number,
  opts?: { readonly minFrac?: number; readonly maxFrac?: number },
): number | null {
  if (restTotal <= 0) return null;
  const minFrac = opts?.minFrac ?? 0.01;
  const maxFrac = opts?.maxFrac ?? 0.95;
  const sweep = clockwiseSpan(sector.startDeg, cursorDeg);
  let f = sweep / 360;
  if (!Number.isFinite(f)) return null;
  f = Math.min(maxFrac, Math.max(minFrac, f));
  return (f * restTotal) / (1 - f);
}

// ── Gauge layout (echarts has no convertToPixel for gauges either) ───────────
//
// Matches the gauge option built in `echarts-option.ts` (single dial, FIRST
// row's value, `min:0`, `max:niceCeil(...)`, default ECharts geometry: center
// 50%/50%, radius 75%, startAngle 225° → endAngle −45° measured math-CCW from
// +x, sweeping CLOCKWISE over the top). The progress arc / pointer sit on this
// 270° sweep; the value handle rides the arc at the current value's angle. Kept
// here (echarts-free) so the angle↔value algebra is unit-tested without the
// heavy library, exactly like the pie kernel above.

/** ECharts gauge defaults (gaugeOption overrides none of these, so the rendered
 *  dial uses them verbatim). */
export const GAUGE_RADIUS_FRAC = 0.75;
export const GAUGE_START_DEG = 225;
export const GAUGE_END_DEG = -45;
/** Total clockwise sweep of the dial (225° → −45° = 270°). */
export const GAUGE_SWEEP_DEG = GAUGE_START_DEG - GAUGE_END_DEG;

export interface GaugeLayout {
  /** Center in internal (un-zoomed) container pixels. */
  readonly cx: number;
  readonly cy: number;
  /** Arc radius in internal pixels (where the handle rides). */
  readonly r: number;
  readonly min: number;
  readonly max: number;
}

/** Build the gauge arc layout from the dial's [min,max] domain + the container's
 *  un-zoomed layout size. A non-positive span collapses to [0,1] so callers
 *  always get a usable fraction mapping. */
export function gaugeLayout(
  min: number,
  max: number,
  offsetW: number,
  offsetH: number,
): GaugeLayout {
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1;
  return {
    cx: offsetW / 2,
    cy: offsetH / 2,
    r: (Math.min(offsetW, offsetH) / 2) * GAUGE_RADIUS_FRAC,
    min: lo,
    max: hi,
  };
}

/** Fraction (0..1) of a value within the dial's [min,max] domain, clamped. */
export function gaugeFracForValue(layout: GaugeLayout, value: number): number {
  const span = layout.max - layout.min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - layout.min) / span));
}

/** Math-degrees of the arc point for a value: the dial sweeps CLOCKWISE from
 *  `GAUGE_START_DEG` (min) by `frac · GAUGE_SWEEP_DEG`. */
export function gaugeAngleForValue(layout: GaugeLayout, value: number): number {
  return GAUGE_START_DEG - gaugeFracForValue(layout, value) * GAUGE_SWEEP_DEG;
}

/** A point on the gauge arc at `deg` (math-degrees), in internal px. Screen-y
 *  grows downward, hence the `-sin` (shared convention with `pointOnPie`). */
export function pointOnGauge(layout: GaugeLayout, deg: number, rad = layout.r): Point {
  const t = (deg * Math.PI) / 180;
  return { x: layout.cx + rad * Math.cos(t), y: layout.cy - rad * Math.sin(t) };
}

/** Inverse of the value handle: given the cursor's container point, what value
 *  does its angle map to on the dial? The clockwise span from the dial's start
 *  to the cursor, over the 270° sweep, is the fraction; clamped to [min,max] so
 *  dragging into the bottom opening snaps to the nearer end. */
export function gaugeValueFromPoint(layout: GaugeLayout, px: number, py: number): number {
  const cursorDeg = (Math.atan2(-(py - layout.cy), px - layout.cx) * 180) / Math.PI;
  const frac = Math.min(
    1,
    Math.max(0, clockwiseSpan(GAUGE_START_DEG, cursorDeg) / GAUGE_SWEEP_DEG),
  );
  return layout.min + frac * (layout.max - layout.min);
}
