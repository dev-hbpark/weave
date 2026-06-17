# DR-158 — Per-kind `structure` spec: structural policy as a compiler-forced field

## Metadata

| Field | Value |
|---|---|
| ID | DR-158 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | ACCEPTED |
| Work Item | [WI-241](../work-items/WI-241-domain-kind-structure-spec.md) |
| Related | AUDIT-005 (DomainKind single-source registry), domain-kinds.ts, future create/add/remove/reparent/detach structural verbs + group kind |

## Context

The operator is designing a structural-verb algebra for the editor —
`create` ⟷ `remove` (identity) and `add` ⟷ `detach` / `reparent` (membership) —
plus a `group` kind whose invariant is "≥2 children, else dissolve and reparent
the sole survivor to the group's parent."

An audit of the command layer (in response to "do commands branch on item
kind?") found the command bodies are **already** registry-driven — no Rule-6
`switch (kind)` in `buildWeaveCommands`. The real seam is different: a kind's
**structural facts** (is it a container, what may it hold, must it dissolve on
underflow) are NOT declared anywhere. In the Phase 11 paradigm every item is a
frame and *can* nest children at the data-model level, so "is this kind MEANT to
hold children" lived only as scattered, implicit assumptions (and ad-hoc guards
like `FLIP_ALLOWED_KINDS`, text-paste guards, shape/image-only commands).

Adding the structural verbs + `group` on top of that would grow new
`if (kind === "group")` / `GROUP_KINDS` guards — exactly the scatter Rule 6
prevents. The operator's explicit requirement: **when a new item kind is added,
the developer must be forced to build its structure per the design, not able to
omit it by accident.**

## Decision — declare structural policy on the kind spec, required + discriminated

Add a required `structure: StructureSpec` field to `DomainKindSpec`
(`apps/web/src/document/domain-kinds.ts`). Because `SPECS` is a
compiler-exhaustive `{ [K in DomainKind]: DomainKindSpec<K> }` mapped type and
`structure` is required, **adding a new `DomainKind` is a compile error until its
structure is declared** — no silent "everything is a leaf / nothing dissolves"
default can slip in. This is the forcing function the operator asked for.

`StructureSpec` is a discriminated union on `isContainer` (a boolean —
deliberately NOT a `role`/`kind` discriminant the declarative-dispatch gate
watches):

```ts
type StructureSpec =
  | { isContainer: true;
      accepts: (childKind: DomainKind) => boolean;  // add/reparent gate
      minChildren: number;                           // 0 = may sit empty
      onUnderflow: "keep" | "dissolve" }             // dissolve = auto-ungroup
  | { isContainer: false };
```

The discriminator forces a container to spell out its full child policy and
forbids a leaf from carrying meaningless container fields. Today only `frame` is
a container (`accepts: () => true, minChildren: 0, onUnderflow: "keep"`); the
other 8 kinds are leaves. A future `group` is one SPECS entry:
`{ isContainer: true, accepts: () => true, minChildren: 2, onUnderflow: "dissolve" }`.

Three pure derived helpers form the seam the verbs will consult (no kind
branching at the call site):

- `structureOf(kind)` — the policy for a kind.
- `CONTAINER_KINDS` — derived filter, mirroring `DESIGN_FRAME_KINDS`.
- `canContain(parentKind, childKind)` — the single `add`/`reparent` gate; a
  single early-return guard (`if (!parent.isContainer) return false;`, a Rule-6
  permitted precondition that also narrows to the container variant) then defers
  to `accepts`.

## Scope boundary — this DR is the scaffold, not the wiring

This change is **behavior-neutral**: it adds declarative data + pure helpers +
a test. It does NOT yet wire `canContain` / `onUnderflow` into any command — the
`add` verb does not yet reject children on a leaf, and nothing dissolves. Wiring
the structural verbs to consult `structure` is the follow-up (its own DR), where
the behavior change is deliberate and reviewed. Introducing the scaffold first is
intentional: the forcing function must exist before the kind that needs it.

## Consistency guard (test-enforced design rule)

`domain-kinds.structure.test.ts` locks the design contract so a future kind
cannot declare an inconsistent spec: **any container with `onUnderflow:
"dissolve"` must have `minChildren ≥ 2`** — dissolve reparents the *sole*
survivor, which is only meaningful past a ≥2 minimum. A `group` declared with
`dissolve` + `minChildren: 0/1` fails the suite rather than shipping a verb that
mishandles it.

## Alternatives considered

- **Flat object with optional fields** — rejected: optional fields let a new kind
  omit policy and inherit a silent default, defeating the forcing requirement.
- **`role: "container" | "leaf"` string discriminant** — rejected: `role` is a
  watched discriminant word; future contributors would be tempted to
  `switch (structure.role)` and trip the declarative gate. A boolean
  discriminator avoids the foot-gun.
- **Inline `CONTAINER_KINDS` / `GROUP_KINDS` sets at the verb sites** — rejected:
  the exact kind-scatter Rule 6 forbids; data belongs on the spec.

## Consequences

- Adding a kind now forces a conscious container/leaf + child-policy decision
  (compile error otherwise).
- The structural verbs + `group` kind get a stable, tested seam (`canContain`,
  `structureOf`, `onUnderflow`) and add ZERO new kind branches.
- Pre-existing scattered guards (`FLIP_ALLOWED_KINDS`, text-paste, hug-policy)
  can be migrated onto `structure` incrementally (follow-up), converging kind
  knowledge to one place.

## Verification

- `tsc --noEmit` clean (mapped type enforces all 9 entries carry `structure`).
- `domain-kinds.structure.test.ts` (6) + `domain-kinds.chart.test.ts` (4) +
  embed-kind + weave-capabilities coverage = 24 tests green.
- biome clean; `declarativecheck` introduces no new violation (the one reported
  failure, `derive-text-auto-resize.ts:76`, pre-dates this change — WI-215).
