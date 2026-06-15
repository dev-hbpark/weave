# DR-146 — Steer the agent to INTERPRET tabular input into a fitting representation, at generation time

## Metadata

| Field | Value |
|---|---|
| ID | DR-146 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | ACCEPTED |
| Work Item | [WI-231](../work-items/WI-231-aku-table-interpretation-regression.md) |
| Scope | Aku agent prompt (`WEAVE_TASK_PRIMER`) — weave-side; paired with small-think DR-073 |

## Context / problem

User report: Aku used to read the *meaning* of tabular input and express it
diversely (chart, big number, comparison diagram, cards). It now tends to render
the input back as a literal grid table.

Root cause (code + git audit, this session):

1. **Generation-time bias added.** WI-226 (`8269da1`, `ddbb172`) added large,
   detailed, *recent* guidance on how to render a table well as an auto-grid
   (`SHAPE THE GRID`, `HEADER+BODY=ONE GRID`, `SIZE STACKED REGIONS`), plus the
   existing `WEAVE_TASK_PRIMER` line "TABLES / matrices → auto-grid". So for
   tabular input the most emphatic, most recent instruction is *"build a clean
   grid table"* — the agent reads "table in → table out" as the default.
2. **The counter-guidance lives only in the post-build review.** The actual
   "interpret the data, pick the representation that makes the point" matrix
   (trend→line, comparison→bar, part-of-whole→pie, decisive figure→big number,
   precise lookup→table) lives in small-think `CRITIQUE_TASK`
   (`review-tasks.ts`) — a pass that runs *after* the build and, per the
   review-pipeline reduction (WI-205~213) and the openai/codex modes that do not
   emit a turn-summary, is reduced or skipped. The safety net that used to
   convert literal tables into the right visual fires less often now.

Net effect = the observed regression: "previously diverse → now literal table".

## Decision

Move the representation decision to **generation time** and make a literal grid
table the *exception*, not the default:

- Insert an `INTERPRET DATA, DON'T TRANSCRIBE IT` bullet into `WEAVE_TASK_PRIMER`
  **before** the table-as-grid mechanic. It carries the representation mapping
  (time/trend → line/area, category comparison → bar, part-of-whole → pie/stacked,
  distribution/correlation → scatter/bubble, flow/hierarchy → sankey/treemap, one
  decisive figure → big statistic + caption, relationship → shape-built diagram)
  and the "show the few figures that carry the message, omit the long tail" rule.
- Re-word the existing table line to `WHEN a literal table IS the right call
  (lookup/reference, or the user asked) …` so the grid mechanic is gated on the
  agent having *first* decided a literal table is correct. The grid-rendering
  craft from WI-226 is preserved unchanged for that case.

Ordering matters: the interpret rule precedes the grid mechanic so the default
reads as *transform*, not *transcribe*.

## Why not just rely on the review pass

The review pass is mode-dependent (skipped in openai/codex; reduced for cost) and
post-hoc. Generation-time grounding applies in **all** modes and shapes the first
emission — strictly more reliable. The review matrix stays as a backstop where it
runs (and is mirrored to generation-time in small-think DR-073 too).

## Consequences

- Token cost: ~2 lines added to the per-task primer; negligible vs. the WI-205~213
  trim intent. No tool-surface change, no re-vendor, weave-only.
- **Prompt change → requires an Aku reconnect (new session) to take effect.**
- Verification: `weave-task-primer.test.ts` (4 tests) locks the rule's presence,
  the representation mapping, the literal-table gate, and the *ordering* (interpret
  before grid). Full Aku agent suite green (297/297).

## Related

- Paired: small-think DR-073 / WI-060 (same matrix into the cached `DESIGN_RULES`).
- WI-228 / DR (design-style diversity) — sibling axis: *visual style* diversity
  via concrete spec locks. This DR is the *data representation* axis. Same root
  pattern: concrete generation-time guidance beats agent inference / post-hoc fix.
- WI-226 (one-grid tables) — preserved, now correctly scoped to "when a table is
  the right representation".
