# WI-247 — Unit models (validate + manipulate); commands orchestrate

## Metadata

| Field | Value |
|---|---|
| ID | WI-247 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DONE** — all units modeled + registry + orchestration wrapper; generic paths auto-validate |
| Type | Refactor / architecture — unit responsibility (Information Expert) |
| Decision | [DR-163](../decisions/DR-163-unit-models-validate-manipulate-orchestrate.md) |
| Related | DR-028, DR-161, WI-244 |

## Problem (requested)

Units currently only get/set values; commands inline validation + the kind rule +
attrs construction. Operator: units should NOT expose a direct setter — expose
(a) value **validation** methods and (b) the unit's **manipulation** operations;
the command holds the **orchestration** responsibility. And (follow-up) a unit
whose behaviour differs (flip's kind restriction) implements its own manipulation
/ applicability — so flip's `FLIP_ALLOWED_KINDS` gate moves into the flip unit.

## Done (reference)

- `units/unit-model.ts` — `UnitModel<A>` contract (`read` / `validate` /
  `appliesTo` / `toAttrs` + per-unit manipulation) + `UnitResult`.
- `units/crop-window-unit.ts` — `cropWindowUnit`: validate, `appliesTo: ()=>true`,
  `toAttrs`, manipulation `pan/panOffset/resize/straighten`. `weave.media.setCrop`,
  `FrameStage`, `CropEditor` orchestrate through it (no inline validation; drag
  dispatchers call the unit's manipulation, not crop-geometry directly).
- `units/flip-unit.ts` — `flipUnit`: validate, **`appliesTo` = the relocated
  `FLIP_ALLOWED_KINDS` rule**, `toAttrs` (null clears), `toggle` manipulation,
  `isAxis`. `weave.item.flip` orchestrates (no inline kind gate / toggle math).
- Tests: `flip-unit.test.ts` (6), `crop-window-unit.test.ts` (7). Full suite 1512 green.

## Rollout — DONE

- **All units modeled**: `fillUnit` (absorbs `weave.shape.setFill`'s PaintSpec
  validation), `strokeUnit`, `shadowUnit`, `opacityUnit` (clamps 0..1),
  `filterUnit`, `cropOffsetUnit` — each `units/<x>-unit.ts` with
  validate + `appliesTo` + `toAttrs` (+ manipulation where relevant).
- **`unitRegistry`** (`units/unit-registry.ts`): kind → model, single source.
- **Orchestration wrapper `emitUnit`** (operator's "랩핑된 함수에서 자동으로 넣어준다"):
  every unit write — the typed commands AND the generic
  `weave.item.setDecoration` / `weave.item.update` / `weave.items.update` paths —
  goes through it, so applicability + validation + normalization happen
  AUTOMATICALLY from the registry. A developer can't forget them; setting an
  invalid/inapplicable unit on ANY path fails (the "don't-have-to-be-careful,
  nothing-goes-wrong" structure the operator asked for).
- **`makeSetUnitCommand` factory**: a typed per-unit command is now a one-line
  call (`weave.shape.setFill` = `makeSetUnitCommand("weave.shape.setFill", fillUnit,
  i => i.fill)`) — zero hand-written boilerplate.
- Adding a unit = add `units/<x>-unit.ts` + one registry entry; every write path
  validates it automatically thereafter.
- Tests: `unit-registry.test.ts` + the two model tests; full suite 1517 green.

## Verification

`tsc --noEmit` + biome clean; full unit suite green after each unit; behaviour-
neutral (existing crop/flip command tests pass against the orchestrated commands).
