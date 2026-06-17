# HANDOFF-010 — Acceptance: agocraft reflow-origin patch tag (DR-065 / WI-052)

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-010 (from-agocraft acceptance, `records/decision-handoffs/`) |
| Date | 2026-06-17 |
| From | agocraft WI-052 / DR-065 (reflow-origin patch tag) |
| To | weave WI-250 / DR-166 (central transaction-effect runner) |
| Status | **ACCEPTED — consumed, shipped** |

## What agocraft delivered

`@agocraft/core` exposes `ReflowOrigin` (`derived?: true`) on `item.attrs` /
`item.layout` / `item.children.reorder`, plus `isReflowDerived(patch)`.
`@agocraft/layout` stamps `derived: true` on every reflow CONSEQUENCE at the two
patch-construction chokepoints (`engine.ts fullAttrsPatch` + onChildAdd grid-grow;
`hug-reflow.ts attrsFramePatch`). Primary intents (onLayoutChange layoutPatch,
onFlexReorder reorderPatch) are left untagged.

## How weave consumes it

- `applyEffects` filters `!isReflowDerived` (effects see only primary patches) and
  skips `skipWhenSelfReflowed` effects when any derived patch is present.
- This is the precondition for the central `withEffects` runner (DR-166) that
  wraps EVERY command without a skip-set.

## Pins

`@agocraft/core` `file:…/agocraft-core-1.0.0-rc.20260617120000.tgz`
`@agocraft/layout` `file:…/agocraft-layout-1.0.0-rc.20260617130000.tgz`
(3 override locations each: root `package.json`, `apps/web/package.json`,
`pnpm-workspace.yaml`). Active links verified to carry the tag; `+2 -2` / `+1 -1`
clean swaps.

## Verification

weave `tsc` + biome + unit 1524 green; e2e behaviour-neutral vs baseline. No
agocraft-side follow-up requested. See [[weave-agocraft-vendor-chain]].
