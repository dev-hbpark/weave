// WI-074 / DR-029 D8 — crop window geometry, shared by the CropEditor (ImageBlock)
// and the SelectionLayer crop-handle dispatcher (FrameStage). All deltas are
// fractions of the frame box (0..1). The crop window (x,y,w,h) is the sub-region
// of the cover-displayed image mapped onto the frame box.

import type { CropDraft } from "./interactions/cropping-state.js";

export const MIN_CROP_WINDOW = 0.05;
export const MAX_STRAIGHTEN_RAD = (45 * Math.PI) / 180;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Resize the crop window from a handle direction ("nw".."se"/"n".."w"). dx/dy are
 *  fractions of the frame box. The opposite edge stays fixed. */
export function resizeCropWindow(c: CropDraft, dir: string, dx: number, dy: number): CropDraft {
  let l = c.x;
  let t = c.y;
  let r = c.x + c.w;
  let b = c.y + c.h;
  if (dir.includes("w")) l = clamp(l + dx, 0, r - MIN_CROP_WINDOW);
  if (dir.includes("e")) r = clamp(r + dx, l + MIN_CROP_WINDOW, 1);
  if (dir.includes("n")) t = clamp(t + dy, 0, b - MIN_CROP_WINDOW);
  if (dir.includes("s")) b = clamp(b + dy, t + MIN_CROP_WINDOW, 1);
  return { ...c, x: l, y: t, w: r - l, h: b - t };
}

/** Pan: move which part of the image fills the frame box. Dragging right reveals
 *  the image's LEFT side, so the window x decreases. dx/dy are frame-box fractions. */
export function panCropWindow(c: CropDraft, dx: number, dy: number): CropDraft {
  return {
    ...c,
    x: clamp(c.x - dx * c.w, 0, 1 - c.w),
    y: clamp(c.y - dy * c.h, 0, 1 - c.h),
  };
}

/** Set content straighten rotation (radians), clamped to ±45°. */
export function setStraighten(c: CropDraft, rotation: number): CropDraft {
  return { ...c, rotation: clamp(rotation, -MAX_STRAIGHTEN_RAD, MAX_STRAIGHTEN_RAD) };
}
