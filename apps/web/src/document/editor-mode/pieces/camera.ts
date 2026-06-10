// WI-166 / DR-114 — CameraPolicy pieces: per-flavor camera fit / clamp /
// channel composition. Absorbs the WI-157 fit-to-active-page math that
// lived in `pages/page-fit.ts` (decommissioned with this change — the
// camera policy is now the single owner of "where should the camera go").
//
// Pure functions + frozen data only. Consumers never import this file
// (DR-114 §2b) — they receive a composed CameraPolicy via injection.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { ItemFrame } from "../../types.js";
import type { CameraFitBox, CameraPan, CameraPolicy } from "../types.js";

/** Float tolerance for "is this FULL_FRAME". Page frames come from user
 *  drags and 1/3-style ratio math, so exact equality would misclassify. */
const EPS = 1e-6;

/** WI-157 — the design-px box the camera should fit for a page frame, or
 *  `undefined` when the page IS the design plane (FULL_FRAME — the base fit
 *  already frames it, no camera move needed). Rotation ≠ 0 counts as
 *  non-full; the returned box is the unrotated frame box (rotated-bounds
 *  precision is the separately deferred 회전 박스 경계 slice). */
export function pageFitBox(
  frame: ItemFrame,
  designWidth: number,
  designHeight: number,
): CameraFitBox | undefined {
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

/** Free placement: the camera never auto-follows anything. */
export function fitNothing(): undefined {
  return undefined;
}

/** Page-bounded: fit the ACTIVE page's own box when it is not FULL_FRAME
 *  (a toolbar-added top-level frame = a small new slide); `undefined` for
 *  FULL_FRAME / no active page — the base fit already frames those. */
export function fitActivePage(
  doc: AgocraftDocument,
  activePageId: string | undefined,
  designWidth: number,
  designHeight: number,
): CameraFitBox | undefined {
  if (activePageId === undefined) return undefined;
  const page = doc.root.children.find((c) => String(c.id) === activePageId);
  if (page === undefined) return undefined;
  const frame = (page.attrs as { frame?: ItemFrame }).frame;
  if (frame === undefined) return undefined;
  return pageFitBox(frame, designWidth, designHeight);
}

/** Identity clamp — the user may pan/zoom anywhere. The expected doc-page
 *  "vertical pan only" is a future clamping piece here (DR-114 §6-G3),
 *  with zero consumer edits. */
export function freePan(_current: CameraPan, proposed: CameraPan): CameraPan {
  return proposed;
}

/** CameraPolicy for free-placement flavors (mixed / canvas-board): no
 *  auto-fit, free pan, 10% breathing room, full user camera incl. the
 *  Space/hand drag-pan channel. */
export const FREE_CAMERA: CameraPolicy = {
  fitBox: fitNothing,
  clampPan: freePan,
  paddingFactor: 0.9,
  userZoom: true,
  dragPan: true,
};

/** CameraPolicy for page-bounded flavors (slide-deck / doc-page): auto-fit
 *  the active page (WI-157), wheel/hotkey zoom stays available, but no
 *  drag-pan gesture — the page is the anchor, not a plane to wander. */
export const ACTIVE_PAGE_CAMERA: CameraPolicy = {
  fitBox: fitActivePage,
  clampPan: freePan,
  paddingFactor: 0.95,
  userZoom: true,
  dragPan: false,
};
