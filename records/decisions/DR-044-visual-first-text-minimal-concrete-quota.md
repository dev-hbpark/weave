# DR-044 — AKU agent: visual-first / text-minimal with concrete budget + visual quota

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (rule change, no WI)
- **Relates:** DR-040 (concision), DR-042 (visual richness), small-think **DR-027** (host-agnostic counterpart)

## Context

Despite DR-040 (concision) and DR-042 (visual richness), agent slides stayed wordy and
under-decorated. Qualitative wording ("cut prose", "add polish") wasn't shifting behavior.

## Decision

Make the per-turn primer concrete and forceful:

- **Text budget:** per slide a short title + AT MOST ~3–5 short PHRASES (≈≤6 words each, no full
  sentences/paragraphs); body text a few dozen words at most.
- **Prose → visual:** never write an explanatory sentence — SHOW it (shape diagram, chart, icon
  + label, number + caption) or cut it.
- **Visual quota:** every content slide MUST carry ≥1 real non-text visual (chart /
  image-or-placeholder / shape diagram / icon / deliberate graphic treatment — panels, bands,
  accents); text-only-on-a-background is a defect.

## Scope (edits)

`apps/web/src/features/aku/agent/weave-capabilities.ts` — `WEAVE_TASK_PRIMER` concision bullet
rewritten to "VISUAL-FIRST, TEXT-MINIMAL" with the concrete phrase budget, prose→visual rule,
and per-slide visual quota. (The cached domain rules + visual-treatment rule from DR-042 remain;
this sharpens the per-turn recall.)

Prompt text only; recursive typecheck green. Counterpart: small-think DR-027 (which also makes
the prune + final-review passes enforce the budget and visual quota).

## Consequences

- Stronger, concrete pressure toward more shown / less written, reinforced every turn.
