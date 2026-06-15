# WI-232 — Flex-column text overlaps in the densest card of a comparison slide

## Metadata

| Field | Value |
|---|---|
| ID | WI-232 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | **REVERTED same-day** — the `keepMainContent` fix backfired (text pinned at the 1.0 seed → worse overlap); reverted engine + wiring to layout rc.20260615010000. Root cause + next steps in the Revert note. |
| Type | Layout fit/overflow (agent-generated slide) |
| Decision | [DR-147](../decisions/DR-147-flex-column-text-content-floor.md) |
| Engine | agocraft WI-050 / DR-063 |

## Problem (reported)

User's last generation: a 3-up comparison slide ("의사소통" — age columns 0~1세 /
2세 / **3~5세**). The third (densest) column's text lines rendered **overlapping**
each other; columns 1–2 were fine. Diagnosed from the exported design JSON.

## Root cause

Equal-height cards (flex row, `align:"stretch"`) → each column is a FIXED-height
frame. Text children are `{grow:0, shrink:1, basis:"auto", alignSelf:"stretch"}`.
The 3~5세 column over-fills, so agocraft shrinks each text box to the 0.04 floor
(and the DR-053 clamp force-fits the rest); fixed-px glyphs don't shrink with the
box → text spills out and overlaps. (Exported doc: content texts at `height≈0.04`.)
Same anti-collapse family as WI-149/WI-215, on the MAIN axis under shrink. Not the
table→representation work (WI-231) — the 3-column comparison itself was good.

## Change

- **Engine (agocraft WI-050/DR-063, re-vendored)** — opt-in `keepMainContent` on
  `AutoFlexChildPolicy`: floors a flagged child's shrink/clamp at its content
  (`basis`), so it overflows cleanly instead of collapsing into overlap.
- **weave `agent-text-resize.ts`** — stamp `keepMainContent: true` on flex-COLUMN
  text (the `FLEX_COL_TEXT` no-policy path + merged into an agent-set column policy,
  even when `alignSelf` is already chosen). Row/grid text untouched.
- Tests: `agent-text-resize.test.ts` +3 cases (stamp + two merge paths + leave-alone).

## Verification

- weave: `agent-text-resize.test.ts` 20/20, `agent-text-layout-matrix.test.ts`
  91/91 (REAL engine), full unit suite **1404/1404** green; `tsc --noEmit` clean.
- Re-vendor: `@agocraft/layout` rc.20260615020000 (pnpm-workspace.yaml override +
  both package.json pins + `pnpm install`; lockfile updated, installed dist carries
  the field).

## Caveats / remaining

- **Live verify pending**: regenerate a dense comparison slide and confirm no
  inter-text overlap. Needs a **vite dev restart** (new vendored tarball is a
  node_modules change, not HMR'd).
- Applies to NEW generations; the existing broken slide's items lack the flag —
  regenerate (or re-add the texts) to fix it.
- An over-stuffed column now OVERFLOWS rather than overlaps; cutting the excess
  content is the agent/review's job (WI-231 representation + small-think prune).
