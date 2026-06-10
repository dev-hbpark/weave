// WI-157 — camera fit-to-active-page (WI-153 P2.4 deferral).
//
// Page-bounded formats base-fit the WHOLE design plane; that equals the page
// box only for FULL_FRAME pages. When the active page is NOT full-frame (e.g.
// a toolbar-added top-level frame = a new slide with a small box), the camera
// must fit the page's own box instead — computed here as pure math (same
// "separate the math, unit-test it directly" pattern as page-clamp.ts) and
// applied by FrameStage through the existing user-camera fit (`zoomToBox`),
// NOT by touching the base-fit — that was the P2.4 deferral risk.

import type { ItemFrame } from "../document/types.js";
import type { DesignBox } from "./frame-camera-bridge.js";

/** Float tolerance for "is this FULL_FRAME". Page frames come from user drags
 *  and 1/3-style ratio math, so exact equality would misclassify. */
const EPS = 1e-6;

/** The design-px box the camera should fit for a page, or `undefined` when
 *  the page IS the design plane (FULL_FRAME — the base fit already frames it,
 *  no camera move needed). Rotation ≠ 0 counts as non-full; the returned box
 *  is the unrotated frame box (rotated-bounds precision is the separately
 *  deferred 회전 박스 경계 slice). */
export function pageFitBox(
  frame: ItemFrame,
  designWidth: number,
  designHeight: number,
): DesignBox | undefined {
  const isFullFrame =
    Math.abs(frame.x) < EPS &&
    Math.abs(frame.y) < EPS &&
    Math.abs(frame.width - 1) < EPS &&
    Math.abs(frame.height - 1) < EPS &&
    Math.abs(frame.rotation) < EPS;
  if (isFullFrame) return undefined;
  return {
    x: frame.x * designWidth,
    y: frame.y * designHeight,
    w: frame.width * designWidth,
    h: frame.height * designHeight,
  };
}
