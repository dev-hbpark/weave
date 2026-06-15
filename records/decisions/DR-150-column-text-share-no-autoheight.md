# DR-150 — Column text added without an explicit height shares the column (no seed→floor collapse)

## Metadata

| Field | Value |
|---|---|
| ID | DR-150 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | ACCEPTED (live verification pending) |
| Work Item | [WI-235](../work-items/WI-235-column-text-seed-floor-overlap.md) |
| Scope | weave `agent-text-resize.ts` (`fixAgentTextBox`) — weave-only, no engine, no re-vendor |

## Context / problem

A generated slide's hero title overlapped ("Image Interpolation / Methods /
subtitle" at 52px stacked on top of each other). Measured live in the open tab
(canvasH=1080): the hero text boxes were **26px** while the glyphs needed **57px**,
inside a panel that was **641px** tall — so it is NOT font-too-big and NOT overflow;
it is a **seed→floor collapse**, and a manual resize did NOT fix it.

Root cause (confirmed via `TextBlock.tsx` L13-17): **weave has no text auto-height
any more** — "the render-timing measure-and-write-back (ResizeObserver auto-fit)
is REMOVED; height is fed into the engine as an input, not measured at render." So
a text box's height is whatever is in the doc, never measured from content.

The agent adds column text with `agent-text-resize.ts`'s `FLEX_COL_TEXT`
= `{grow:0, shrink:1, basis:"auto", alignSelf:"stretch"}`. With no explicit height
the text inherits the **FULL_FRAME 1.0 seed**; in a flex COLUMN the main axis is
height, so N stacked texts read N×1.0 as their basis → the flex sees a massive
overflow and shrinks EVERY child to the `MIN_MAIN_SHARE` (0.04) floor → the
fixed-px glyphs spill out of the 0.04 box and overlap the next item. This is the
exact COLUMN analogue of the ROW seed-ratchet already fixed by `FLEX_SHARE`
(WI-149/DR-104): for a row, `basis:0` neutralises the seed; the column case was
never fixed.

## Decision

In `fixAgentTextBox`, for TEXT added into a flex COLUMN with **no explicit height**
and no pre-set `layoutChild`, stamp a SHARE policy
`FLEX_COL_TEXT_SHARE = {grow:1, shrink:1, basis:0, alignSelf:"stretch"}` instead of
`FLEX_COL_TEXT` (basis:"auto"):

- `basis:0` → the child contributes nothing to the column's base size, so the seed
  can never make it over-fill → no collapse to the floor → **no glyph overlap**.
- `grow:1` → the texts share the column height evenly (each gets a roomy slice —
  whitespace at worst, never overlap).
- `alignSelf:"stretch"` → width still bound to the column (text wraps, no sliver).

When the agent DID pass an explicit height, `FLEX_COL_TEXT` (basis:"auto") is kept
so the given height holds. This mirrors what column NON-text already does
(`FLEX_SHARE`) and the row text fix — consistent, not a new paradigm.

## Trade-off (explicit)

Without text measurement the engine cannot size a column text to its content, so
the choice is **overlap (current bug)** vs **even share (whitespace)**. Share is
strictly better: a 1-line text in a big slice is readable; overlapping glyphs are
not. The deeper "size each text to its content" needs restoring a measurement step
(a much larger change) — out of scope here.

## Consequences

- weave-only, no engine change, no re-vendor; takes effect on a **vite reload +
  regenerate** (no server rebuild). Applies to NEW adds; existing docs keep their
  stored heights (regenerate to benefit).
- Tests: `agent-text-resize.test.ts` updated (no-height → share; explicit-height →
  basis:auto kept) + `agent-text-layout-matrix.test.ts` (REAL engine, 91) green;
  full Aku agent suite 307/307.
- **Live verification pending**: regenerate a multi-text column slide and confirm
  the console box/need table reads `fits:true` for column texts and the hero title
  no longer overlaps. If it regresses, revert (clean — weave-only).

## Related

- `TextBlock.tsx` L13-17 — the removed auto-height (the architectural reason).
- WI-149 / DR-104 (`FLEX_SHARE`, row seed-ratchet) — the proven precedent.
- WI-232 / DR-147 (REVERTED engine `keepMainContent`) — established the overlap is
  NOT fixable in the geometry engine (no text measurement); this fix lives in the
  host add-path instead.
- WI-234 / DR-149 (accent-in-card, no whitespace padding) — same generation, sibling fix.
