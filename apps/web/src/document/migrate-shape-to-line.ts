// DR-025 / WI-062 Phase 6 — migrate legacy "line-as-shape" items to the `line`
// KIND on load.
//
// Before the `line` kind existed, lines were modelled as `shape` items:
//   • open `poly`  (closed:false)         → 자유선 / 곡선 (자유곡선 = smooth)
//   • `line` sub-kind (horizontal midline) → 직선
//   • `arrow` sub-kind                     → 화살표 (carried `heads`)
// This walker rewrites each of those to a top-level `line` item, moving the
// vertices to `attrs.points` and the arrow heads to `attrs.heads`. Closed
// polys / other shapes are left untouched (they remain 도형). The solid fill
// unit (the shape's only paint) becomes a `decoration.stroke` unit so the
// migrated line keeps its colour; non-solid fills fall back to the default
// stroke. Idempotent — docs with no convertible shapes return by identity.

import {
  type Document as AgocraftDocument,
  FILL_UNIT_KIND,
  type Item as AgocraftItem,
  type PaintSpec,
  STROKE_UNIT_KIND,
  type StrokeSpec,
} from "@agocraft/core";

type Pt = { readonly x: number; readonly y: number };
const TWO_POINT: ReadonlyArray<Pt> = [
  { x: 0, y: 0.5 },
  { x: 1, y: 0.5 },
];
const NO_HEADS = { start: "none", end: "none" } as const;

/** Public entry — rewrite line-as-shape items to the `line` kind, recursively. */
export function migrateShapeLinesToLineKind(doc: AgocraftDocument): AgocraftDocument {
  const next = migrateItem(doc.root);
  return next === doc.root ? doc : { ...doc, root: next };
}

function migrateItem(item: AgocraftItem): AgocraftItem {
  let childrenChanged = false;
  const nextChildren = item.children.map((c) => {
    const n = migrateItem(c);
    if (n !== c) childrenChanged = true;
    return n;
  });
  const converted = convertShapeToLine(item);
  if (converted === null) {
    return childrenChanged ? { ...item, children: nextChildren } : item;
  }
  return { ...converted, children: nextChildren };
}

/** Returns the converted `line` Item, or null when `item` is not a line-shape. */
function convertShapeToLine(item: AgocraftItem): AgocraftItem | null {
  if (item.kind !== "shape") return null;
  const attrs = item.attrs as {
    frame?: unknown;
    subAttrs?: {
      shape?: string;
      points?: ReadonlyArray<Pt>;
      closed?: boolean;
      smooth?: boolean;
      heads?: { start: string; end: string };
    };
  };
  const sub = attrs.subAttrs;
  if (sub === undefined || attrs.frame === undefined) return null;

  let lineAttrs: Readonly<Record<string, unknown>> | null = null;
  if (sub.shape === "poly" && sub.closed === false) {
    lineAttrs = {
      frame: attrs.frame,
      points: sub.points ?? TWO_POINT,
      smooth: sub.smooth ?? false,
      heads: NO_HEADS,
    };
  } else if (sub.shape === "line") {
    lineAttrs = { frame: attrs.frame, points: TWO_POINT, smooth: false, heads: NO_HEADS };
  } else if (sub.shape === "arrow") {
    lineAttrs = {
      frame: attrs.frame,
      points: TWO_POINT,
      smooth: false,
      heads: sub.heads ?? NO_HEADS,
    };
  }
  if (lineAttrs === null) return null;

  return {
    id: item.id, // preserve id → undo / sync / refs stay valid
    kind: "line",
    attrs: lineAttrs,
    units: convertFillToStroke(item.units),
    children: item.children,
    meta: item.meta,
  } as AgocraftItem;
}

/** Turn a solid `decoration.fill` unit into a `decoration.stroke` (lines are
 *  stroke-only). Drops the fill when a stroke already exists or the fill is
 *  non-solid (the line then renders with the default hairline). */
function convertFillToStroke(units: AgocraftItem["units"]): AgocraftItem["units"] {
  const hasStroke = units.some((u) => u.kind === STROKE_UNIT_KIND);
  return units.flatMap((u) => {
    if (u.kind !== FILL_UNIT_KIND) return [u];
    if (hasStroke) return [];
    const paint = u.attrs as unknown as PaintSpec;
    if (paint?.type !== "solid") return [];
    const stroke: StrokeSpec = { paint, width: 2, lineCap: "round", lineJoin: "round" };
    return [{ ...u, kind: STROKE_UNIT_KIND, attrs: stroke as unknown as typeof u.attrs }];
  });
}
