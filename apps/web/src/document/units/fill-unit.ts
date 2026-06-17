// WI-247 / DR-163 — decoration.fill unit model (PaintSpec).
//
// Absorbs the PaintSpec validation that `weave.shape.setFill` used to inline, so
// every fill write — the typed command AND the generic setDecoration / update
// path — validates through ONE place (the registry routes here automatically).

import {
  type Item as AgocraftItem,
  FILL_UNIT_KIND,
  findUnitInItem,
  type PaintSpec,
} from "@agocraft/core";
import { type UnitModel, type UnitResult, unitErr, unitOk } from "./unit-model.js";

const FILL_TYPES = new Set([
  "none",
  "solid",
  "linear-gradient",
  "radial-gradient",
  "image",
  "video",
]);
const NO_FILL: PaintSpec = { type: "none" } as PaintSpec;

function validate(candidate: unknown): UnitResult<PaintSpec> {
  const c = candidate as { type?: unknown; stops?: unknown } | undefined;
  if (c === undefined || c === null || typeof c.type !== "string" || !FILL_TYPES.has(c.type)) {
    return unitErr("invalid-input", `fill.type must be one of ${[...FILL_TYPES].join(", ")}`);
  }
  if (
    (c.type === "linear-gradient" || c.type === "radial-gradient") &&
    (!Array.isArray(c.stops) || c.stops.length < 2)
  ) {
    return unitErr("invalid-input", "a gradient fill needs `stops` with at least 2 entries");
  }
  return unitOk(c as PaintSpec);
}

export const fillUnit: UnitModel<PaintSpec> = {
  kind: FILL_UNIT_KIND,
  read: (item: AgocraftItem) =>
    (findUnitInItem(item, FILL_UNIT_KIND)?.attrs as PaintSpec | undefined) ?? NO_FILL,
  validate,
  appliesTo: () => true, // fill is read by shape + frame; harmless elsewhere.
  toAttrs: (v) => v as unknown as Readonly<Record<string, unknown>>,
};
