import type { CanvasShape, Item } from "../../types.js";
import type { HandleDir, ManipulationCapability, SelectableTarget } from "../types.js";

export interface CanvasShapeTarget extends SelectableTarget<"canvas-shape"> {
  readonly kind: "canvas-shape";
  /** The shape itself, kept in sync by the registry consumer (read-only snapshot). */
  readonly shape: CanvasShape;
}

interface CanvasShapeCapabilityDeps {
  readonly updateShape: (itemId: string, shapeId: string, patch: Partial<CanvasShape>) => void;
  readonly removeShape: (itemId: string, shapeId: string) => void;
}

const ALL_HANDLES: ReadonlyArray<HandleDir> = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

/** Minimum width/height for a shape, in 0..1 ratio of the parent canvas
 *  item's frame. Phase 10a — coords moved from 0..100 percent → 0..1 ratio,
 *  so the floor came along (0.02 ≈ 2%). */
const MIN_SIZE = 0.02;

/** Corner / edge-anchored resize (Figma-style):
 *
 *    - E drag  → right edge moves, left/top/bottom stay.
 *    - W drag  → left edge moves (x advances), right/top/bottom stay.
 *    - N drag  → top edge moves (y advances), bottom/left/right stay.
 *    - S drag  → bottom edge moves, top/left/right stay.
 *    - NE / NW / SE / SW → the two adjacent edges move together; the diagonally
 *      opposite corner is the anchor and does not move.
 *
 *  Pointer delta arrives in viewport-percent units. `dx` / `dy` are signed —
 *  W drag yields negative dx as the pointer moves left, which shrinks width.
 *  Rotation is ignored when picking the anchor (axis-aligned resize). For
 *  rotated shapes the visual matches at the anchor corner; pixel-perfect
 *  rotated resize lands in a later phase.
 */
function resizeAnchored(
  shape: CanvasShape,
  dx: number,
  dy: number,
  dir: HandleDir,
): Partial<CanvasShape> {
  let x = shape.x;
  let y = shape.y;
  let width = shape.width;
  let height = shape.height;

  if (dir.includes("e")) {
    width = Math.max(MIN_SIZE, shape.width + dx);
  }
  if (dir.includes("w")) {
    const newWidth = Math.max(MIN_SIZE, shape.width - dx);
    x = shape.x + (shape.width - newWidth);
    width = newWidth;
  }
  if (dir.includes("s")) {
    height = Math.max(MIN_SIZE, shape.height + dy);
  }
  if (dir.includes("n")) {
    const newHeight = Math.max(MIN_SIZE, shape.height - dy);
    y = shape.y + (shape.height - newHeight);
    height = newHeight;
  }

  return { x, y, width, height };
}

export function createCanvasShapeCapability(
  deps: CanvasShapeCapabilityDeps,
): ManipulationCapability<"canvas-shape", CanvasShapeTarget> {
  return {
    targetKind: "canvas-shape",
    selectable: true,
    move: {
      axis: "free",
      apply: (target, delta) => {
        deps.updateShape(target.itemId, target.id, {
          x: target.shape.x + delta.dx,
          y: target.shape.y + delta.dy,
        });
      },
    },
    resize: {
      kind: "free",
      handles: ALL_HANDLES,
      // delta.dw/dh now carry the *signed pointer delta* (1×), not a width/height delta.
      // The capability owns the anchoring math.
      apply: (target, delta) => {
        const patch = resizeAnchored(target.shape, delta.dw, delta.dh, delta.dir);
        deps.updateShape(target.itemId, target.id, patch);
      },
    },
    rotate: {
      apply: (target, deltaRadians) => {
        deps.updateShape(target.itemId, target.id, {
          rotation: target.shape.rotation + deltaRadians,
        });
      },
    },
    getBoundingBox: (target) => ({
      x: target.shape.x,
      y: target.shape.y,
      width: target.shape.width,
      height: target.shape.height,
      rotation: target.shape.rotation,
    }),
    destroy: (target) => {
      deps.removeShape(target.itemId, target.id);
    },
  };
}

/** Helper for the host to construct a CanvasShapeTarget from an Item + shape.
 *  Accepts either the weave-local Item or an agocraft-shaped item (Phase 3b
 *  renderers pass the latter) — only reads the `id` field. */
export function canvasShapeTargetFor(
  item: { readonly id: string },
  shape: CanvasShape,
): CanvasShapeTarget {
  return {
    kind: "canvas-shape",
    id: shape.id,
    itemId: String(item.id),
    shape,
  };
}
