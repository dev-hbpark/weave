// WI-247 / DR-163 — unit model registry.
//
// The single source mapping a unit `kind` → its model. The orchestration wrapper
// (`emitUnit` in commands.ts) looks a unit up HERE and auto-validates before
// emitting — so EVERY write path (the typed commands AND the generic
// weave.item.setDecoration / weave.item.update) validates through the unit's own
// rules without the caller remembering to. Unknown kinds (forward-compat / units
// with no model yet) pass through untouched.
//
// Adding a unit = add its model file + one entry here; the generic path then
// validates it everywhere automatically (the "don't-have-to-be-careful" goal).

import { cropOffsetUnit } from "./crop-offset-unit.js";
import { cropWindowUnit } from "./crop-window-unit.js";
import { fillUnit } from "./fill-unit.js";
import { filterUnit } from "./filter-unit.js";
import { flipUnit } from "./flip-unit.js";
import { opacityUnit } from "./opacity-unit.js";
import { shadowUnit } from "./shadow-unit.js";
import { strokeUnit } from "./stroke-unit.js";
import type { UnitModel } from "./unit-model.js";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous models keyed by kind; each is sound on its own A.
type AnyUnitModel = UnitModel<any>;

const MODELS: ReadonlyArray<AnyUnitModel> = [
  fillUnit,
  strokeUnit,
  shadowUnit,
  opacityUnit,
  filterUnit,
  flipUnit,
  cropWindowUnit,
  cropOffsetUnit,
];

const REGISTRY: ReadonlyMap<string, AnyUnitModel> = new Map(MODELS.map((m) => [m.kind, m]));

/** The unit model for a kind, or `undefined` for an unmodeled (forward-compat) kind. */
export function getUnitModel(kind: string): AnyUnitModel | undefined {
  return REGISTRY.get(kind);
}
