// WI-074 / DR-029 D12 — crop image-offset (pan within the rotation cover-zoom
// magnification). When an image is cropped AND rotated, the cover-zoom magnifies
// the source to keep the frame filled; this offset lets the user drag the
// magnified image so the pushed-out parts come into the frame.
//
// Stored as a kind-agnostic weave-local UNIT (`crop.offset`, attrs `{ ox, oy }` in
// frame-box fractions), like `transform.flip` — weave's schema is empty +
// onUnknown: preserve, so it round-trips without an agocraft registration. The
// crop window itself (attrs.cropRatio) stays within [0,1]; this offset carries the
// extra in-magnification pan that the window can't represent.

import type { Item as AgocraftItem } from "@agocraft/core";
import { findUnitInItem } from "@agocraft/core";

export const CROP_OFFSET_UNIT_KIND = "crop.offset";

export interface CropOffset {
  /** Frame-box-width fraction (positive = image moved right). */
  readonly ox: number;
  /** Frame-box-height fraction (positive = image moved down). */
  readonly oy: number;
}

export const ZERO_CROP_OFFSET: CropOffset = { ox: 0, oy: 0 };

export function readCropOffset(item: AgocraftItem): CropOffset {
  const attrs = findUnitInItem(item, CROP_OFFSET_UNIT_KIND)?.attrs as
    | { ox?: number; oy?: number }
    | undefined;
  const ox = typeof attrs?.ox === "number" && Number.isFinite(attrs.ox) ? attrs.ox : 0;
  const oy = typeof attrs?.oy === "number" && Number.isFinite(attrs.oy) ? attrs.oy : 0;
  return { ox, oy };
}
