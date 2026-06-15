# DR-147 — Flex-column text gets a content floor so it overflows cleanly, never overlaps

## Metadata

| Field | Value |
|---|---|
| ID | DR-147 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | **REVERTED same-day** (see Revert note) |
| Work Item | [WI-232](../work-items/WI-232-flex-column-text-overlap.md) |
| Scope | weave `agent-text-resize.ts` (host wiring) + re-vendored `@agocraft/layout` rc.20260615020000 |
| Engine | agocraft WI-050 / DR-063 (the `keepMainContent` capability) |

## ⚠️ REVERT (2026-06-15, same day)

Reverted before surviving live use — the engine floor (agocraft DR-063) it relies
on backfired. `keepMainContent` floors at `basis`, but an agent-added text's
`basis:"auto"` is the **FULL_FRAME 1.0 seed**, not measured content (text is
measured later by the renderer). So flagged text pinned at full-cell height and,
in multi-text cells with `justify:center`, all texts stacked at full height and
**overlapped worse** (export: cell texts at `height=1.0`, y −1.03/0/1.03).

Reverted: `agent-text-resize.ts` wiring + layout pin back to rc.20260615010000
(+ pnpm install, deleted the rc.20260615020000 tarball). Verified green (agocraft
auto-flex 42, weave agent-text 109).

**Real root cause**: agent text carries a 1.0 seed height and the geometry-only
layout sizes from it; the true content height only exists in the renderer's
auto-height measurement. The durable fix is making measured content drive the box
(not a geometry floor) AND the agent not over-stuffing fixed grid cells — both
need live (browser) iteration, which this headless session could not do. Kept as
a superseded record (DRs are never deleted).

## Context / problem

A generated 3-up comparison slide ("의사소통", age columns 0~1세 / 2세 / 3~5세):
the densest column rendered its phrase lines **overlapping** each other while the
two lighter columns were fine. Root cause from the exported doc + engine read:

- The three cards are equal-height (flex row, `align:"stretch"`), so each column
  is a FIXED-height frame.
- Inside, every text child is `{grow:0, shrink:1, basis:"auto", alignSelf:"stretch"}`.
  The 3~5세 column has more content than fits, so agocraft's `resolveMainSizes`
  shrinks each text box down to the `MIN_MAIN_SHARE = 0.04` floor (and the DR-053
  container-bound clamp force-fits the rest). The fixed-px glyphs don't shrink →
  the wrapped text spills out of its collapsed box and overlaps the next item.
  (Exported doc: several content texts at `height ≈ 0.04`.)

This is a fit/overflow defect of the same family as WI-149/WI-215 (text collapsing
to a sliver), here on the MAIN axis under shrink. It is independent of the
table→representation work (WI-231); the agent actually produced a good 3-column
comparison — only the densest column's fit broke.

## Decision

Two parts:

1. **Engine capability (agocraft WI-050/DR-063)** — opt-in `keepMainContent` on
   `AutoFlexChildPolicy`: a flagged child's shrink/clamp floor is its own `basis`
   (content), not the 0.04 proxy. Flagged content overflows cleanly instead of
   collapsing into glyph-overlap. Opt-in → zero change for unflagged children.

2. **Host wiring (this DR)** — `agent-text-resize.ts` stamps `keepMainContent: true`
   on TEXT added into a flex COLUMN: on the no-policy path (`FLEX_COL_TEXT`) and
   merged into an agent-set column policy (alongside the existing `alignSelf:"stretch"`
   width binding), even when the agent already chose an `alignSelf`. Not applied to
   flex ROW text (main axis there is width, handled by the `flex:1` share) or grid.

Why the host owns the signal: the engine is geometry-only and can't measure text;
weave knows a leaf is an auto-height text. Mirrors how WI-215 bound the cross axis.

## Consequences

- An over-stuffed column now OVERFLOWS (text keeps its size, stacked, readable)
  instead of overlapping — a strictly better failure, and a signal the small-think
  review can act on by cutting content.
- Applies to NEWLY generated/added text; existing doc items lack the flag —
  regenerate the affected slide to benefit.
- Re-vendor: `@agocraft/layout` rc.20260615010000 → rc.20260615020000 (layout only;
  weave sets the flag as a loose literal, so the vendored core type is untouched).
- Verification: `agent-text-resize.test.ts` (20, incl. 3 new keepMainContent
  cases) + `agent-text-layout-matrix.test.ts` (91, REAL engine) + full weave unit
  suite **1404/1404** green; typecheck clean.
- **Live browser verification is the remaining step** (engine-layout changes are
  revert-prone — memory): regenerate a dense comparison slide and confirm no
  inter-text overlap. Requires a **vite dev restart** to pick up the new vendored
  tarball (node_modules dep change is not HMR'd).

## Related

- agocraft WI-050 / DR-063 — the engine `keepMainContent` floor.
- WI-215 (cross-axis stretch binding), WI-149/DR-103/DR-104 (sliver/render floor) —
  same anti-collapse family, other axes.
- WI-231 / DR-146 — the table→representation work; orthogonal (this is fit/overflow).
