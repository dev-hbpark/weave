# WI-248 — Transaction effect pipeline (cross-cutting side-effects auto-derived)

## Metadata

| Field | Value |
|---|---|
| ID | WI-248 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | **DESIGN ONLY** — DR accepted-pending; build coordinated via HANDOFF-003 (group-hug session owns the effects to migrate) |
| Type | Architecture — transaction-level side-effect orchestration |
| Decision | [DR-164](../decisions/DR-164-transaction-effect-pipeline.md) |
| Handoff | [HANDOFF-003](../handoffs/HANDOFF-003-effect-pipeline-to-group-hug-session.md) |
| Related | DR-163 / WI-247 (unit models + emitUnit — the unit-write analogue) |

## Problem (requested)

`emitUnit` made unit-value writes foolproof, but a command author still hand-appends
cross-cutting side-effects (operator: "커맨드 작성에서 개발자가 부수적인 효과를
신경쓰지 않아도되는 구조가 아직은 안되는거같아"). Eight inline sites in `commands.ts`:
layout relayout (`onFrameChanged` ×3), group-hug refit (`groupHugAfter` /
`groupHugLivePatches` ×3), group dissolve (`dissolveUnderflowingGroups` ×2). Forget
one → silent bug.

## Plan (design — per DR-164)

A registered, **patch-driven effect pipeline** at the command-runner boundary:
command emits primary patches only; registered `TransactionEffect`s derive the
consequent patches automatically. **Extensible by registration** (Open-Closed):
adding an effect = implement `TransactionEffect` + register; no runner/command edit.
Initial effects migrate the existing three (relayout / group-hug / dissolve). Hard
constraints: no double-apply (remove the 8 inline sites on cutover), loop-free,
explicit ordering, live-gesture `EffectMeta` (sessionId), undo/redo idempotency.

Operator ask honored: **design first**, and **automation items are extensible**
(the registry is the centerpiece).

## Coordination

The effects to migrate are the concurrent group-hug session's live hot code
(WI-245/246 — `refit-group.ts`, `groupHugAfter`, `dissolveUnderflowingGroups`) +
the layout `onFrameChanged` calls. Build is NOT unilateral → HANDOFF-003 hands the
design to that session (or proposes a co-owned cutover). This WI is design only.

## Verification (when built)

Pipeline unit test (frame patch → relayout; remove patch → dissolve, no inline
call); full suite + group-hug/dissolve/relayout/undo e2e green after the
inline→registry cutover (behaviour-neutral).
