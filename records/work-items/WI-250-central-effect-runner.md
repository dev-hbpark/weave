# WI-250 — Central transaction-effect runner (foolproof: every command auto-applies effects)

## Metadata

| Field | Value |
|---|---|
| ID | WI-250 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DONE** |
| Decision | [DR-166](../decisions/DR-166-central-effect-runner.md) |
| Depends on | agocraft WI-052 / DR-065 (reflow-origin tag) — [HANDOFF-010](../decision-handoffs/HANDOFF-010-from-agocraft-reflow-origin-tag-acceptance.md) |
| Closes | HANDOFF-003 § Step 4 (central auto-apply — deferred since the cutover attempts) |

## Goal

Close the last "developer must be careful" gap: a command author emits only its
PRIMARY patches and relayout / group-hug / dissolve attach automatically — no
per-site `applyEffects`, no skip-set.

## Done

1. **agocraft reflow-origin tag** (WI-052) — engine marks its derived patches;
   re-vendored (core rc.20260617120000, layout rc.20260617130000).
2. **`applyEffects` (effect-pipeline.ts)** — filter to `!isReflowDerived` (effects
   see only primary); skip `skipWhenSelfReflowed` effects when the output carries
   any derived patch.
3. **`relayoutEffect.skipWhenSelfReflowed = true`** + `TransactionEffect` field.
4. **`withEffects` central runner + `effectMetaForInput`** in `buildWeaveCommands`;
   `wrappedBase = base.map(withEffects)`, `byName`→wrapped, `batch` unwrapped.
5. **Removed** the 4 per-site `applyEffects` calls (add / removeItem / removeItems /
   computeAttrsPatches). Kept inline engine reflow in frameUpdatesToPatches /
   items.update (tagged ⇒ self-reflowed ⇒ relayout suppressed; any-change policy
   preserved).
6. **`asReflowDerived`** re-stamps `setSizing` / `setLayout` reconstructed patches.

## Gate

`tsc` + biome + unit (1524) green. e2e behaviour-neutral vs baseline (4 pre-existing
failures: `hug-resize:331/512/612`, `multi-edit-undo:76`; no new failures). The
`resizeHug` Hug-propagation regression surfaced mid-cutover (`hug-resize:105/182`)
was fixed by tagging `hug-reflow.ts` + `skipWhenSelfReflowed`.

## Notes / follow-ups

- Paste / duplicate now grow a hugging GROUP they land in (group-hug reacts to
  `item.create`) — intended foolproof consequence; covered green by clipboard/group
  e2e.
- Pre-existing 4 e2e failures are unrelated (root-cause is a separate WI).
