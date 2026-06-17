# WI-245 — Group shrink-wrap (hug): always wrap children, no overflow

## Metadata

| Field | Value |
|---|---|
| ID | WI-245 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DONE — built + e2e live-verified.** |
| Type | Feature — group-specific geometry invariant |
| Decision | [DR-162](../decisions/DR-162-group-hug-shrink-wrap.md) |
| Builds on | [WI-242](WI-242-group-kind-structural-verbs.md) (group kind + create/dissolve) |
| Note | DR-160 / WI-243 were taken by a concurrent session; this work renumbered to DR-162 / WI-245 (committed-wins). |

## Problem

Operator: a `group` must, unlike a `frame`, **always keep a bounding box that wraps its inner items**, and **must not allow children to overflow**. (Figma group model — both requirements are one shrink-wrap mechanism.)

## What shipped

- `domain-kinds.ts` — `StructureSpec` container gains `hugsChildren: boolean`; `frame:false`, `group:true`. Structure test asserts both.
- `layout/refit-group.ts` (new) — `refitGroupFrames` (pure union + re-relativize) + `groupHugPatches(doc, groupId)` (epsilon-guarded `item.attrs` patches for group + children). Weave-level (engine Hug is flex/grid-only).
- `commands.ts` — refit decorators, same transaction as the triggering mutation:
  - `weave.item.update` → re-fit the parent group when a child's frame changes (move / resize).
  - `weave.item.add` → grow the group when a child is added into it.
  - `weave.item.remove` / `weave.items.remove` → extended the WI-242 A3 dissolve decorator to ALSO shrink-wrap non-dissolving hugging groups.

## Verification (Continuous Self-Verification)

- Unit: `refit-group.test.ts` (4) + `commands.test.ts` move-grows-group + structure flag tests.
- **e2e `group-hug.spec.ts` (live, chromium PASSED)**: moving a child outward grows the group; **every child stays inside the group `[0,1]` box (no overflow)**; moved child still renders.
- Full unit suite **1499 green**; typecheck + biome clean; declarativecheck no new violation (pre-existing `derive-text-auto-resize` only).

## Deferred

- `weave.item.reparent` into/out of a group refit (less common — follow-up).
- Rotation-accurate union (currently ignores rotation for the bbox, same caveat as `weave.items.group`).
- Multi-level: a group nested in a hugging group is refit one level per mutation; a fixpoint pass if a real nested case needs it.
