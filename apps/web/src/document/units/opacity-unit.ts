// WI-247 / DR-163 — decoration.opacity unit model.

import { type Item as AgocraftItem, findUnitInItem, OPACITY_UNIT_KIND } from "@agocraft/core";
import { type UnitModel, type UnitResult, unitErr, unitOk } from "./unit-model.js";

export interface OpacityValue {
  readonly value: number;
}

function validate(candidate: unknown): UnitResult<OpacityValue> {
  const v = (candidate as { value?: unknown } | undefined)?.value;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return unitErr("invalid-input", "opacity.value must be a finite number");
  }
  // Opacity is a 0..1 scalar — clamp (auto-correct) rather than reject.
  return unitOk({ value: Math.min(1, Math.max(0, v)) });
}

export const opacityUnit: UnitModel<OpacityValue> = {
  kind: OPACITY_UNIT_KIND,
  read: (item: AgocraftItem) => ({
    value:
      (findUnitInItem(item, OPACITY_UNIT_KIND)?.attrs as { value?: number } | undefined)?.value ??
      1,
  }),
  validate,
  appliesTo: () => true,
  toAttrs: (v) => ({ value: v.value }),
};
