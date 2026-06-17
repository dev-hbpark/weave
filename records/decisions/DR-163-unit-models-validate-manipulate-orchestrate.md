# DR-163 — Unit models own validation + manipulation; commands orchestrate

## Metadata

| Field | Value |
|---|---|
| ID | DR-163 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **ACCEPTED** (reference: crop.window + transform.flip; rollout to remaining units pending) |
| Work Item | [WI-247](../work-items/WI-247-unit-models-validate-manipulate-orchestrate.md) |
| Related | DR-028 (decoration as units), DR-161 (crop as a unit, kind-agnostic), SOLID/GRASP (Information Expert) |

## Context

Units were data bags read/written through a generic `findUnitInItem` reader + the
`setDecoration` kit. Each command (`weave.media.setCrop`, `weave.item.flip`,
`weave.shape.setFill`) inlined ALL the work: value validation, the kind/applicability
rule, the attrs construction, and the patch emission. The unit's own operations
(crop pan/resize/straighten) lived scattered in `crop-geometry.ts`, imported
piecemeal by the command AND the drag dispatchers. So a "direct setter" (set
arbitrary attrs) was the only encapsulation, and a unit's rules were duplicated
across call sites. The flip case made the gap explicit: its applicability rule
(no text/qr) sat as an inline `FLIP_ALLOWED_KINDS` gate in the command — a
per-unit behaviour leaking into the orchestration layer.

## Decision — each unit is a self-contained MODEL; commands orchestrate

A unit model (`UnitModel<A>`, `document/units/unit-model.ts`) makes the unit the
EXPERT on its own state (GRASP Information Expert):

```ts
interface UnitModel<A> {
  readonly kind: string;
  read(item): A;                          // current state (or identity)
  validate(candidate): UnitResult<A>;     // VALUE validation (coded errors)
  appliesTo(item): boolean;               // APPLICABILITY rule (per-unit)
  toAttrs(value): Record<string,unknown> | null;  // canonical projection (null clears)
  // + per-unit MANIPULATION operations (pure transforms), e.g.
  //   crop: pan / panOffset / resize / straighten
  //   flip: toggle
}
```

- **No direct setter.** A unit does not expose "set arbitrary attrs"; callers
  construct/transform state only through `validate` + named manipulation ops, and
  the model projects to attrs via `toAttrs`.
- **Per-unit differences live in the unit.** `appliesTo` encodes a unit's
  applicability rule — flip's "no text/qr" moved OUT of the command into
  `flipUnit.appliesTo`. Different units implement different manipulation (crop has
  geometry ops; flip has a 2-bit toggle), each owned by its model.
- **Commands are ORCHESTRATORS.** A command: find item → `appliesTo` → `validate`
  / manipulate → `toAttrs` → emit via the setDecoration kit. It re-implements
  none of those; it sequences them and owns the transaction (single undo).
- **Drag dispatchers orchestrate too.** FrameStage / CropEditor call
  `cropWindowUnit.resize / straighten / pan / panOffset` instead of importing the
  geometry functions directly — one manipulation surface per unit.

## Reference implementation (this DR)

- `units/crop-window-unit.ts` — `cropWindowUnit`: validate (0..1 + finite
  rotation), `appliesTo: () => true` (kind-agnostic), `toAttrs` (omits rotation
  when absent), manipulation `pan / panOffset / resize / straighten`. `weave.media.setCrop`
  + FrameStage + CropEditor now orchestrate through it.
- `units/flip-unit.ts` — `flipUnit`: validate (2-bit coercion), `appliesTo`
  (`FLIP_ALLOWED_KINDS` — the relocated rule), `toAttrs` (null clears),
  manipulation `toggle`, `isAxis` guard. `weave.item.flip` orchestrates through it.

## Rollout (follow-up, same pattern)

The remaining decoration units get a model — most are validate + `toAttrs` +
`appliesTo: () => true` with minimal manipulation (they are "a value"):
`decoration.fill` (PaintSpec validate — fold in `weave.shape.setFill`'s inline
checks), `decoration.stroke`, `decoration.shadow`, `decoration.opacity`,
`decoration.filter`, `crop.offset`. A `unitRegistry` keyed by kind can then back
the generic `weave.item.setDecoration` / `weave.item.update` paths so even the
generic setter validates per-kind instead of writing blind attrs.

## Alternatives considered

- **Keep validation in commands, just extract helpers** — rejected: leaves the
  unit's rules split across call sites; the drag dispatchers still bypass them.
- **One giant unit registry first** — deferred: prove the contract on two real
  units (one manipulation-rich, one with an applicability rule) before generalizing.

## Consequences

- Each unit is unit-testable in isolation (validate / appliesTo / manipulation /
  toAttrs) with no command or document — `flip-unit.test.ts`, `crop-window-unit.test.ts`.
- Adding a unit operation = a method on its model; commands/dispatchers pick it up
  without re-validating.
- A unit's applicability/validation rule has ONE home (the model), so it can't
  drift between the command, the agent schema, and the drag handler.

## Verification

- `tsc --noEmit` clean; full unit suite green (incl. the two new model tests).
- Behaviour-neutral: existing crop/flip command tests pass against the
  orchestrated commands; FrameStage/CropEditor manipulation unchanged.
