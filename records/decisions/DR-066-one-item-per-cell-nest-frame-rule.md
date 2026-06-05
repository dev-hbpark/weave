# DR-066 — Layout rule for the agent: one item per cell/slot; nest a frame for several

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** WI-097
- **Relates:** WI-020/WI-043 (auto-flex / auto-grid layout), WI-095/DR-064 (agent
  command + capabilities surface), @agocraft/layout engine (auto-placement)
- **Operator directive (2026-06-05):** the agent must KNOW that a grid/flex cell
  holds only one item, and that putting several items in one cell is done by
  nesting a frame as that cell's single child.

## Context

The @agocraft/layout engine auto-places each DIRECT child of an auto-grid frame
into its OWN cell (a joining child takes the next free cell, honoring spans —
`engine.ts` occupied-cell scan), and each auto-flex child into its own slot along
the axis. Two children CANNOT co-occupy one cell/slot; `columnSpan`/`rowSpan` only
MERGE cells for a single child. The agent guidance described tracks, spans and
per-child policy, but never stated this constraint — so an agent wanting a card
(title + body + button) in one grid cell could drop three children into the grid
and get three separate cells instead of one composed card.

## Decision

State the rule, and the resolution, everywhere the agent reads layout guidance:

- **Resolution:** to place MULTIPLE items in ONE cell/slot, add ONE nested frame
  as that cell's child (`presentable:false`), give it its OWN auto-layout, and put
  the items inside it. The nested frame is the single occupant; its inner layout
  arranges the contents.

Encoded at three points (mode-symmetric — api + byo-ssh both read these):

1. `WEAVE_CAPABILITIES.layoutKinds` — auto-grid + auto-flex `description` and
   `childConstraints` gain the "ONE ITEM PER CELL / SLOT … nest a frame" clause.
2. `WEAVE_DOMAIN_KNOWLEDGE` rule 0 (layout) — a dedicated "ONE ITEM PER CELL / SLOT"
   paragraph after "TABLES ARE GRIDS", with the card/stat/icon-label examples.
3. `WEAVE_TASK_PRIMER` — a one-line per-task reminder next to the tables line.

(Generic reinforcement also added to small-think's host-agnostic harness —
@small-think WI-026 — so the rule holds at the harness layer for any host.)

## Consequences

- (+) The agent composes multi-item cells correctly (nested frame), instead of
  scattering children into separate cells.
- (+) No code/behavior change — the engine already worked this way; this closes a
  guidance gap.
- (−) Slightly more prompt text (kept concise; the primer line is one sentence).

## Verification (SVL gate)

`@weave/web` typecheck clean; aku-agent suites pass (capabilities consumed by the
schema/coverage tests); biome clean on the changed file.
