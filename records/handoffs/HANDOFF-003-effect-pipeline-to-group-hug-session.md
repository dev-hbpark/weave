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

## Coordination notes

- Numbers: this design is WI-248 / DR-164 (your group-hug owns WI-245/246/DR-162;
  unit-models is WI-247/DR-163). Renumber on collision (committed-wins).
- Sequence suggestion: land your in-flight group-hug work first (so the inline
  sites are stable), then cut over to the pipeline as a single behaviour-neutral
  refactor with the full suite + group-hug/undo e2e as the gate.
