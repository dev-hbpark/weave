# DR-159 — `group` kind + structural-verb algebra (create/add/remove/reparent/detach)

## Metadata

| Field | Value |
|---|---|
| ID | DR-159 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | ACCEPTED — A1 + A2 + A3 DONE, all e2e live-verified |
| Work Item | [WI-242](../work-items/WI-242-group-kind-structural-verbs.md) |
| Builds on | [DR-158](DR-158-domain-kind-structure-spec.md) (`structure` spec), WI-241 Follow-up B (containment guards → `isContainerKind`) |
| Related | WI-135/DR-086 (reparent preserves frameRatio), DR-157 (reparent-text-hug seam), History merge/invert (agocraft editor) |

## Context

The operator is designing a structural-verb algebra and a `group` concept:

- Identity axis: `create` (genesis) ⟷ `remove` (terminal, refs cleaned, resurrectable via history).
- Membership axis: `add` (grant membership) ⟷ `detach` (revoke), with `reparent` = the atomic `detach∘add` move that preserves identity + frameRatio.
- A `group` kind: a container that must hold ≥2 children; removing a child to <2 **dissolves** it (group removed, sole survivor reparented to the group's parent = auto-ungroup).

DR-158 put the containment policy on the kind spec (`structure`), and WI-241 Follow-up B converged the four containment guards to read it (`isContainerKind`). This DR adds the `group` kind and the verbs on top of that foundation.

## Decision

### 1. `group` is the second container kind (not a frame variant, not a new patch model)

`group` is a weave-local `DomainKind` (serialized via agocraft `onUnknown:"preserve"`, no engine change). It reuses frame's containment mechanics; the ONLY difference from `frame` is its `structure` spec: `{ isContainer:true, minChildren:2, onUnderflow:"dissolve" }`. It paints no chrome (transparent bounding box; `GroupBlock` renders null — children render via agocraft FrameSurface recursion) and gets the frame-default selection chrome (resize/rotate).

Rejected: (a) modelling group as a `frame` flag — the dissolve policy would have no crisp home and `structure` was built exactly to carry this; (b) a new agocraft patch kind for group lifecycle — unnecessary, the verbs compose existing patches.

### 2. The verbs compose EXISTING patches; no new engine primitives

group / ungroup / dissolve are expressed with the patches the agocraft editor already has and already inverts cleanly:

- **group(sel)** = `create(G)` + `reparent(eachSelected → G)` (one transaction).
- **ungroup(G)** = `reparent(children → G.parent)` + `remove(G)`.
- **dissolve (auto)** = the group-min-children invariant: on a child `remove`, if the group would hold <2, emit `reparent(survivor → parent)` + `remove(G)` — i.e. ungroup, fired by a rule.

Because all patches in a transaction share one `transactionId` and structural patches carry `mergeKey: undefined`, each verb is exactly one undo step, and `invertPatch` round-trips it (create↔remove, reparent swap) — group ⟷ ungroup are literal inverses.

### 3. weave-only via command composition (no re-vendor)

The invariant + frameRatio recompute live in weave, following the established decorator/seam precedents (clipboardPaste decorator; `reparent-text-hug.ts` / `ratioFontReparentPatches` for reparent frameRatio recompute). No agocraft change is required for A; if a fixpoint reconciler is later wanted in the engine, that is a separate DR.

### 4. Ordering is owned by the rule, not the caller (DR from the design dialogue)

The dissolve lowering (remove-survivor-first, then remove emptied group) lives in ONE invariant, and survivors leave via `reparent` (which destroys nothing) before the emptied group's `remove` — so evict-before-remove is produced by construction, not hand-sequenced at call sites.

## Staged delivery

- **A1 — kind registration (DONE).** `group` end-to-end in types / `GroupBlock` / SPECS (`structure`) / capability / selection-chrome; `isDomainKind` converged to `isContainerKind`. Behaviour-neutral (no way to create a group yet). The four WI-241-converged containment sites now recognise `group` automatically. Verified: typecheck + full unit suite (1486) green; biome + declarative gate clean (only pre-existing `derive-text-auto-resize` violation).
- **A2 — group CREATE (DONE, e2e live-verified).** The existing `weave.items.group` (union-bbox + frameRatio reparent + one transaction) was already complete — it only created a `frame`. A2 flipped it to `kind:"group"`. `e2e/group-create.spec.ts` PASSED on real chromium: a group renders its children on canvas (resolving the A1 render debt), members leave root, `Cmd+Z` unwraps. **Caveat:** ungroup affordances still gate on `kind==="frame"` (DesignPage selection), so a group is not yet ungroupable-anytime — moved to A3.
- **A3 — remove side (DONE, e2e live-verified).** (a) Auto-dissolve: `dissolveUnderflowingGroups` decorates `weave.item.remove` / `weave.items.remove` — an underflowing group is dissolved in the same transaction via the kind-agnostic `removeFrameKeepingChildren` (survivor → group's own parent, emptied group removed, frameRatio rebased). (b) Ungroup: the only real gap was the context menu's `canUngroup` (`cvItem.kind === "frame"` → `isContainerKind`); the Cmd+Shift+G hotkey already covered groups because the selection layer reports any single selection as `kind:"frame"` (the planned `selectedContainerId` was reverted as unnecessary). Verified: 3 dissolve unit tests + 3 e2e (corrected render proof, auto-dissolve+undo, ungroup); full suite 1489 green.

## SOLID / GRASP

- **Open-Closed / Rule 6** — `group` adds zero kind branches: it is one SPECS entry + the already-converged `isContainerKind` sites. The dissolve invariant is a registered rule, not an `if (kind==="group")`.
- **SRP** — `GroupBlock` paints nothing (layout is FrameSurface's job); the invariant owns dissolve; the verbs own composition.
- **Information Expert** — containment/min-children/dissolve facts live on the kind's `structure`, read by the verbs.

## Consequences

- A usable group concept arrives without an engine change or new patch kind.
- The `structure` foundation (DR-158) + converged guards (WI-241 B) pay off: A1 lit up the containment sites for free.
- Open live-verify debt: GroupBlock's null-render + FrameSurface child recursion for a `group` kind is asserted by construction but must be confirmed on canvas in A2.
