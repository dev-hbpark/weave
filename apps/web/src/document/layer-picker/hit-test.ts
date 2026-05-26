// WI-033 A4 — Layer Picker hit-test. Given a point in design-plane
// coordinates (px from the design's top-left), return every frame that
// covers that point, sorted deepest-first.
//
// Pure: no React, no DOM, no vm. Doc + point in, hits out. Testable in
// isolation; integration with NestedFrame's onContextMenu + the
// viewport→design-plane coordinate transform lives in FrameStage /
// DesignPage.
//
// v1 simplification — rotation is treated as 0 for hit-test purposes.
// Rotated frames still report a hit only when the point is inside their
// axis-aligned bounding box at the rotation = 0 layout. A precise
// rotated hit-test is v1.x polish; the affordance the menu offers
// (a "Select layer" list) tolerates the small false-positive cone at
// rotated frames' corners since the user picks explicitly from the
// list.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import type { ItemFrame } from "../types.js";

export interface LayerHit {
  /** The frame's id (stringified). */
  readonly id: string;
  /** Human-facing label — `attrs.label` if present, "Frame" otherwise. */
  readonly label: string;
  /** Absolute width in design-plane px (rounded). */
  readonly widthPx: number;
  /** Absolute height in design-plane px (rounded). */
  readonly heightPx: number;
  /** Nesting depth — 0 for top-level frames, deeper = larger. Used to
   *  sort deepest-first (the user typically wants the leaf they clicked
   *  on at the top of the picker). */
  readonly depth: number;
  /** Absolute bbox in design-plane px (unrounded). Used by the rubber-
   *  band adapter to re-ratio drag rects into the container's local
   *  frame coords so a drag inside a nested frame produces a child
   *  whose frame ratios are container-local (not design-plane-local). */
  readonly box: AbsoluteFrame;
}

export interface AbsoluteFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function isFrameKind(item: AgocraftItem): boolean {
  return item.kind === "frame";
}

function frameAttrs(item: AgocraftItem): ItemFrame | undefined {
  const attrs = item.attrs as Readonly<Record<string, unknown>>;
  const f = attrs.frame;
  if (
    f === undefined ||
    f === null ||
    typeof f !== "object" ||
    !("x" in f) ||
    !("y" in f) ||
    !("width" in f) ||
    !("height" in f)
  ) {
    return undefined;
  }
  return f as ItemFrame;
}

function frameLabel(item: AgocraftItem): string {
  const attrs = item.attrs as Readonly<Record<string, unknown>>;
  const label = attrs.label;
  return typeof label === "string" && label.length > 0 ? label : "Frame";
}

function composeAbsolute(parent: AbsoluteFrame, child: ItemFrame): AbsoluteFrame {
  return {
    x: parent.x + child.x * parent.width,
    y: parent.y + child.y * parent.height,
    width: child.width * parent.width,
    height: child.height * parent.height,
  };
}

function pointInRect(px: number, py: number, rect: AbsoluteFrame): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

/** Walk the doc tree, collect every frame whose absolute bbox covers
 *  (designX, designY), and return them sorted deepest-first (the leaf
 *  the user is over, then its ancestors).
 *
 *  The root item is excluded — it's the synthetic design wrapper, not
 *  a selectable frame. */
export function findFramesAtPoint(
  doc: AgocraftDocument,
  designX: number,
  designY: number,
  designWidth: number,
  designHeight: number,
): ReadonlyArray<LayerHit> {
  const hits: Array<LayerHit & { readonly _depth: number }> = [];

  const rootBox: AbsoluteFrame = {
    x: 0,
    y: 0,
    width: designWidth,
    height: designHeight,
  };

  function walk(item: AgocraftItem, parentBox: AbsoluteFrame, depth: number): void {
    for (const child of item.children) {
      if (!isFrameKind(child)) continue;
      const cFrame = frameAttrs(child);
      if (cFrame === undefined) continue;
      const cBox = composeAbsolute(parentBox, cFrame);
      if (pointInRect(designX, designY, cBox)) {
        hits.push({
          id: String(child.id),
          label: frameLabel(child),
          widthPx: Math.round(cBox.width),
          heightPx: Math.round(cBox.height),
          depth,
          box: cBox,
          _depth: depth,
        });
      }
      walk(child, cBox, depth + 1);
    }
  }

  walk(doc.root, rootBox, 0);

  // Sort deepest-first; ties keep DOM order (later child paints above
  // earlier ones, which is what the user expects at the top of the list).
  hits.sort((a, b) => b._depth - a._depth);
  return hits.map(({ _depth: _, ...rest }) => rest);
}
