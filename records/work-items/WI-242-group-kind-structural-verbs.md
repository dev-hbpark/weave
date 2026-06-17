# WI-242 — `group` kind + structural verbs (create / ungroup / dissolve)

## Metadata

| Field | Value |
|---|---|
| ID | WI-242 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **A1 + A2 + A3 DONE — group kind + create + ungroup + auto-dissolve, all e2e live-verified.** |
| Type | New feature — composition primitive |
| Decision | [DR-159](../decisions/DR-159-group-kind-structural-verbs.md) |
| Builds on | [WI-241](WI-241-domain-kind-structure-spec.md) (`structure` spec + containment-guard convergence) |

## Problem

Add a `group` concept: compose ≥2 selected items as a unit; removing a child to <2 dissolves the group and reparents the sole survivor to the group's parent. Designed in dialogue as part of a verb algebra (create⟷remove identity, add⟷detach/reparent membership).

## A1 — kind registration (DONE 2026-06-17)

`group` registered end-to-end as the second container kind (reuses frame mechanics; differs only in `structure`):

- `types.ts` — `DomainKind += "group"`, `GroupAttrs { frame, label? }`, `ItemAttrsByKind.group`.
- `domains/GroupBlock.tsx` (new) + barrel — transparent renderer (returns null; children render via FrameSurface recursion).
- `domain-kinds.ts` — `SPECS.group`: renderer, `participatesInZorder:true`, `structure { isContainer:true, accepts:()=>true, minChildren:2, onUnderflow:"dissolve" }`, `defaultAttrs ()=>({frame:FULL_FRAME})`.
- `agocraft-mirror.ts` — `isDomainKind` converged from `kind==="frame"` to `isContainerKind` (includes group; behaviour-neutral).
- `weave-capabilities.ts` — `group` itemKind entry (coverage test forces it; editableAttrs `["frame"]`).
- `use-selection-chrome-registry.ts` — `group` added to the frame-default (resize/rotate) VM list.
- `domain-kinds.structure.test.ts` — updated: `CONTAINER_KINDS = [frame, group]`; group dissolve facts asserted.

**Behaviour-neutral**: nothing creates a group yet, so it is inert. The four WI-241-converged containment sites (add guard, insertion surface, frame.addChild / removeKeepingChildren) now recognise `group` automatically — the payoff of B.

### Verification
- `tsc --noEmit` clean — **no exhaustiveness fallout** (the AUDIT-005 single registry means downstream maps derive generically).
- Full unit suite **1486 tests / 134 files green**.
- biome clean; `declarativecheck` adds no new violation (pre-existing `derive-text-auto-resize.ts:76` only).

### Open live-verify debt (→ A2)
GroupBlock's null-render + FrameSurface child recursion for a `group` kind is correct by construction but unconfirmed on canvas (no group can be created yet). Confirm in A2.

## A2 — group CREATE via `weave.items.group` (DONE 2026-06-17, live-verified)

**Discovery:** weave already had the grouping machinery — `weave.items.group`
(commands.ts) computes the union-bbox, reparents members in with frameRatio
recomputed (delegating to `weave.item.add` + `weave.item.reparent`), all in one
transaction. It only created a **`frame`**. A2 = flip the construct to the real
`group` kind:

- `commands.ts` — `weave.items.group` now `addItem.run({ kind: "group", ... })`
  (was `"frame"`); comment updated (the construct is the `group` kind, DR-159).
- `commands.test.ts` — asserts `create.item.kind === "group"` (bbox / frameRatio /
  membership assertions unchanged — same math).
- `e2e/group-create.spec.ts` (new) — the live canvas check the A1 registration
  deferred.

**Live-verify (e2e PASSED, 6.7s, real chromium):** Cmd+G path creates a `group`
holding the 2 members; **the child frame-blocks still mount** (`framesAfter ===
framesBefore`) — i.e. a group recurses its children on canvas (GroupBlock paints
null; agocraft FrameSurface lays out the children). Members leave root; `Cmd+Z`
unwraps in one transaction. **This resolves the A1 open render debt.**

Verification: typecheck clean; full unit suite **1486 green**; e2e green; biome clean.

**Intermediate limitation (→ A3):** a freshly-made group is reversible via `Cmd+Z`,
but full ungroup-anytime is not yet wired for the `group` kind — the ungroup
affordances gate on `selection.kind === "frame"` / `canUngroup = kind==="frame"`
(DesignPage `selectedFrameId`, lines ~1335 / 2572) and so do not fire for a group
selection. The dissolve COMMAND (`weave.frame.removeKeepingChildren`,
`createDissolveFrameCommand`) is kind-agnostic and already works on a group — only
the SELECTION gating is frame-only. Fixed in A3 (the cohesive remove side).

## A3 — remove side (DONE 2026-06-17, e2e live-verified)

**Auto-dissolve invariant (the centerpiece).** A `dissolveUnderflowingGroups`
decorator wraps `weave.item.remove` + `weave.items.remove` (commands.ts): after
the base remove, any container declaring `onUnderflow:"dissolve"` whose child
count dropped below `structure.minChildren` is dissolved in the SAME transaction
by reusing `removeFrameKeepingChildren` (kind-agnostic: reparent survivors → the
group's OWN parent + remove the emptied group + WI-135 frameRatio/font rebase),
read against an evolved working doc. So removing a 2-child group's child
auto-ungroups (survivor lifts to the group's parent), one Cmd+Z restores it. No
new patch kind, no engine change.

**Ungroup affordances — corrected scope.** Investigation showed the A2
"hotkey gap" was a misread: `selection.kind === "frame"` is the selection-layer's
**single-item** case (selection-context maps ANY single selection to
`{kind:"frame", id}`), so `selectedFrameId` already resolves a selected group's
id and Cmd+Shift+G already dissolves a group (dissolve command is kind-agnostic).
The ONLY real gap was the context menu's `canUngroup`, which reads the ACTUAL
item kind (`cvItem.kind`) — changed `=== "frame"` → `isContainerKind(...)`. The
over-built `selectedContainerId` parallel was reverted.

### Files
- `commands.ts` — `dissolveUnderflowingGroups` + decorated `removeItem` /
  `removeItems` (forward-refs `removeFrameKeepingChildren`, resolved at exec time).
- `DesignPage.tsx` — `canUngroup` → `isContainerKind(cvItem?.kind)` (+ comment on
  why the hotkey already covers groups).
- `commands.test.ts` — 3 dissolve unit tests (2-child dissolve + survivor frame
  recomputed to root space; 3-child no-dissolve; both-removed → empty group gone).
- `e2e/group-dissolve.spec.ts` (new) — auto-dissolve + Cmd+Z restore + ungroup.
- `e2e/group-create.spec.ts` — **corrected render proof**: members placed inside
  the active slide; each member's `[data-frame-id]` asserted present BEFORE and
  AFTER grouping (the earlier root-level count was confounded by slide-deck only
  rendering the active slide — it was trivially 1===1; now it genuinely proves a
  group recurses + renders its children).

### Verification
- typecheck clean; full unit suite **1489 green** (incl. 3 dissolve tests).
- **e2e: 3/3 green** (group-create render proof + auto-dissolve + ungroup).
- biome clean; declarativecheck no new violation.

### Deferred (not needed)
- Multi-level dissolve fixpoint (a survivor that is itself an underflowing group
  is not re-dissolved) — one level covers the real cases; revisit if one appears.
