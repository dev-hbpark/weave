// WI-040 Phase 3 — HoverAffordanceLayer host projector.
//
// Pure function. Maps the hover + selection state plus the document
// tree onto the three rects the `HoverAffordanceLayer` primitive
// renders (hovered / siblings / parent), in design-plane absolute
// pixels.
//
// Two source paths:
//   1. The pointer is over a frame Item (kind ∈ {frame, image, video,
//      text} per the host's HoverKind union). The frame's parent is
//      either another frame Item or the design root; siblings are
//      that parent's other children.
//   2. The pointer is over a canvas-shape inside a frame's
//      `attrs.shapes[]` array. The "parent" tier is the containing
//      frame; siblings are the other shapes in the same frame's
//      array.
//
// Other hover kinds (handle, hotspot, background, none) return an
// empty projection — the layer hides everything.
//
// Selection exclusion (DR-design-016 §"Selection chrome 와 겹침
// 방지"): any id in `selectedIds` is filtered out before the rects
// are built, so hover overlay never paints over selection chrome.
// hovered is dropped when its id is selected; siblings are filtered
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
  readonly siblings: ReadonlyArray<ProjectorRect>;
  readonly parent: ProjectorRect | null;
}

const EMPTY: HoverAffordanceProjection = {
  hovered: null,
  siblings: [],
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

  // Parent is either another Item (when found) or the design root.
  // Root → use { 0, 0, designW, designH }. Skip the root parent tier
  // when the hovered item is a top-level child — the entire canvas
  // tinted as "parent" is noise, not information.
  const parentInfo = findParentAndIndex(doc, hoveredId);
  let parent: ProjectorRect | null = null;
  let siblings: ReadonlyArray<ProjectorRect> = [];
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
    siblings = collectSiblings(doc, parentItem, hoveredId, designWidth, designHeight, selectedIds);
  }
  return { hovered, siblings, parent };
}

function collectSiblings(
  doc: AgocraftDocument,
  parentItem: AgocraftItem,
  excludeId: string,
  designWidth: number,
  designHeight: number,
  selectedIds: ReadonlySet<string>,
): ReadonlyArray<ProjectorRect> {
  const out: ProjectorRect[] = [];
  for (const child of parentItem.children) {
    const cid = String(child.id);
    if (cid === excludeId) continue;
    if (selectedIds.has(cid)) continue;
    const box = absoluteFrameBox(doc, cid, designWidth, designHeight);
    if (box === null) continue;
    out.push(rectOf(box, cid, extractRotation(child)));
  }
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
  const shapes = (frame.attrs as { shapes?: ReadonlyArray<CanvasShape> }).shapes ?? [];
  const siblings: ReadonlyArray<ProjectorRect> = shapes
    .filter((s) => s.id !== hoveredShapeId && !selectedIds.has(s.id))
    .map((s) => rectOf(shapeAbsoluteBox(frameBox, s), s.id, s.rotation));
  const parent: ProjectorRect | null = selectedIds.has(frameId)
    ? null
    : rectOf(frameBox, frameId, extractRotation(frame));
  return { hovered, siblings, parent };
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
