# WI-234 — Absolute accents drift from cards; regions oversized/whitespace-padded

## Metadata

| Field | Value |
|---|---|
| ID | WI-234 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE (prompt; live verify pending) |
| Type | Agent composition quality (Aku) |
| Decision | [DR-149](../decisions/DR-149-accent-belongs-to-card-no-whitespace-pad.md) |

## Problem (reported, JSON-confirmed)

On a generated interpolation-comparison slide:
1. Card coloured header strips are SEPARATE absolute root `shape`s hand-aligned to
   the card frames → drift when anything moves (`shape-mqeivkdp-1c` x=0.36000413 vs
   card x=0.36 — drift started).
2. Fixed-height cards padded with large, inconsistent gaps (Bilinear `gapPx 41.5`
   vs Bicubic `gap 0.02`); 1-line texts in ~2×-content boxes, top-aligned → looks
   empty, text looks small.

Both are agent composition choices (not engine — the related overlap's engine fix
was reverted in WI-232/DR-147).

## Change

`apps/web/src/features/aku/agent/weave-capabilities.ts` `WEAVE_TASK_PRIMER` — two
bullets:
- accent/header strip = the card's OWN `decoration.fill` (top `cornerRadii`) or a
  CHILD, never a floating absolute sibling (drifts); connectors anchor to layout.
- a sparse fixed-height card uses `setSizing height:'hug'`; gap MODEST + CONSISTENT
  across sibling cards; add a visual / enlarge text instead of spreading items.

`weave-task-primer.test.ts` — +2 cases asserting both bullets.

## Verification

- `weave-task-primer.test.ts` 6/6; full Aku agent suite **306/306** green.
- weave-only, no engine, no small-think, no re-vendor.

## Caveat

- Prompt change → **vite reload + new Aku message** to take effect (no server
  rebuild). **Live verification pending**: regenerate a card-comparison slide and
  confirm accents ride with cards + cards hug/consistent-gap.
