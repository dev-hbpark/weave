# DR-166 — Central transaction-effect runner: every command auto-applies effects (foolproof)

## Metadata

| Field | Value |
|---|---|
| ID | DR-166 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **ACCEPTED (shipped)** |
| Work Item | [WI-250](../work-items/WI-250-central-effect-runner.md) |
| Supersedes | the per-site `applyEffects` calls of DR-164/165 (kept the pipeline; moved the call to the runner) |
| Depends on | agocraft DR-065 / WI-052 (reflow-origin patch tag) — [HANDOFF-010](../decision-handoffs/HANDOFF-010-from-agocraft-reflow-origin-tag-acceptance.md) |
| Related | DR-164 (effect pipeline), DR-163 (`emitUnit`), HANDOFF-003 § Step 4, [[foolproof-structure-over-brevity]], CLAUDE.md Rule 3/6 |

## Problem

DR-164 built the effect pipeline, but the cutover (b2b16dd) wired `applyEffects`
at **4 per-site** call sites (add / removeItem / removeItems / computeAttrsPatches),
each hand-feeding CURATED primary patches (`[createPatch]`, `[patch]`, …). A NEW
command still has to remember to call `applyEffects` with the right patches — the
"developer must be careful" gap DR-164 set out to close was only half closed.

The naive fix (wrap every command, feed its full output to `applyEffects`)
DOUBLE-APPLIED: a self-reflowing command (`weave.item.add` via `onChildAdd`) emits
its own sibling-shift `item.attrs` patches, and the relayout effect re-derived a
reflow from them — proven NOT behaviour-neutral (42f1163, the `#1 cascade relayout
GRANDCHILDREN` unit test). HANDOFF-003 concluded the foolproof version needs the
engine to mark its derived patches (option b).

## Decision — a central `withEffects` runner + two tag-driven rules

Every command is wrapped once at `buildWeaveCommands` assembly:

```ts
const withEffects = (cmd) => ({ ...cmd, run: (ctx, input) => {
  const r = cmd.run(ctx, input); if (!r.ok) return r;
  const fx = applyEffects(ctx, r.patches, effectMetaForInput(input));   // FULL output
  if (!fx.ok) return fail(fx.error.code, fx.error.message);
  return fx.value.length === 0 ? r : ok(r.value, [...r.patches, ...fx.value]);
}});
const wrappedBase = base.map(withEffects);     // batch stays UNWRAPPED (composes sub-ops)
```

`applyEffects` enforces loop-freedom STRUCTURALLY using the agocraft reflow-origin
tag (DR-065), via two rules:

1. **Filter** — effects derive only from PRIMARY patches (`!isReflowDerived`), so
   an effect never reacts to an engine reflow CONSEQUENCE. Replaces the per-site
   `[createPatch]` curation.
2. **Suppress self-reflowed** — if a command's output contains ANY derived patch
   it SELF-MANAGED its engine reflow; effects flagged `skipWhenSelfReflowed`
   (relayout — it IS the engine reflow) are skipped, so add / reparent / resizeHug
   / items.update don't double-reflow. Weave-side effects a command does NOT
   self-manage (group-hug, group-dissolve) still attach universally.

`effectMetaForInput` sources `sessionId` + `designWidth/Height` from the command
input (`getDesignDims()` fallback), so the live-gesture box still works.

### Reconstructed-patch tagging

The layout-authoring commands (`setSizing` / `setLayout`) REBUILD clean patches
from a tagged `refitHugContainer` result (for clean-undo `before`), dropping the
engine tag. `asReflowDerived(p)` re-stamps those reconstructed patches so the
command is reliably detected as self-reflowed regardless of descendant count.

## What changed

- Removed the 4 per-site `applyEffects` calls; `computeAttrsPatches` returns its
  primary `[patch]` only.
- Kept the inline engine reflow in `frameUpdatesToPatches` / items.update (tagged
  `derived` ⇒ self-reflowed ⇒ relayout suppressed). This preserves their
  any-frame-change relayout policy (HANDOFF-003 blocker 1 resolved WITHOUT a
  size-only regression — the move-relayout behaviour is unchanged).
- `relayoutEffect.skipWhenSelfReflowed = true`.

## Consequences

- A NEW mutation command emits only its primary patches; relayout / group-hug /
  dissolve attach automatically. A command that self-reflows inline is detected by
  its derived patches — no name-based skip-set, no per-site curation.
- Failure mode of forgetting is SAFE: a simple new command without inline reflow
  gets effects (correct); a new self-reflowing command is auto-detected. The only
  way to break it is to emit untagged reflow patches — caught loudly by the
  relayout/hug/dissolve unit + e2e suite (as the cutover proved).

## Verification

`tsc` + biome + full unit suite (1524) green. e2e behaviour-neutral vs the
documented 4-failed/26-passed baseline (`hug-resize:331/512/612`,
`multi-edit-undo:76` — all pre-existing; no NEW failures). The mid-cutover
regression (`hug-resize:105/182`, resizeHug Hug-propagation conflict) was fixed by
extending the tag to `hug-reflow.ts` + the `skipWhenSelfReflowed` rule.
