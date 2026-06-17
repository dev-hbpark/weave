# HANDOFF-003 — Transaction effect pipeline: fold the group-hug / dissolve / relayout decorators into a registered pipeline

## Metadata

| Field | Value |
|---|---|
| ID | HANDOFF-003 (intra-project, `records/handoffs/`) |
| Date | 2026-06-17 |
| From | unit-architecture session (hbpark) — WI-247/DR-163 + this design |
| To | the concurrent **group-hug session** (WI-245 / WI-246 / DR-162) that owns `refit-group.ts` + the `groupHugAfter` / `dissolveUnderflowingGroups` inline sites in `commands.ts` |
| Design | [DR-164](../decisions/DR-164-transaction-effect-pipeline.md) / [WI-248](../work-items/WI-248-transaction-effect-pipeline.md) |
| Status | REQUESTED — design only on my side; the cutover edits your live hot code, so it's yours to fold in (or co-own) |

## Why this is a handoff, not a unilateral edit

DR-164 proposes a registered, patch-driven effect pipeline so command authors stop
hand-appending cross-cutting side-effects. Migrating it means **removing the 8
inline side-effect sites in `commands.ts`** and re-expressing them as registered
`TransactionEffect`s — and three of those (`groupHugAfter`,
`groupHugLivePatches`, `dissolveUnderflowingGroups`, all from `refit-group.ts`) are
**your live code**. My earlier commit `117edde` already inadvertently swept your
working-tree `commands.ts` changes; I will not churn that file's side-effect code
again without you. So: the design is mine, the cutover is yours (or co-owned).

## The ask

Fold these into the pipeline DR-164 describes (register, then delete the inline call):

| Effect | Current inline sites (`commands.ts`) | Reacts to (primary patch) |
|---|---|---|
| `relayoutEffect` (`onFrameChanged`) | item.update, items.update ×2 | `item.frame` |
| `groupHugEffect` (`groupHugAfter` / live `groupHugLivePatches`) | ~1194, ~1504, ~1507 | geometry/unit patch on a hug-group child |
| `groupDissolveEffect` (`dissolveUnderflowingGroups`) | removeItem ~1335, removeItems ~1362 | `item.remove` |

Honor the DR-164 constraints: **no double-apply** (delete the inline call when you
register), **loop-free** (effects react to PRIMARY patch kinds only), **explicit
order** in `EFFECT_PIPELINE`, **live-gesture `EffectMeta`** (carry `sessionId` for
`groupHugLivePatches` instead of re-discovering), and **undo/redo idempotency**.

The pipeline core + the `relayoutEffect` (layout-engine, not yours) are the
lowest-conflict starting point if you want me to build that part; ping me on
HANDOFF and I'll do the core + relayout and leave the two group effects for you to
register.

## Why bother (the payoff)

Once registered, a NEW mutation command emits only its primary patches and the
hug/dissolve/relayout attach automatically — no command author ever forgets them
again, and adding a future cross-cutting effect is one registration (Open-Closed).
It's the transaction-level analogue of the `emitUnit` wrapper (DR-163) that made
unit-value writes foolproof.

## Cutover playbook (turnkey — built foundation is on `main`)

The pipeline + `relayoutEffect` + the typed-error channel are BUILT (`276cd21`);
`computeAttrsPatches` already routes relayout through it. What remains is your
two effects + (optionally) the central-runner auto-apply. Exact steps:

### Step 1 — add `groupHugEffect` + `groupDissolveEffect` modules
`document/transaction/group-hug-effect.ts` / `group-dissolve-effect.ts`, each
`implements TransactionEffect` (return `ok(extraPatches)` / a typed `WeaveError`):
- `groupHugEffect.reactsTo = ["item.attrs"]` → derive `groupHugPatches` /
  `groupHugLivePatches` (already module-level in `refit-group.ts`) from the
  changed child + `meta.sessionId` (live-gesture box). The closure helpers
  `groupHugAfter` (commands.ts:1275) move their body here (they only need ctx +
  the refit-group fns, both available to an effect).
- `groupDissolveEffect.reactsTo = ["item.remove"]` → derive
  `dissolveUnderflowingGroups` (commands.ts:1216 closure) from the removed ids in
  the base patches.

### Step 2 — register, in order
`effect-pipeline.ts` `EFFECT_PIPELINE = [relayoutEffect, groupHugEffect, groupDissolveEffect]`.
Order is the contract (relayout → hug → dissolve). One-line edit (Open-Closed).

### Step 3 — remove the inline sites IN THE SAME CHANGE (no double-apply)
Current line refs (will drift — grep to confirm):
- relayout: `commands.ts:1837`, `:2018` (the `:1579` site is already migrated).
- group-hug: `commands.ts:1196`, `:1508`, `:1511`.
- dissolve: `commands.ts:1337`, `:1364`.
Each inline `...fn(...)` append → delete; the pipeline now derives it.

### Step 4 — central auto-apply (the foolproof end-state)
Wrap the returned command array (`buildWeaveCommands` `return [...base, batch]`,
`commands.ts:~3891`) so every command's result runs through `applyEffects(ctx,
result.patches, metaFromInput)` and appends `Result`-unwrapped extras (map a
failing effect to the command's `fail`). **Behaviour-neutrality decision REQUIRED
here**: globalizing relayout/hug to ALL commands changes *which* commands trigger
them. Two options — (a) accept globalization (arguably more correct/foolproof) +
audit with the full suite + e2e, or (b) keep per-command opt-in via a flag on the
command. Recommend (a) gated behind the e2e suite.

### Step 5 — gate
`tsc` + biome + full unit suite + the group-hug / dissolve / relayout / undo-redo
e2e all green. The cutover is behaviour-neutral; the suite is the proof.

## Blockers found during a cutover attempt (2026-06-17) — READ BEFORE EXECUTING

A cutover attempt surfaced that the full central auto-apply is **NOT a
behaviour-neutral refactor** as-is; it needs per-site reconciliation + e2e. The
concrete findings (so the executor with an e2e env handles each):

1. **relayout policy differs per site — the killer.** `computeAttrsPatches`
   (item.update) relayouts on **SIZE change only** (WI-224: a position-only move
   must NOT relayout — children travel with the parent). This site is ALREADY on
   the pipeline (`276cd21`), matching the size-only `relayoutEffect`.
   `frameUpdatesToPatches` (resizeMulti / items.update `updates`, ~`commands.ts:1837`)
   relayouts on **ANY frame change incl. moves**. A single effect cannot be
   behaviour-neutral for both — routing 1837 through the size-only effect DROPS
   relayout-on-move (regression). Fix: either two effects (size-only vs any-change,
   keyed by a meta flag) or keep 1837 inline. Decide with e2e.
2. **batch double-apply.** `buildWeaveCommands` `return [...base, batch]`; `batch`
   composes sub-commands. Wrapping `batch` AND its sub-commands double-applies
   effects. The wrapper must wrap `base` only (and `batch` must run unwrapped
   sub-commands), or exclude batch.
3. **relayout cascade.** Centrally relayouting every `item.attrs` size change
   re-relayouts reflow-RESULT patches (the inline scoped to the user's edit). The
   engine is probably idempotent here but this is exactly the WI-047 revert risk —
   verify with e2e before globalizing.
4. **live-hug stateful cache.** `groupHugLivePatches` needs `gestureGroupG0`
   (per-session gesture-start box, a `buildWeaveCommands` closure Map). A pure
   effect needs this relocated (module singleton ⇒ shared across editors — check).
5. **dissolve command-coupling.** `dissolveUnderflowingGroups` →
   `removeFrameKeepingChildren` (a sibling Command closure) + `getDesignDims`.
   Extract `removeFrameKeepingChildren`'s body to a pure helper first.

Recommended execution: with the drag / group-hug / dissolve / undo e2e GREEN
(networked env), reconcile (1) per-site, fix (2), verify (3)'s idempotency,
relocate (4), extract (5) — each behaviour-neutral, suite + e2e as the gate. The
pipeline foundation + the size-only relayout slice are already on `main`.

## Coordination notes

- Numbers: this design is WI-248 / DR-164 (your group-hug owns WI-245/246/DR-162;
  unit-models is WI-247/DR-163). Renumber on collision (committed-wins).
- Sequence suggestion: land your in-flight group-hug work first (so the inline
  sites are stable), then cut over to the pipeline as a single behaviour-neutral
  refactor with the full suite + group-hug/undo e2e as the gate.
