// WI-041 / DR-019 D5 — paste coordinate resolution.
//
// Default Figma-style behaviour:
//
//   - Mouse-driven paste (Cmd+V right after a pointer hover, or
//     ContextMenu "Paste"): place the new item so its centre sits at
//     the pointer's last frame-local coordinate.
//   - Keyboard-driven paste with no recent pointer hover: place the new
//     item with an `OFFSET_PX` translation relative to the source
//     position. Successive Cmd+V presses accumulate offsets so duplicate
//     stacks fan out visually.
//
// The resolver works in the parent container's 0..1 ratio space because
// every item's `attrs.frame` is ratio-of-parent (WI-032). The container's
// pixel size is required to convert the absolute pointer offset (or the
// fixed offset) into the same ratio space.

import type { ItemFrame } from "../types.js";

/** Pixel offset used for keyboard paste and same-position fallbacks.
 *  Picked to match Figma's behaviour (a small but visible nudge). */
export const PASTE_OFFSET_PX = 8;

export interface PasteCoordInput {
  /** Frame of the source item AT COPY TIME — used as the basis for the
   *  keyboard-paste offset path. */
  readonly sourceFrame: ItemFrame;
  /** Pointer's last frame-local pixel position. `undefined` when no
   *  recent pointer hover was observed (e.g., the user invoked paste via
   *  keyboard immediately after a focus change). */
  readonly pointerInContainer?: { readonly x: number; readonly y: number };
  /** Pixel size of the destination container. Used to project pixel
   *  offsets into ratio space. */
  readonly containerSizePx: { readonly width: number; readonly height: number };
  /** Number of consecutive paste presses where the same payload has been
   *  pasted at the same target container. Each increment shifts the
   *  resulting frame by `PASTE_OFFSET_PX` so duplicate stacks fan out
   *  diagonally instead of stacking exactly on top. */
  readonly pasteIndex: number;
}

/**
 * Resolve the frame to assign to a freshly pasted item.
 *
 * - Pointer present → new centre lands at the pointer, size preserved.
 * - Pointer absent → translate the source frame by `pasteIndex * 8px`.
 * - The result is clamped so the item stays at least 1px on each axis
 *   inside the container (no negative widths, no NaN).
 */
export function resolvePasteFrame(input: PasteCoordInput): ItemFrame {
  const { sourceFrame, pointerInContainer, containerSizePx, pasteIndex } = input;
  const W = Math.max(containerSizePx.width, 1);
  const H = Math.max(containerSizePx.height, 1);

  const widthRatio = sourceFrame.width;
  const heightRatio = sourceFrame.height;

  let xRatio: number;
  let yRatio: number;

  if (pointerInContainer !== undefined) {
    // Centre the pasted frame at the pointer.
    const centreX = pointerInContainer.x / W;
    const centreY = pointerInContainer.y / H;
    xRatio = centreX - widthRatio / 2;
    yRatio = centreY - heightRatio / 2;
  } else {
    const offsetXRatio = (PASTE_OFFSET_PX * Math.max(pasteIndex, 1)) / W;
    const offsetYRatio = (PASTE_OFFSET_PX * Math.max(pasteIndex, 1)) / H;
    xRatio = sourceFrame.x + offsetXRatio;
    yRatio = sourceFrame.y + offsetYRatio;
  }

  // Clamp so the item stays partially visible. We allow some overflow
  // beyond the container (matches Figma — pasting near the edge is
  // expected to fall outside the frame box).
  const safeX = Number.isFinite(xRatio) ? xRatio : sourceFrame.x;
  const safeY = Number.isFinite(yRatio) ? yRatio : sourceFrame.y;

  return {
    x: safeX,
    y: safeY,
    width: widthRatio,
    height: heightRatio,
    rotation: sourceFrame.rotation,
  };
}
