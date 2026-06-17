// WI-244 / DR-161 — crop WINDOW as a weave-local UNIT.
//
// The crop window (x/y/w/h in 0..1 + content `rotation` in radians) used to live
// on `attrs.cropRatio` (agocraft `ImageCrop`, image-typed). Stored as a UNIT it
// becomes kind-agnostic (any item can carry it, exactly like `crop.offset` /
// `opacity` / `shadow` — DR-028), which is what lets crop apply to video and
// other media without a per-kind attr.
//
// Same weave-local pattern as `crop.offset` (transform-crop-offset.ts): empty
// schema + `onUnknown: preserve`, so it round-trips with no agocraft
// registration. Back-compat: `readCropWindow` falls back to the legacy
// `attrs.cropRatio` so existing docs render unchanged; writes go to the unit (the
// `weave.media.setCrop` command strips the legacy attr on re-save).

import type { Item as AgocraftItem } from "@agocraft/core";
import { findUnitInItem } from "@agocraft/core";

export const CROP_WINDOW_UNIT_KIND = "crop.window";

export interface CropWindow {
  /** Source-space window, 0..1. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Content straighten, radians (DR-029 D6). */
  readonly rotation: number;
}

export const IDENTITY_CROP_WINDOW: CropWindow = { x: 0, y: 0, w: 1, h: 1, rotation: 0 };

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Read the crop window: prefer the `crop.window` unit; fall back to the legacy
 *  `attrs.cropRatio` (back-compat) — else identity (no crop). */
export function readCropWindow(item: AgocraftItem): CropWindow {
  const unit = findUnitInItem(item, CROP_WINDOW_UNIT_KIND)?.attrs as
    | { x?: number; y?: number; w?: number; h?: number; rotation?: number }
    | undefined;
  const legacy =
    unit === undefined
      ? ((
          item.attrs as {
            cropRatio?: { x?: number; y?: number; w?: number; h?: number; rotation?: number };
          }
        ).cropRatio ?? undefined)
      : undefined;
  const c = unit ?? legacy;
  if (c === undefined) return IDENTITY_CROP_WINDOW;
  return {
    x: num(c.x, 0),
    y: num(c.y, 0),
    w: num(c.w, 1),
    h: num(c.h, 1),
    rotation: num(c.rotation, 0),
  };
}
