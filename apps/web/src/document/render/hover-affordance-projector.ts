// WI-040 Phase 3 — HoverAffordanceLayer host projector.
//
// Pure function. Maps the hover + selection state plus the document
// tree onto the three rects the `HoverAffordanceLayer` primitive
// renders (hovered / descendants / parent), in design-plane absolute
// pixels.
//
// 2026-05-27 — scope change (user spec):
//   • Tree siblings are NO LONGER part of the projection. Hovering an
//     item must not paint anything on its peers.
//   • Instead, the hover effect propagates DOWN into the hovered item's
//     entire children tree, and UP exactly one level to the direct
//     parent. The geometric set is: { hovered, all descendants of
//     hovered, direct parent (skipping root) }.
//
// Two source paths:
//   1. The pointer is over a frame Item (kind ∈ {frame, image, video,
//      text} per the host's HoverKind union). Descendants come from
//      walking the hovered item's own `children` tree recursively. The
//      parent tier is the direct parent Item (the design root is
//      skipped — tinting the entire canvas is noise).
//   2. The pointer is over a canvas-shape inside a frame's
//      `attrs.shapes[]` array. Shapes have no children, so descendants
//      is empty; the "parent" tier is the containing frame.
//
// Other hover kinds (handle, hotspot, background, none) return an
// empty projection — the layer hides everything.
//
// Selection exclusion (DR-design-016 §"Selection chrome 와 겹침
// 방지"): any id in `selectedIds` is filtered out before the rects
// are built, so hover overlay never paints over selection chrome.
// hovered is dropped when its id is selected; descendants are filtered
// element-wise; parent is dropped when its id is selected.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { absoluteFrameBox, findItemDeep, findParentAndIndex } from "../agocraft-mirror.js";
import type { CanvasShape, ItemFrame } from "../types.js";

export interface ProjectorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly id: string;
}

export interface HoverAffordanceProjection {
  readonly hovered: ProjectorRect | null;
  /** Every Item in the hovered item's own subtree (children +
   *  grandchildren …). Empty when the hovered item is a leaf, when it
   *  is a canvas-shape (shapes have no children), or when every
   *  descendant is in `selectedIds`. */
  readonly descendants: ReadonlyArray<ProjectorRect>;
  readonly parent: ProjectorRect | null;
}

const EMPTY: HoverAffordanceProjection = {
  hovered: null,
  descendants: [],
  parent: null,
};

/** Hover kinds for which the affordance overlay paints. Other kinds
 *  (handle, hotspot, background, none) return EMPTY — the layer is
 *  inactive there. */
export type ProjectableHoverKind = "frame" | "image" | "video" | "text" | "shape";

export interface ProjectHoverAffordanceInput {
  readonly doc: AgocraftDocument;
  readonly hoveredKind: string;
  readonly hoveredId: string | undefined;
  readonly designWidth: number;
  readonly designHeight: number;
  /** Items / shapes whose id is in this set are dropped from the
   *  projection so the SelectionLayer chrome owns their visual.
   *  Pass an empty set when no selection is active. */
  readonly selectedIds: ReadonlySet<string>;
}

export function projectHoverAffordance(
  input: ProjectHoverAffordanceInput,
): HoverAffordanceProjection {
  const { doc, hoveredKind, hoveredId, designWidth, designHeight, selectedIds } = input;
  if (hoveredId === undefined) return EMPTY;
  if (!isProjectableKind(hoveredKind)) return EMPTY;
  if (hoveredKind === "shape") {
    return projectShape(doc, hoveredId, designWidth, designHeight, selectedIds);
  }
  return projectFrame(doc, hoveredId, designWidth, designHeight, selectedIds);
}

function isProjectableKind(kind: string): kind is ProjectableHoverKind {
  return (
    kind === "frame" || kind === "image" || kind === "video" || kind === "text" || kind === "shape"
  );
}

function projectFrame(
  doc: AgocraftDocument,
  hoveredId: string,
  designWidth: number,
  designHeight: number,
  selectedIds: ReadonlySet<string>,
): HoverAffordanceProjection {
  const item = findItemDeep(doc, hoveredId);
  if (item === undefined) return EMPTY;
  const hoveredBox = absoluteFrameBox(doc, hoveredId, designWidth, designHeight);
  if (hoveredBox === null) return EMPTY;
  const hovered: ProjectorRect | null = selectedIds.has(hoveredId)
    ? null
    : rectOf(hoveredBox, hoveredId, extractRotation(item));

  // Parent: direct parent only (one level up). Skip when it's the
  // design root — tinting the entire canvas is noise. User-confirmed
  // scope (2026-05-27): "한 단계 위 부모".
  const parentInfo = findParentAndIndex(doc, hoveredId);
  let parent: ProjectorRect | null = null;
  if (parentInfo !== undefined) {
    const { parent: parentItem } = parentInfo;
    const parentId = String(parentItem.id);
    const isRoot = parentId === String(doc.root.id);
    if (!isRoot) {
      const parentBox = absoluteFrameBox(doc, parentId, designWidth, designHeight);
      if (parentBox !== null && !selectedIds.has(parentId)) {
        parent = rectOf(parentBox, parentId, extractRotation(parentItem));
      }
    }
  }

  // Descendants: every Item under the hovered item's subtree. The
  // hovered item itself is excluded (it's its own tier). Selected
  // descendants drop out element-wise so the SelectionLayer owns
  // their chrome.
  const descendants = collectDescendants(doc, item, designWidth, designHeight, selectedIds);
  return { hovered, descendants, parent };
}

function collectDescendants(
  doc: AgocraftDocument,
  hoveredItem: AgocraftItem,
  designWidth: number,
  designHeight: number,
  selectedIds: ReadonlySet<string>,
): ReadonlyArray<ProjectorRect> {
  const out: ProjectorRect[] = [];
  const walk = (item: AgocraftItem): void => {
    for (const child of item.children) {
      const cid = String(child.id);
      if (!selectedIds.has(cid)) {
        const box = absoluteFrameBox(doc, cid, designWidth, designHeight);
        if (box !== null) {
          out.push(rectOf(box, cid, extractRotation(child)));
        }
      }
      // Recurse regardless of whether this child was selected — a
      // selected branch's children can still be unselected and should
      // surface in the descendant set.
      walk(child);
    }
  };
  walk(hoveredItem);
  return out;
}

function projectShape(
  doc: AgocraftDocument,
  hoveredShapeId: string,
  designWidth: number,
  designHeight: number,
  selectedIds: ReadonlySet<string>,
): HoverAffordanceProjection {
  const found = findFrameContainingShape(doc, hoveredShapeId);
  if (found === null) return EMPTY;
  const { frame, shape } = found;
  const frameId = String(frame.id);
  const frameBox = absoluteFrameBox(doc, frameId, designWidth, designHeight);
  if (frameBox === null) return EMPTY;
  const hovered: ProjectorRect | null = selectedIds.has(hoveredShapeId)
    ? null
    : rectOf(shapeAbsoluteBox(frameBox, shape), hoveredShapeId, shape.rotation);
  const parent: ProjectorRect | null = selectedIds.has(frameId)
    ? null
    : rectOf(frameBox, frameId, extractRotation(frame));
  // Shapes have no children (they're CanvasShape records, not Items).
  // Peer shapes in the same frame are no longer surfaced — the user
  // spec is "no sibling visual". The parent tier (the containing
  // frame) still anchors the hover.
  return { hovered, descendants: [], parent };
}

function findFrameContainingShape(
  doc: AgocraftDocument,
  shapeId: string,
): { readonly frame: AgocraftItem; readonly shape: CanvasShape } | null {
  function walk(node: AgocraftItem): { frame: AgocraftItem; shape: CanvasShape } | null {
    const shapes = (node.attrs as { shapes?: ReadonlyArray<CanvasShape> }).shapes;
    if (shapes !== undefined) {
      const hit = shapes.find((s) => s.id === shapeId);
      if (hit !== undefined) return { frame: node, shape: hit };
    }
    for (const child of node.children) {
      const sub = walk(child);
      if (sub !== null) return sub;
    }
    return null;
  }
  for (const top of doc.root.children) {
    const found = walk(top);
    if (found !== null) return found;
  }
  return null;
}

function rectOf(
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  id: string,
  rotation: number | undefined,
): ProjectorRect {
  const out: ProjectorRect = {
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    id,
  };
  if (rotation !== undefined && rotation !== 0) {
    return { ...out, rotation };
  }
  return out;
}

function shapeAbsoluteBox(
  frameBox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  shape: CanvasShape,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
  return {
    x: frameBox.x + shape.x * frameBox.w,
    y: frameBox.y + shape.y * frameBox.h,
    w: shape.width * frameBox.w,
    h: shape.height * frameBox.h,
  };
}

function extractRotation(item: AgocraftItem): number | undefined {
  const frame = (item.attrs as { frame?: ItemFrame }).frame;
  if (frame === undefined) return undefined;
  return frame.rotation === 0 ? undefined : frame.rotation;
}
