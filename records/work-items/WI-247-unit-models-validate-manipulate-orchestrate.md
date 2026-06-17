# WI-247 — Unit models (validate + manipulate); commands orchestrate

## Metadata

| Field | Value |
|---|---|
| ID | WI-247 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **IN PROGRESS** — reference units done (crop.window, transform.flip); rollout pending |
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

## Rollout (follow-up)

Per DR-163: model the remaining decoration units (`decoration.fill` — fold in
`weave.shape.setFill`'s PaintSpec validation; `stroke` / `shadow` / `opacity` /
`filter`; `crop.offset`), then a `unitRegistry` so the generic
`weave.item.setDecoration` / `weave.item.update` paths validate per-kind instead
of writing blind attrs.

## Verification

`tsc --noEmit` + biome clean; full unit suite green after each unit; behaviour-
neutral (existing crop/flip command tests pass against the orchestrated commands).
