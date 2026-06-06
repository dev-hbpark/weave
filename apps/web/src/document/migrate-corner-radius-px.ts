// Corner-radius ratio → absolute-px migration (load-time, document walk).
//
// History: frame `cornerRadius` and image/video `borderRadius` were stored as a
// 0..1 ratio of the box's short side and rendered ELLIPTICAL (`border-radius:
// N*50%`, SVG `rx = r·0.5·w` / `ry = r·0.5·h`). The corner model is now an
// ABSOLUTE design-px radius, drawn CIRCULAR and clamped to the half-short side
// (see `corner-radius.ts`). To preserve the look of existing docs, each legacy
// ratio is converted to the px that reproduces its SHORT-axis curvature:
//
//     px = ratio · (min(absW, absH) / 2)      // = cornerRadiusFractionToPx
//
// Why a document walk and not an agocraft per-item `Migration`: the px value
// depends on the item's ABSOLUTE box (design-px), which is the product of the
// frame ratios down the ancestor chain × the design's width × height. A
// per-item migration only sees one raw item, never the chain — so the
// conversion has to run here, after the runtime tree + design dims are known.
//
// Gating: this is NOT idempotent (px and ratio are indistinguishable scalars),
// so the caller runs it exactly once, gated on `design.meta.cornerRadiusUnit`,
// and stamps `"px"` afterwards. Re-running on already-px data would saturate
// every corner to a full pill.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { cornerRadiusFractionToPx } from "./corner-radius.js";

interface Box {
  readonly w: number;
  readonly h: number;
}

/** The attr key carrying the radius for each kind that has one. */
const RADIUS_FIELD: Readonly<Record<string, "cornerRadius" | "borderRadius">> = {
  frame: "cornerRadius",
  image: "borderRadius",
  video: "borderRadius",
};

/** Read an item's parent-relative frame ratios (default = fills parent). */
function frameOf(item: AgocraftItem): { width: number; height: number } {
  const f = (item.attrs as { frame?: { width?: number; height?: number } }).frame;
  return { width: f?.width ?? 1, height: f?.height ?? 1 };
}

/** Convert one item's radius attr from ratio → px against its absolute box,
 *  returning the (possibly new) attrs object. */
function convertAttrs(item: AgocraftItem, box: Box): AgocraftItem["attrs"] {
  const field = RADIUS_FIELD[item.kind];
  if (field === undefined) return item.attrs;
  const value = (item.attrs as Record<string, unknown>)[field];
  if (typeof value !== "number" || !(value > 0)) return item.attrs;
  const px = cornerRadiusFractionToPx(value, box.w, box.h);
  if (px === value) return item.attrs;
  return { ...(item.attrs as Record<string, unknown>), [field]: px };
}

/** Recursively rewrite an item (and its subtree). `box` is THIS item's absolute
 *  design-px box; each child's box is `box × child.frame`. Returns the original
 *  reference when nothing in the subtree changed (cheap identity for React /
 *  serialize round-trips). */
function migrateItem(item: AgocraftItem, box: Box): AgocraftItem {
  const nextAttrs = convertAttrs(item, box);
  let childrenChanged = false;
  const nextChildren = item.children.map((child) => {
    const f = frameOf(child);
    const childBox: Box = { w: box.w * f.width, h: box.h * f.height };
    const n = migrateItem(child, childBox);
    if (n !== child) childrenChanged = true;
    return n;
  });
  if (nextAttrs === item.attrs && !childrenChanged) return item;
  return { ...item, attrs: nextAttrs, children: childrenChanged ? nextChildren : item.children };
}

/** Walk the document, converting every frame/image/video corner radius from the
 *  legacy 0..1 ratio to an absolute design-px value. The root maps to the full
 *  `designW × designH` box (matching `absoluteFrameBox`). Returns the original
 *  document reference when nothing changed. */
export function migrateCornerRadiusRatioToPx(
  doc: AgocraftDocument,
  designW: number,
  designH: number,
): AgocraftDocument {
  const rootBox: Box = { w: Math.max(1, designW), h: Math.max(1, designH) };
  const nextRoot = migrateItem(doc.root, rootBox);
  if (nextRoot === doc.root) return doc;
  return { ...doc, root: nextRoot };
}
