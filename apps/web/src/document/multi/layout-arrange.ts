// WI-048 — multi-selection "arrange into Flex / Grid", one-shot.
//
// Pure function, mirroring `align-ops.ts`: given the selected items' frames
// (parent 0..1 ratio) and a target layout, return new frames in the same
// space. No container frame is created — the items keep their place in the
// tree and are simply repositioned (the host wires the result through
// `weave.items.resizeMulti`). The SAME function powers the hover preview
// (compute → render ghosts) and the click (compute → apply).
//
// Reuse: the actual flex/grid placement math is NOT re-implemented here. We
// reuse the agocraft `LayoutAdapter.onParentResize` (the exact calculator the
// persistent frame layout uses) by treating the selection's bounding box as a
// virtual parent: express each child relative to the bbox, run the adapter,
// map results back. createAutoFlexSpec / createAutoGridSpec supply the spec
// defaults, so a tweak there ripples to both this and the frame layout.

import {
  createAutoFlexSpec,
  createAutoGridChildPolicy,
  createAutoGridSpec,
  type ItemId,
  type LayoutChildPolicy,
  type LayoutSpec,
  trackFr,
} from "@agocraft/core";
import { getLayoutRegistry } from "../layout/registry.js";

export type ArrangeLayout = "flex" | "grid";

export interface ArrangeFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArrangeInput {
  readonly id: string;
  readonly frame: ArrangeFrame;
}

export interface ArrangeOutput {
  readonly id: string;
  readonly frame: ArrangeFrame;
}

const UNIT = { x: 0, y: 0, width: 1, height: 1, rotation: 0 } as const;

function boundingBox(items: ReadonlyArray<ArrangeInput>): ArrangeFrame {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    minX = Math.min(minX, it.frame.x);
    minY = Math.min(minY, it.frame.y);
    maxX = Math.max(maxX, it.frame.x + it.frame.width);
    maxY = Math.max(maxY, it.frame.y + it.frame.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Near-square grid dimensions for `count` items: cols = ceil(√n), so 4 → 2×2,
 *  6 → 3×2, 9 → 3×3. Shared by the spec (track count) and the per-child cell
 *  assignment so they never disagree. */
function gridDims(count: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows };
}

/** Build the LayoutSpec for the target. Grid: equal `fr` tracks with
 *  justify/align = STRETCH and zero gap, so each item is resized to fill its
 *  cell and the cells tile the selection's bounding box edge-to-edge (no
 *  scattered gaps). Reused by both apply and preview. */
export function arrangeSpec(layout: ArrangeLayout, count: number): LayoutSpec {
  if (layout === "flex") {
    return createAutoFlexSpec({ align: "start" });
  }
  const { cols, rows } = gridDims(count);
  return createAutoGridSpec({
    columns: Array.from({ length: cols }, () => trackFr(1)),
    rows: Array.from({ length: rows }, () => trackFr(1)),
    columnGap: 0,
    rowGap: 0,
    justify: "stretch",
    align: "stretch",
  });
}

/** Per-child layout policy for the arrange. Grid assigns explicit cells in
 *  row-major order (the adapter places each child by its column/row policy;
 *  an undefined policy collapses everything into one cell). Flex is order-
 *  driven, so no per-child policy is needed. Cells are 1-based. */
function childPolicyFor(
  layout: ArrangeLayout,
  index: number,
  count: number,
): LayoutChildPolicy | undefined {
  if (layout !== "grid") return undefined;
  const { cols } = gridDims(count);
  return createAutoGridChildPolicy({
    column: (index % cols) + 1,
    row: Math.floor(index / cols) + 1,
  });
}

/** Compute the arranged frames. Pure: same inputs → same outputs, no doc
 *  lookup, no patches. Caller (host) wires the result into
 *  `weave.items.resizeMulti` (apply) or a ghost overlay (preview).
 *  Same-coordinate-space (one parent) is the caller's invariant. */
export function computeArrangedFrames(
  items: ReadonlyArray<ArrangeInput>,
  layout: ArrangeLayout,
): ReadonlyArray<ArrangeOutput> {
  if (items.length < 2) return items.map((it) => ({ id: it.id, frame: it.frame }));
  const bbox = boundingBox(items);
  if (bbox.width <= 0 || bbox.height <= 0) {
    return items.map((it) => ({ id: it.id, frame: it.frame }));
  }
  const spec = arrangeSpec(layout, items.length);
  const adapter = getLayoutRegistry().resolve(spec.kind);
  if (adapter === undefined) return items.map((it) => ({ id: it.id, frame: it.frame }));

  // Each child expressed relative to the bbox (the virtual parent = unit square).
  const children = items.map((it, i) => ({
    // The adapter treats itemId as an opaque key to match output→input; our
    // host string ids stand in for the branded ItemId.
    itemId: it.id as unknown as ItemId,
    currentFrame: {
      x: (it.frame.x - bbox.x) / bbox.width,
      y: (it.frame.y - bbox.y) / bbox.height,
      width: it.frame.width / bbox.width,
      height: it.frame.height / bbox.height,
      rotation: 0,
    },
    policy: childPolicyFor(layout, i, items.length),
  }));

  const patches = adapter.onParentResize(
    { parentSpec: spec as never, parentOldRatio: UNIT, parentNewRatio: UNIT },
    children,
  );
  const byId = new Map<string, ArrangeFrame>(
    patches.map((p) => [
      String(p.itemId),
      { x: p.newFrame.x, y: p.newFrame.y, width: p.newFrame.width, height: p.newFrame.height },
    ]),
  );

  // Map each child's bbox-relative result back into the real parent's ratio.
  return items.map((it) => {
    const rel = byId.get(it.id);
    if (rel === undefined) return { id: it.id, frame: it.frame };
    return {
      id: it.id,
      frame: {
        x: bbox.x + rel.x * bbox.width,
        y: bbox.y + rel.y * bbox.height,
        width: rel.width * bbox.width,
        height: rel.height * bbox.height,
      },
    };
  });
}
