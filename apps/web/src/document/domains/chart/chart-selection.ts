// DR-037 — map an intra-chart click onto a selection ROLE per chart FAMILY.
//
// A click means different things in different families, and that mapping used to
// live as inline `chartType === "pie" || "funnel"` checks in ChartBlock — a Rule-6
// discriminant branch. It is now a per-family registry (one row per family, the
// caller declares "mark" vs "legend" and the registry resolves the role):
//
//   - cartesian / matrix : a mark is one DATUM (bar/cell); the legend lists SERIES.
//   - part-to-whole      : the legend lists CATEGORIES (slices) → a legend click is
//     (pie/funnel/gauge)   a datum, same as a slice click.
//   - polar (radar)      : a mark IS a whole polygon = one SERIES. ECharts' radar
//     legend does not emit `legendselectchanged` reliably, so the polygon click is
//     the selection path; its series identity is the data-item name (param.name),
//     which the renderer reports in `info.category`.
//   - hierarchy / flow   : tiles / nodes are datums; their legend (if any) lists
//     (treemap/sankey)     those same names → datum.
//
// Adding a chart type needs no edit here — only its family must be classified once
// (in CHART_TYPE_REGISTRY). Unknown family falls back to cartesian behaviour.

import type { ChartFamily, ChartType } from "./chart-model.js";
import { chartTypeSpec } from "./chart-types.js";
import type { ChartClickInfo } from "./echarts-option.js";

/** The subset of `ChartElementRef` a click produces (the chart item id is added
 *  by the caller). A discriminated union so role-specific fields stay coherent. */
export type ChartSelectionPart =
  | { readonly role: "series"; readonly seriesName: string }
  | {
      readonly role: "datum";
      readonly category: string;
      readonly seriesName?: string;
      readonly value?: number;
      readonly rowIndex?: number;
    };

interface FamilyClickBehavior {
  /** A mark (data point) click selects the whole series, not a single datum.
   *  (polar/radar: a polygon = a series.) */
  readonly markIsSeries: boolean;
  /** The legend lists CATEGORIES, not series → a legend click is a datum.
   *  (part-to-whole / hierarchy / flow.) */
  readonly legendIsDatum: boolean;
}

const BY_FAMILY: Record<ChartFamily, FamilyClickBehavior> = {
  cartesian: { markIsSeries: false, legendIsDatum: false },
  matrix: { markIsSeries: false, legendIsDatum: false },
  "part-to-whole": { markIsSeries: false, legendIsDatum: true },
  polar: { markIsSeries: true, legendIsDatum: false },
  hierarchy: { markIsSeries: false, legendIsDatum: true },
  flow: { markIsSeries: false, legendIsDatum: true },
};

function behavior(type: ChartType): FamilyClickBehavior {
  return BY_FAMILY[chartTypeSpec(type)?.family ?? "cartesian"];
}

/** Resolve a MARK (bar / slice / polygon) click to a selection part. */
export function markSelection(type: ChartType, info: ChartClickInfo): ChartSelectionPart {
  if (behavior(type).markIsSeries) {
    // radar: the polygon's identity is its data-item name, reported as `category`.
    return { role: "series", seriesName: info.category };
  }
  const part: Extract<ChartSelectionPart, { role: "datum" }> = {
    role: "datum",
    category: info.category,
    value: info.value,
    rowIndex: info.dataIndex,
  };
  return info.seriesName === undefined ? part : { ...part, seriesName: info.seriesName };
}

/** Resolve a LEGEND item click (by item `name`) to a selection part. */
export function legendSelection(type: ChartType, name: string): ChartSelectionPart {
  return behavior(type).legendIsDatum
    ? { role: "datum", category: name }
    : { role: "series", seriesName: name };
}
