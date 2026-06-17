// WI-247 / DR-163 — decoration.shadow unit model.

import {
  type Item as AgocraftItem,
  findUnitInItem,
  SHADOW_UNIT_KIND,
  type ShadowSpec,
} from "@agocraft/core";
import { type UnitModel, type UnitResult, unitErr, unitOk } from "./unit-model.js";

function validate(candidate: unknown): UnitResult<ShadowSpec> {
  const c = candidate as Record<string, unknown> | undefined;
  if (c === undefined || c === null || typeof c !== "object") {
    return unitErr("invalid-input", "shadow must be an object");
  }
  for (const k of ["x", "y", "blur"] as const) {
    const n = c[k];
    if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n))) {
      return unitErr("invalid-input", `shadow.${k} must be a finite number`);
    }
  }
  return unitOk(c as unknown as ShadowSpec);
}

export const shadowUnit: UnitModel<ShadowSpec> = {
  kind: SHADOW_UNIT_KIND,
  read: (item: AgocraftItem) =>
    (findUnitInItem(item, SHADOW_UNIT_KIND)?.attrs as ShadowSpec | undefined) ??
    ({ x: 0, y: 0, blur: 0, color: "transparent" } as unknown as ShadowSpec),
  validate,
  appliesTo: () => true,
  toAttrs: (v) => v as unknown as Readonly<Record<string, unknown>>,
};
