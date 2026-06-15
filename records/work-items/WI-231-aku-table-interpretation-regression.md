# WI-231 — Aku renders tabular input as a literal table instead of interpreting it

## Metadata

| Field | Value |
|---|---|
| ID | WI-231 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE (weave-side; small-think paired in WI-060) |
| Type | Agent prompt regression (Aku data representation) |
| Decision | [DR-146](../decisions/DR-146-interpret-data-not-transcribe-table.md) |

## Problem

User report: when the input prompt carries a table, Aku used to interpret what it
*means* and express it diversely (charts, big numbers, comparison diagrams,
cards); now it tends to emit the data back as a literal grid table.

## Root cause

Confirmed regression from two compounding changes (code + git audit):

1. **WI-226** (`8269da1`, `ddbb172`) added strong, detailed, recent table-as-grid
   rendering guidance + the standing primer line "TABLES / matrices → auto-grid".
   For tabular input the loudest, freshest instruction is "make a clean grid
   table" → "table in → table out" becomes the default.
2. The **representation matrix** (trend→line, comparison→bar, part-of-whole→pie,
   decisive figure→big number, precise lookup→table) lives only in small-think
   `CRITIQUE_TASK` (post-build review). That pass is reduced (WI-205~213) and
   skipped in openai/codex modes (no turn-summary), so the convert-to-visual
   safety net fires less than it used to.

See DR-146 for the full analysis.

## Change (weave-side)

- `apps/web/src/features/aku/agent/weave-capabilities.ts` — `WEAVE_TASK_PRIMER`:
  - new bullet `INTERPRET DATA, DON'T TRANSCRIBE IT` placed **before** the table
    mechanic, carrying the representation mapping + "omit the long tail".
  - existing table line re-scoped to `WHEN a literal table IS the right call
    (lookup/reference, or the user asked) …` — grid-rendering craft from WI-226
    preserved, now gated.
- `apps/web/src/features/aku/agent/weave-task-primer.test.ts` (new) — 4 tests:
  rule present, mapping present, literal-table gated + grid-when-built rule kept,
  and the interpret rule **ordered before** the grid mechanic.

Paired generation-time fix in small-think (`DESIGN_RULES`): WI-060 / DR-073.

## Verification

- `weave-task-primer.test.ts` — 4/4 green.
- Full Aku agent suite (`src/features/aku/agent/`) — 297/297 green, no regression.
- weave-only, no engine change, no re-vendor.

## Follow-up — strengthening pass (same day)

First pass had little observable effect in **byo-ssh**. Verified why:

- DESIGN_RULES **does** reach byo-ssh (`renderDesignGuidance` → `buildSystemPrompt`;
  headless-prompt.ts L8-12 "DESIGN_RULES always appended"; DR-019), and byo-ssh
  **runs the review pipeline** (`headless-cli-session.ts` warm + cold both call
  `runReviewPipeline`, no mode skip). So the CRITIQUE matrix already reached
  byo-ssh even before this change — yet literal tables persisted.
- Therefore the dominant lever for byo-ssh is the **build-phase** guidance, not the
  post-build review: the WI-226 pro-grid primer commits the build to a table and
  the review does not reverse it. The recency-weighted, per-task **client-side
  `WEAVE_TASK_PRIMER`** is the real lever.

Change: moved `INTERPRET DATA, DON'T TRANSCRIBE IT` to position **#2** (right after
MOOD FIRST) and re-worded it forcefully ("Re-emitting a table as a grid of cells
is a DEFECT unless …", "If your instinct is 'just render the table', STOP"). Test
updated to assert top-placement (after MOOD, before the grid mechanic). Suite green
(297/297).

## Caveat

- **DESIGN_RULES (server)**: live after `pnpm build` + `launchctl kickstart -k
  gui/$(uid)/com.smallthink.agent-server` (done) — new sessions pick it up.
- **WEAVE_TASK_PRIMER (client)**: it is weave client code; the running vite dev tab
  must load the new bundle (hard refresh). It applies **per task message**, so no
  Aku reconnect is needed for the primer — the next send uses it.
