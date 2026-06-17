# WI-241 — Per-kind `structure` spec (structural-verb scaffold)

## Metadata

| Field | Value |
|---|---|
| ID | WI-241 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DONE — scaffold built + verified (typecheck + 24 unit green, behavior-neutral). Verb wiring is follow-up.** |
| Type | Refactor / extension-point — structural policy single source |
| Decision | [DR-158](../decisions/DR-158-domain-kind-structure-spec.md) |
| Related | AUDIT-005 (DomainKind registry), future create/add/remove/reparent/detach verbs + `group` kind |

## Problem (requested)

While designing the structural-verb algebra (`create`/`remove` identity,
`add`/`detach`/`reparent` membership) and a `group` kind (≥2 children, else
dissolve + reparent survivor), the operator asked to confirm whether commands
branch on item kind, and — finding they don't — to introduce a `structure`
block so that **a newly added item kind cannot be built without consciously
defining its structure per the design** (no accidental omission).

## Current state (why net-new)

- Command bodies are already registry-driven for kind (no Rule-6 `switch`).
- But a kind's **structural facts** were undeclared: in Phase 11 every item is a
  frame and can nest at the data level, so "is this kind a real container / what
  may it hold / does it dissolve" existed only as scattered implicit assumptions.
- No seam existed for the upcoming verbs to consult; without one, `group` would
  spawn `if (kind === "group")` / `GROUP_KINDS` scatter.

## What shipped

`apps/web/src/document/domain-kinds.ts`:

- New `StructureSpec` discriminated union (`isContainer` boolean discriminator) —
  container variant requires `accepts` / `minChildren` / `onUnderflow`; leaf
  variant is `{ isContainer: false }`.
- `DomainKindSpec.structure` is now a **required** field → the exhaustive `SPECS`
  mapped type makes a new kind a **compile error** until structure is declared.
- All 9 kinds declared: `frame` = container (accepts all, min 0, keep); the other
  8 = leaves.
- Derived seam: `structureOf(kind)`, `CONTAINER_KINDS`, `canContain(parent,child)`
  (single early-return guard + `accepts`).

`apps/web/src/document/domain-kinds.structure.test.ts` (new, 6 tests): exhaustive
structure presence, frame-container facts, leaf set, the **dissolve ⟹
minChildren ≥ 2** design rule, and `canContain` gate behavior.

## Scope boundary

Behavior-neutral: data + pure helpers + test only. No command consults
`structure` yet — wiring `add`/remove/dissolve to it is the follow-up WI where
the behavior change is deliberate.

## Verification (Continuous Self-Verification)

- `pnpm typecheck` (apps/web) clean.
- 24 unit tests green (structure 6, chart 4, embed 4, weave-capabilities 10).
- biome clean on changed files. `declarativecheck` adds no new violation
  (pre-existing `derive-text-auto-resize.ts:76` is WI-215, untouched here).

## Follow-up B — converge scattered containment guards (DONE 2026-06-17)

Added `isContainerKind(kind: unknown): boolean` (string/unknown-safe, reads
`structure.isContainer`) and replaced the four scattered **containment** guards
that hard-coded `kind === "frame"` — each now flips to a future `group`
(isContainer:true) with zero edits:

- `commands.ts` `weave.item.add` container check (`containerItem.kind !== "frame"`).
- `editor-mode/pieces/insertion.ts` `addIntoSelectedFrame` (selected editing surface).
- `tooltip/editor-hotkeys.ts` `frame.addChild` visibleWhen ("can host children").
- `tooltip/editor-hotkeys.ts` `frame.removeKeepingChildren` visibleWhen (dissolve target).

Behaviour-neutral (today `isContainerKind` ⟺ `kind === "frame"`). +4 unit tests
for `isContainerKind` (undefined/"multi"/"none"/unknown → false). 275 related
tests green; typecheck + biome clean; `declarativecheck` adds no new violation.

**Deliberately NOT migrated** (different axis, or group-enabling is a conscious
interaction decision for the group step — not a blind sweep):

- `frame.toggleSlide` — deck/page membership, not containment.
- `layer-picker/hit-test.ts` drill targets, `use-hover-context.ts` DOM→kind
  disambiguation, `isProjectableKind` (projection set), `FLIP_ALLOWED_KINDS`
  (transform capability — already a co-located registry, not scatter),
  text autoHeight/hug (DR-157 layout-fit seam).
- `agocraft-mirror.isDomainKind` — serialize round-trip; defer.

`structure` stays narrow (containment only, per DR-158): flip / hug / paste are
separate capability axes and, if converged, become their OWN spec facets — not
crammed into `structure`.

## Follow-up (remaining)

- Wire the structural verbs (`create`/`add`/`remove`/`reparent`/`detach`) to
  `canContain` / `onUnderflow`; add the `group` kind (one SPECS entry:
  `isContainer: true, minChildren: 2, onUnderflow: "dissolve"`). The 4 converged
  containment sites then light up for `group` automatically.
