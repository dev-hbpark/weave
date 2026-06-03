// WI-078 Phase C (DR-035) — managed chart labels as REAL text Items, applied as
// a PURE, NON-UNDOABLE PROJECTION.
//
// The user's spec: chart category labels must be ACTUAL weave `text` Items (not
// div overlays), auto-placed where ECharts' (hidden) labels would be. This
// module derives the label set a chart SHOULD have from its dataset and folds it
// into the document tree as real `text` children, each tagged with a
// `chartLabelRef` binding. Editing a label routes back to the dataset (see the
// onUpdateItem interception in DesignPage); the projection then re-derives the
// label text — labels are DERIVED, never an independent source of truth.
//
// Why a projection (not `editor.exec`): labels are NOT user actions. If they
// entered History, every data edit would cost an extra undo step AND — fatally —
// the convergent controller would RE-ADD them the instant an undo removed them,
// so undo could never get past the label layer (a deadlock). Instead the host
// applies these via `reconcileDerived` (DR-035): outside History and outside the
// sync ChangeStream. Each client regenerates labels locally from the synced
// dataset, so they need not travel as patches.
//
// Convergence: the transform returns the SAME document reference when nothing
// drifted, so the driving effect (useChartLabelSync) settles after one pass.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import {
  addChild as coreAddChild,
  removeChild as coreRemoveChild,
  updateChild as coreUpdateChild,
  itemId,
} from "@agocraft/core";
import { toAgocraftItem } from "../../agocraft-mirror.js";
import { resolveDataset } from "../../dataset/dataset-store.js";
import { createDefaultItem } from "../../seed.js";
import type { ChartAttrs, ItemFrame } from "../../types.js";
import { type ChartLabel, categoryLabels, pieLabelLayout } from "./chart-label-layout.js";
import {
  categoryField,
  migrateEncoding,
  seriesField,
  valueAggregate,
  valueFields,
} from "./chart-model.js";
import { distinct, toNumber } from "./echarts-option.js";

/** Binding carried on a managed label text Item (opaque to TextBlock). */
export interface ChartLabelRef {
  readonly chartId: string;
  readonly rowIndex: number;
  /** LONG-format charts (a `series` split) label DISTINCT categories, so the
   *  binding carries the STABLE row indices of every row in that category —
   *  editing writes the new value to each (stable across the per-keystroke
   *  commits, unlike a rename-by-value key that shifts as cells change). Absent
   *  for wide format (rowIndex → that row's cell). */
  readonly rowIndices?: ReadonlyArray<number>;
}

const LABEL_W = 0.2;
const LABEL_H = 0.09;
const EPS = 0.004;

interface DesiredLabel {
  readonly rowIndex: number;
  readonly text: string;
  readonly rowIndices?: ReadonlyArray<number>;
  readonly frame: { x: number; y: number; width: number; height: number; rotation: number };
}

/** Stable, deterministic id for a chart's row-`i` label — so each reconcile
 *  updates the SAME node in place (no churn, selection survives). */
function labelNodeId(chartId: string, rowIndex: number): string {
  return `${chartId}__chartlbl${rowIndex}`;
}

/** Turn a positioned `ChartLabel` (center anchor) into a `DesiredLabel` (a
 *  top-left LABEL_W×LABEL_H frame around it). `rowIndices` is set for long-format
 *  labels (edit writes the new value to every row in the group). */
function toDesired(l: ChartLabel, rowIndices?: ReadonlyArray<number>): DesiredLabel {
  return {
    rowIndex: l.rowIndex,
    text: l.text,
    ...(rowIndices !== undefined ? { rowIndices } : {}),
    frame: {
      x: l.xRatio - LABEL_W / 2,
      y: l.yRatio - LABEL_H / 2,
      width: LABEL_W,
      height: LABEL_H,
      rotation: 0,
    },
  };
}

/** The label set a chart SHOULD have, derived from its dataset. bar/line use the
 *  cartesian ratio layout; pie places labels on the slice circle, which needs
 *  the chart's px ASPECT — derived from the design size × the chart frame
 *  (`designW`/`designH`). Empty for missing data (→ existing labels get
 *  removed). */
export function desiredLabels(
  doc: AgocraftDocument,
  chart: AgocraftItem,
  designW: number,
  designH: number,
): ReadonlyArray<DesiredLabel> {
  const a = chart.attrs as unknown as ChartAttrs;
  if (a.datasetId === "") return [];
  const dataset = resolveDataset(doc, a.datasetId);
  const enc = migrateEncoding(a.encoding);
  const catField = categoryField(enc);
  const valFields = valueFields(enc);
  if (
    dataset === undefined ||
    dataset.rows.length === 0 ||
    valFields.length === 0 ||
    catField === undefined
  )
    return [];
  const categories = dataset.rows.map((r) => String(r[catField] ?? ""));

  if (a.chartType === "pie") {
    const col = valFields[0];
    if (col === undefined) return [];
    const values = dataset.rows.map((r) => toNumber(r[col]));
    const frame = (chart.attrs as { frame?: ItemFrame }).frame;
    const fw = frame?.width ?? 1;
    const fh = frame?.height ?? 1;
    const aspect = (designW * fw) / (designH * fh);
    return pieLabelLayout(categories, values, aspect).map((l) => toDesired(l));
  }

  // Only the cartesian category charts get weave-rendered axis labels. radar
  // (polar tips) and other families keep ECharts' own labels for now — `desired`
  // is empty so the controller projects nothing.
  if (a.chartType === "bar" || a.chartType === "line" || a.chartType === "area") {
    // GROUPED (a `series` split OR an aggregate): label the DISTINCT categories
    // (the x-axis), binding each to the row indices in its group. WIDE + raw:
    // one label per row.
    if (seriesField(enc) !== undefined || valueAggregate(enc) !== undefined) {
      return categoryLabels(a.chartType, distinct(categories)).map((l) => {
        const rowIndices = categories.reduce<number[]>((acc, c, i) => {
          if (c === l.text) acc.push(i);
          return acc;
        }, []);
        return toDesired(l, rowIndices);
      });
    }
    return categoryLabels(a.chartType, categories).map((l) => toDesired(l));
  }
  return [];
}

function labelRefOf(item: AgocraftItem): ChartLabelRef | undefined {
  return (item.attrs as { chartLabelRef?: ChartLabelRef }).chartLabelRef;
}

/** Existing managed-label children of `chart`, keyed by their bound row index. */
function existingLabels(chart: AgocraftItem): Map<number, AgocraftItem> {
  const out = new Map<number, AgocraftItem>();
  for (const child of chart.children) {
    const ref = labelRefOf(child);
    if (child.kind === "text" && ref !== undefined && ref.chartId === String(chart.id)) {
      out.set(ref.rowIndex, child);
    }
  }
  return out;
}

function frameDrift(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    Math.abs(a.x - b.x) > EPS ||
    Math.abs(a.y - b.y) > EPS ||
    Math.abs(a.width - b.width) > EPS ||
    Math.abs(a.height - b.height) > EPS
  );
}

/** Build a real `text` Item node for a managed label — same construction path as
 *  `weave.item.add` (seed defaults + decoration units via `toAgocraftItem`), so
 *  it renders / selects / edits like any text Item — then stamp the deterministic
 *  id + binding. */
function buildLabelNode(chartId: string, d: DesiredLabel): AgocraftItem {
  let weaveItem = createDefaultItem("text", 0);
  weaveItem = {
    ...weaveItem,
    attrs: {
      ...weaveItem.attrs,
      frame: d.frame,
      text: d.text,
      textAlign: "center",
      chartLabelRef: {
        chartId,
        rowIndex: d.rowIndex,
        ...(d.rowIndices !== undefined ? { rowIndices: d.rowIndices } : {}),
      },
    } as typeof weaveItem.attrs,
  };
  const ago = toAgocraftItem(weaveItem, weaveItem.createdAt);
  return { ...ago, id: itemId(labelNodeId(chartId, d.rowIndex)) };
}

/** Project ONE chart's managed labels into `doc`, reading the chart from
 *  `chart` (its pre-projection node). Returns the same `doc` ref when nothing
 *  drifts (idempotent → the driving effect converges). */
export function projectChartLabels(
  doc: AgocraftDocument,
  chart: AgocraftItem,
  designW: number,
  designH: number,
): AgocraftDocument {
  const chartId = String(chart.id);
  const desired = desiredLabels(doc, chart, designW, designH);
  const existing = existingLabels(chart);
  const desiredByRow = new Map(desired.map((d) => [d.rowIndex, d]));

  let next = doc;
  // Adds — desired rows with no existing label.
  for (const d of desired) {
    if (!existing.has(d.rowIndex)) {
      next = coreAddChild(next, buildLabelNode(chartId, d), itemId(chartId));
    }
  }
  // Removes — existing labels whose row no longer exists / pie / no data.
  for (const [row, item] of existing) {
    if (!desiredByRow.has(row)) {
      next = coreRemoveChild(next, item.id);
    }
  }
  // Updates — text / position / binding drift on a surviving label.
  for (const d of desired) {
    const ex = existing.get(d.rowIndex);
    if (ex === undefined) continue;
    const exAttrs = ex.attrs as {
      text?: string;
      frame?: typeof d.frame;
      chartLabelRef?: ChartLabelRef;
    };
    const exIndices = (exAttrs.chartLabelRef?.rowIndices ?? []).join(",");
    if (
      exAttrs.text !== d.text ||
      exAttrs.frame === undefined ||
      frameDrift(exAttrs.frame, d.frame) ||
      exIndices !== (d.rowIndices ?? []).join(",")
    ) {
      next = coreUpdateChild(next, ex.id, (item) => ({
        ...item,
        attrs: {
          ...item.attrs,
          text: d.text,
          frame: d.frame,
          chartLabelRef: {
            chartId,
            rowIndex: d.rowIndex,
            ...(d.rowIndices !== undefined ? { rowIndices: d.rowIndices } : {}),
          },
        },
      }));
    }
  }
  return next;
}

/** Project every chart's managed labels (root children). Pure; returns the same
 *  `doc` ref when no chart drifted. `designW`/`designH` are the design's px size
 *  (needed for pie's circle aspect). Curry with the design size and pass the
 *  result to `reconcileDerived`. */
export function projectAllChartLabels(
  doc: AgocraftDocument,
  designW: number,
  designH: number,
): AgocraftDocument {
  let next = doc;
  for (const child of doc.root.children) {
    if (child.kind === "chart") {
      // Read each chart from the LATEST tree so a prior chart's adds are visible
      // (charts are independent, but this keeps the fold correct in all cases).
      const live = next.root.children.find((c) => c.id === child.id);
      if (live !== undefined) next = projectChartLabels(next, live, designW, designH);
    }
  }
  return next;
}
