// WI-078 Phase B (DR-035) — weave-computed chart label layout. weave OWNS the
// plot margins (a fixed contract) so it can place category labels itself
// instead of following ECharts' internal layout. The SAME margins feed the
// ECharts `grid` (echarts-option) so the bars/points line up under weave's
// labels. Pure + echarts-free → unit-testable.

import { CHART_PLOT_MARGINS, type ChartType } from "./echarts-option.js";

// Re-export so the label layout's margins are reachable from one place.
export { CHART_PLOT_MARGINS } from "./echarts-option.js";

/** A positioned category label (ratios of the chart frame, center-anchored). */
export interface ChartLabel {
  /** Stable key = the category name. */
  readonly key: string;
  readonly text: string;
  /** 0..1 of the chart frame. */
  readonly xRatio: number;
  readonly yRatio: number;
  /** Dataset row index (for editing the category cell). */
  readonly rowIndex: number;
}

/** Category-axis label positions for cartesian charts. bar bands center each
 *  label in its slot (boundaryGap); line places labels at the points (i/(N-1)).
 *  Empty for pie (use `pieLabelLayout`) or no categories. */
export function categoryLabels(
  chartType: ChartType,
  categories: ReadonlyArray<string>,
): ReadonlyArray<ChartLabel> {
  if (chartType === "pie" || categories.length === 0) return [];
  const m = CHART_PLOT_MARGINS;
  const plotW = 1 - m.left - m.right;
  const n = categories.length;
  const yRatio = 1 - m.bottom * 0.45; // centered in the bottom inset
  return categories.map((text, i) => {
    const t = chartType === "bar" ? (i + 0.5) / n : n > 1 ? i / (n - 1) : 0.5;
    return { key: text, text, xRatio: m.left + t * plotW, yRatio, rowIndex: i };
  });
}

/** Distance (as a fraction of the chart's SHORTER px side) from the pie center
 *  at which to place a slice's label — just OUTSIDE the pie. ECharts
 *  `radius:"70%"` = 0.35·min(pxW,pxH); 0.42 sits in the gap beyond the rim. */
const PIE_LABEL_FRAC = 0.42;

/** Pie slice label positions, in RATIOS of the chart frame. The pie is a px
 *  CIRCLE centered at (0.5,0.5) of the frame, so a label's ratio offset depends
 *  on the frame's px ASPECT (pxW/pxH) — a circle maps to an ellipse in ratio
 *  space. `aspect` keeps this pure (the caller derives px size from the design
 *  size × the chart frame). Labels sit at each slice's value-weighted mid-angle,
 *  measured from the top, clockwise (ECharts' default startAngle 90°). Empty
 *  when the total is non-positive or the aspect is unusable. */
export function pieLabelLayout(
  categories: ReadonlyArray<string>,
  values: ReadonlyArray<number>,
  aspect: number,
): ReadonlyArray<ChartLabel> {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0 || !Number.isFinite(aspect) || aspect <= 0) return [];
  // Convert the px radius fraction (of the shorter side) into per-axis ratio
  // coefficients. Landscape (aspect≥1, shorter side = height): x is compressed
  // by 1/aspect. Portrait: y is compressed by aspect.
  const cx = aspect >= 1 ? PIE_LABEL_FRAC / aspect : PIE_LABEL_FRAC;
  const cy = aspect >= 1 ? PIE_LABEL_FRAC : PIE_LABEL_FRAC * aspect;
  let cum = 0;
  return categories.map((text, i) => {
    const frac = Math.max(0, values[i] ?? 0) / total;
    const mid = cum + frac / 2;
    cum += frac;
    const rad = ((-90 + mid * 360) * Math.PI) / 180; // top, clockwise
    return {
      key: text,
      text,
      xRatio: 0.5 + cx * Math.cos(rad),
      yRatio: 0.5 + cy * Math.sin(rad),
      rowIndex: i,
    };
  });
}
