// WI-074 / DR-029 D8 — crop window geometry, shared by the CropEditor (ImageBlock)
// and the SelectionLayer crop-handle dispatcher (FrameStage). All deltas are
// fractions of the frame box (0..1). The crop window (x,y,w,h) is the sub-region
// of the cover-displayed image mapped onto the frame box.

import type { CropDraft } from "./interactions/cropping-state.js";

export const MIN_CROP_WINDOW = 0.05;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const TWO_PI = 2 * Math.PI;
/** Wrap an angle (radians) into (-π, π]. Keeps the stored rotation bounded across
 *  repeated gestures; the wrap is visually seamless because the cover-zoom uses
 *  |cos|/|sin| (θ and θ±2π render identically). */
function normalizeAngle(theta: number): number {
  if (!Number.isFinite(theta)) return 0;
  let t = theta % TWO_PI;
  if (t > Math.PI) t -= TWO_PI;
  else if (t <= -Math.PI) t += TWO_PI;
  return t;
}

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

/** Cover-zoom: scale so a θ-rotated element still covers an axis-aligned box of
 *  the given aspect (= frame width / height). θ = 0 → 1. Shared with the renderer
 *  (ImageBlock) — applied AROUND the window center (= frame center) so the frame
 *  stays covered at any pan position (WI-074 D11). */
export function coverZoom(theta: number, aspect: number): number {
  if (theta === 0) return 1;
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  return c + s * Math.max(aspect, 1 / aspect);
}

/** Pan: move which part of the image fills the frame box. Dragging right reveals
 *  the image's LEFT side, so the window x decreases. dx/dy are frame-box fractions.
 *  The window is the crop region in source space, so it stays within [0,1]. */
export function panCropWindow(c: CropDraft, dx: number, dy: number): CropDraft {
  return {
    ...c,
    x: clamp(c.x - dx * c.w, 0, 1 - c.w),
    y: clamp(c.y - dy * c.h, 0, 1 - c.h),
  };
}

/** Pan within the rotation cover-zoom magnification (WI-074 D12). When rotated, the
 *  image is magnified by `coverZoom` to fill the frame; this moves the magnified
 *  image by (dx,dy) frame fractions and clamps so the frame stays inside the
 *  rotated, magnified SOURCE rect (gap-free) while reaching its full extent. The
 *  offset (ox,oy) is a separate weave-local field; the window (x,y,w,h) is untouched
 *  (it stays within [0,1]). `aspect` = frame box width/height. At θ=0 there is no
 *  magnification slack → offset is pinned to 0 (pan uses the window instead). */
export function panCropOffset(c: CropDraft, dx: number, dy: number, aspect = 1): CropDraft {
  const theta = c.rotation ?? 0;
  if (theta === 0) return { ...c, ox: 0, oy: 0 };
  const a = aspect > 0 ? aspect : 1;
  const oxDes = (c.ox ?? 0) + dx;
  const oyDes = (c.oy ?? 0) + dy;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const ac = Math.abs(cosT);
  const as = Math.abs(sinT);
  const Z = coverZoom(theta, a);
  // Rotated full-source rect half-sizes + the source-center→window-center offset, in
  // square-px space S (1 unit = frame width; frame height = 1/a).
  const rectHalfX = Z / (2 * c.w);
  const rectHalfY = Z / (2 * c.h * a);
  const supX = 0.5 * ac + (1 / (2 * a)) * as;
  const supY = 0.5 * as + (1 / (2 * a)) * ac;
  const limX = Math.max(0, rectHalfX - supX);
  const limY = Math.max(0, rectHalfY - supY);
  const d0x = (0.5 - c.x - c.w / 2) / c.w;
  const d0y = (0.5 - c.y - c.h / 2) / (c.h * a);
  // Desired offset in S, into the image-local (rotated) frame via R(-θ).
  const vSx = oxDes;
  const vSy = oyDes / a;
  const vx = vSx * cosT + vSy * sinT;
  const vy = -vSx * sinT + vSy * cosT;
  const Dlx = clamp(-(Z * d0x + vx), -limX, limX);
  const Dly = clamp(-(Z * d0y + vy), -limY, limY);
  // Back-solve the (clamped) offset: (ox, oy/a) = R(θ)·(-Z·d0 - D_local).
  const ux = -Z * d0x - Dlx;
  const uy = -Z * d0y - Dly;
  return {
    ...c,
    ox: ux * cosT - uy * sinT,
    oy: (ux * sinT + uy * cosT) * a,
  };
}

/** Set content rotation (radians). Full 360° is allowed (WI-074) — the angle is
 *  normalized into (-π, π] and the cover-zoom keeps the frame fully covered at
 *  every angle. */
export function setStraighten(c: CropDraft, rotation: number): CropDraft {
  return { ...c, rotation: normalizeAngle(rotation) };
}
