// WI-247 / DR-163 — crop.offset unit model.
//
// The in-magnification pan offset (frame-box fractions) paired with crop.window
// (WI-074 D12). Wraps the existing `readCropOffset` reader; validation is finite
// ox/oy. The crop manipulation that PRODUCES an offset lives on the crop-window
// model (`panOffset`); this model owns the offset unit's validation + projection.

import type { Item as AgocraftItem } from "@agocraft/core";
import {
  CROP_OFFSET_UNIT_KIND,
  type CropOffset,
  readCropOffset,
  ZERO_CROP_OFFSET,
} from "../transform-crop-offset.js";
import { type UnitModel, type UnitResult, unitErr, unitOk } from "./unit-model.js";

function validate(candidate: unknown): UnitResult<CropOffset> {
  const c = candidate as { ox?: unknown; oy?: unknown } | undefined;
  if (c === undefined || c === null || typeof c !== "object") {
    return unitErr("invalid-input", "crop offset must be an object");
  }
  for (const k of ["ox", "oy"] as const) {
    const n = c[k];
    if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n))) {
      return unitErr("invalid-input", `crop offset ${k} must be a finite number`);
    }
  }
  return unitOk({ ox: (c.ox as number) ?? 0, oy: (c.oy as number) ?? 0 });
}

export const cropOffsetUnit: UnitModel<CropOffset> = {
  kind: CROP_OFFSET_UNIT_KIND,
  read: (item: AgocraftItem) => readCropOffset(item),
  validate,
  appliesTo: () => true,
  // Zero offset clears the unit (no stale {0,0} unit on disk).
  toAttrs: (v) => (v.ox === 0 && v.oy === 0 ? null : { ox: v.ox, oy: v.oy }),
};

export { ZERO_CROP_OFFSET };
