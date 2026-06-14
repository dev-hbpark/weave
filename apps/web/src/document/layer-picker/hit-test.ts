// WI-033 A4 / WI-217 S3 (DR-138) — Layer Picker hit-test. Given a point in
// design-plane coordinates (px from the design's top-left), return every FRAME
// that covers that point, topmost-first.
//
// Geometry is the engine's: `computeScene` flattens the doc into absolute,
// rotation-composed boxes and `hitTestScene` does the rotation-aware point-in-box
// test (topmost-first = reverse paint order). This replaces the hand-rolled
// ratio walk + axis-aligned bbox test that lived here (the only other place
// frame geometry was composed in weave) — one geometry owner, and rotated
// frames now hit-test precisely instead of via their bounding-box cone.
//
// Pure: no React, no DOM, no vm. Doc + point in, hits out. Integration with the
// onContextMenu request + the viewport→design-plane transform lives in
// FrameStage / DesignPage; the rubber-band adapter reuses it to resolve a drop
// container.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { hitTestScene } from "@agocraft/editor";
import { computeScene } from "@agocraft/layout";

export interface LayerHit {
  /** The frame's id (stringified). */
  readonly id: string;
  /** Human-facing label — `attrs.label` if present, "Frame" otherwise. */
  readonly label: string;
  /** Absolute width in design-plane px (rounded). */
  readonly widthPx: number;
  /** Absolute height in design-plane px (rounded). */
  readonly heightPx: number;
  /** Nesting depth — 0 for top-level frames, deeper = larger. The picker lists
   *  topmost-first (the leaf the user is over, then its ancestors). */
  readonly depth: number;
  /** Absolute box in design-plane px (the item's own unrotated footprint at its
   *  scene centre). Used by the rubber-band adapter to re-ratio drag rects into
   *  the container's local frame coords so a drag inside a nested frame produces
   *  a child whose ratios are container-local (not design-plane-local). */
  readonly box: AbsoluteFrame;
}

export interface AbsoluteFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function frameLabel(item: AgocraftItem): string {
  const attrs = item.attrs as Readonly<Record<string, unknown>>;
  const label = attrs.label;
  return typeof label === "string" && label.length > 0 ? label : "Frame";
}

/** Index every item by id → its kind + label (one walk; the scene entries carry
 *  only ids, and the picker needs the kind filter + label). */
function indexItems(root: AgocraftItem): Map<string, { kind: string; label: string }> {
  const idx = new Map<string, { kind: string; label: string }>();
  const walk = (n: AgocraftItem): void => {
    idx.set(String(n.id), { kind: n.kind, label: frameLabel(n) });
    for (const c of n.children) walk(c);
  };
  walk(root);
  return idx;
}

/** Every FRAME whose rotation-aware box covers (designX, designY), topmost-first
 *  (the leaf the user clicked, then its ancestors). The synthetic design root is
 *  never emitted by `computeScene`, and non-frame kinds (text / image / shape /
 *  chart) are filtered out — the picker offers selectable container frames. */
export function findFramesAtPoint(
  doc: AgocraftDocument,
  designX: number,
  designY: number,
  designWidth: number,
  designHeight: number,
): ReadonlyArray<LayerHit> {
  const scene = computeScene(doc.root as unknown as AgocraftItem, designWidth, designHeight);
  const idx = indexItems(doc.root as unknown as AgocraftItem);
  const out: LayerHit[] = [];
  for (const e of hitTestScene(scene, { x: designX, y: designY })) {
    const meta = idx.get(String(e.itemId));
    if (meta === undefined || meta.kind !== "frame") continue;
    out.push({
      id: String(e.itemId),
      label: meta.label,
      widthPx: Math.round(e.box.w),
      heightPx: Math.round(e.box.h),
      depth: e.depth,
      box: {
        x: e.center.x - e.box.w / 2,
        y: e.center.y - e.box.h / 2,
        width: e.box.w,
        height: e.box.h,
      },
    });
  }
  return out;
}
