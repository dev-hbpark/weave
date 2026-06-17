// WI-247 / DR-163 — decoration.filter unit model (FilterSpec).
//
// A FilterSpec is a bag of optional numeric filter fields (blur / brightness /
// contrast / …). Validation is structural: an object whose present numeric
// fields are finite.

import {
  type Item as AgocraftItem,
  FILTER_UNIT_KIND,
  type FilterSpec,
  findUnitInItem,
} from "@agocraft/core";
import { type UnitModel, type UnitResult, unitErr, unitOk } from "./unit-model.js";

function validate(candidate: unknown): UnitResult<FilterSpec> {
  const c = candidate as Record<string, unknown> | undefined;
  if (c === undefined || c === null || typeof c !== "object") {
    return unitErr("invalid-input", "filter must be an object");
  }
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === "number" && !Number.isFinite(v)) {
      return unitErr("invalid-input", `filter.${k} must be a finite number`);
    }
  }
  return unitOk(c as unknown as FilterSpec);
}

export const filterUnit: UnitModel<FilterSpec> = {
  kind: FILTER_UNIT_KIND,
  read: (item: AgocraftItem) =>
    (findUnitInItem(item, FILTER_UNIT_KIND)?.attrs as FilterSpec | undefined) ?? ({} as FilterSpec),
  validate,
  appliesTo: () => true,
  toAttrs: (v) => v as unknown as Readonly<Record<string, unknown>>,
};
