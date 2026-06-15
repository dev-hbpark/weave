# DR-149 — Primer steering: accents belong to the card; don't pad regions with whitespace

## Metadata

| Field | Value |
|---|---|
| ID | DR-149 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | ACCEPTED |
| Work Item | [WI-234](../work-items/WI-234-accent-drift-and-oversized-regions.md) |
| Scope | weave `WEAVE_TASK_PRIMER` (agent prompt) — weave-only, no engine, no small-think |

## Context / problem

Two composition-quality issues observed in a generated comparison slide (exported
doc analysed, `untitled-design-selection (6)`):

1. **Absolute accent drift** — each card's coloured header strip was a SEPARATE
   absolute `shape` at the slide root, hand-positioned to overlap the card frame
   (`shape-mqeivkdp-1c` x=0.36000413 vs card `frame-mqeiu30c-e` x=0.36 — drift
   already started). The strip looks aligned at author time but desyncs the moment
   the card moves / resizes / reflows (independent coordinate spaces). Connector
   lines between cards have the same fragility.
2. **Oversized regions / whitespace padding** — fixed-height cards (h=0.36) held a
   little content stretched apart by large, INCONSISTENT gaps (Bilinear card
   `gap=0.107`/`gapPx 41.5` vs Bicubic `gap=0.02`); 1-line texts sat in boxes ~2×
   their content height, top-aligned, leaving big empty space → "font looks small,
   region looks too big / empty".

Both are **agent composition choices**, not engine bugs (confirmed: a prior
engine-floor attempt for the related overlap backfired and was reverted — see
WI-232/DR-147). The existing guidance ("SIZE STACKED REGIONS", "PREFER A RECTANGLE
SHAPE … decoration.fill") covers adjacent cases but did not name these two.

## Decision

Add two concise bullets to `WEAVE_TASK_PRIMER` (the per-task, recency-weighted
guidance the agent adheres to most):

- **"AN ACCENT BELONGS TO ITS CARD, NOT TO A FLOATING SIBLING"** — a card/section
  header strip / accent bar must be the card frame's OWN `decoration.fill` (top
  corners via `cornerRadii { tl, tr }`) or a CHILD inside it, never a separate
  absolute shape positioned to overlap it (it drifts). Same for connector lines —
  anchor to the layout.
- **"DON'T PAD A REGION WITH WHITESPACE TO FILL IT"** — a sparse fixed-height card
  should `weave.frame.setSizing height:'hug'` (size to content) instead of
  inflating gap/padding; keep gap MODEST and the SAME across sibling cards; if a
  card looks empty, add a visual or enlarge the text — don't spread items apart.

Placed right after the composition ("VARY THE MACRO COMPOSITION") bullet from the
concurrent WI-233 work, so the composition-variety guidance and these fit-quality
guards sit together without conflict.

## Why prompt-only, weave-only

- Both defects are the agent's placement/sizing decisions; the engine behaves
  correctly given what it's told. Touching the engine again is unwarranted (and
  WI-232/DR-147 showed the risk).
- weave `WEAVE_TASK_PRIMER` is client-side and per-task → reaches every mode
  (incl. byo-ssh), needs only a **vite reload + new message**, no server rebuild,
  and avoids the small-think `DESIGN_RULES` file the concurrent session just edited
  (no conflict).

## Consequences

- Token cost: 2 concise bullets. Acceptable against the WI-205~213 trim intent.
- Verification: `weave-task-primer.test.ts` (+2 cases) green; full Aku agent suite
  306/306 green.
- **Live verification still required** (prompt change): regenerate a card-comparison
  slide and confirm (a) accents ride with their cards, (b) cards hug content / gaps
  are modest+consistent. Needs an Aku reconnect / new message after a vite reload.

## Related

- WI-232 / DR-147 (REVERTED engine-floor for the overlap) — established these are
  composition issues, not engine.
- WI-233 / DR-148 (concurrent — composition-archetype variety) — this sits beside it.
- Existing primer bullets: "GROUP MULTI-ITEM CLUSTERS", "SIZE STACKED REGIONS",
  "PREFER A RECTANGLE SHAPE … decoration.fill".
