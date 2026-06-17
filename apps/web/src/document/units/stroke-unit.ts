// WI-247 / DR-163 — decoration.stroke unit model (StrokeSpec).

import {
  type Item as AgocraftItem,
  findUnitInItem,
  STROKE_UNIT_KIND,
  type StrokeSpec,
} from "@agocraft/core";
import { type UnitModel, type UnitResult, unitErr, unitOk } from "./unit-model.js";

function validate(candidate: unknown): UnitResult<StrokeSpec> {
  const c = candidate as { width?: unknown; paint?: unknown } | undefined;
  if (c === undefined || c === null || typeof c !== "object") {
    return unitErr("invalid-input", "stroke must be an object");
  }
  if (c.width !== undefined && (typeof c.width !== "number" || !Number.isFinite(c.width))) {
    return unitErr("invalid-input", "stroke.width must be a finite number");
  }
  if (c.paint !== undefined && (typeof c.paint !== "object" || c.paint === null)) {
    return unitErr("invalid-input", "stroke.paint must be a PaintSpec object");
  }
  return unitOk(c as unknown as StrokeSpec);
}

export const strokeUnit: UnitModel<StrokeSpec> = {
  kind: STROKE_UNIT_KIND,
  read: (item: AgocraftItem) =>
    (findUnitInItem(item, STROKE_UNIT_KIND)?.attrs as StrokeSpec | undefined) ??
    ({ width: 0, paint: { type: "none" } } as unknown as StrokeSpec),
  validate,
  appliesTo: () => true,
  toAttrs: (v) => v as unknown as Readonly<Record<string, unknown>>,
};
