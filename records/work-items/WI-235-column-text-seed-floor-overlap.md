# WI-235 — Hero/column text overlaps: FULL_FRAME seed collapses to the floor

## Metadata

| Field | Value |
|---|---|
| ID | WI-235 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE pending live verify (tests green) |
| Type | Agent add-path layout (column text height) |
| Decision | [DR-150](../decisions/DR-150-column-text-share-no-autoheight.md) |

## Problem (live-measured)

A generated slide's hero title ("Image Interpolation / Methods / subtitle", 52px)
rendered overlapping. Live console measurement (canvasH=1080): box **26px** vs
needed **57px** in a **641px** panel → not font-too-big, not overflow — a
seed→floor collapse; a manual resize did NOT fix it.

## Root cause

weave removed text auto-height (`TextBlock.tsx` L13-17 — height is an engine INPUT,
not measured at render). The agent's column-text policy `FLEX_COL_TEXT`
(`basis:"auto"`) + a FULL_FRAME 1.0 seed → N stacked column texts read N×1.0 →
flex shrinks all to the `MIN_MAIN_SHARE` 0.04 floor → fixed-px glyphs spill and
overlap. The COLUMN analogue of the ROW seed-ratchet that `FLEX_SHARE` already
fixes (WI-149). See DR-150.

## Change

`apps/web/src/features/aku/agent/agent-text-resize.ts` — for flex-COLUMN text with
NO explicit height + no existing `layoutChild`, stamp
`FLEX_COL_TEXT_SHARE = {grow:1, shrink:1, basis:0, alignSelf:"stretch"}` (share the
column height, seed can't over-fill → no collapse). Explicit height → keep
`FLEX_COL_TEXT` (basis:"auto"). `agent-text-resize.test.ts` updated +1 case.

## Verification

- `agent-text-resize.test.ts` 19/19, `agent-text-layout-matrix.test.ts` 91/91
  (REAL engine), full Aku agent suite **307/307** green. weave-only, no engine.
- **Live verify pending** (committed at operator request before regen confirmation):
  vite reload → regenerate a multi-text column slide → console box/need table should
  read `fits:true` + no hero overlap. Revert is clean (weave-only) if it regresses.
