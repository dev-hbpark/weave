# DR-039 — AKU agent: items fill their cell (layout-sized) + tables are auto-grid

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (rule change, no WI)
- **Relates:** DR-038 (text placement — this refines its sizing model from *hug* to *fill*),
  small-think **DR-021** (host-agnostic counterpart)

## Context

After DR-038 the agent placed text in layout frames, but:

1. It built **tables by nesting auto-flex rows** instead of one `auto-grid` — columns drifted
   out of alignment and the structure was hard to edit.
2. Items **hugged their content** rather than filling the cell — a short title left its grid/
   flex cell half-empty. DR-038's "the box auto-grows its height, the layout absorbs it"
   wording encouraged the hug.

weave already exposes the mechanics: `auto-grid` with explicit tracks + cell placement;
`align`/`justify` `'stretch'`; auto-flex `grow`; per-child `alignSelf`/`justifySelf`. A text
item that is a flex/grid child is parent-driven (`deriveTextAutoResize` →
`WIDTH_AND_HEIGHT`/parent-driven), so the layout can size its box — setting it to an
absolute-constraints anchor would instead detach it from the flow.

## Decision

Update the agent guidance to a **fill** model:

- **Tables are auto-grid.** Any table / matrix / comparison grid / card grid / calendar / spec
  sheet MUST be `weave.frame.setLayout { kind:'auto-grid', columns, rows }` with cells placed
  by `{ column, row, columnSpan?, rowSpan? }` — never nested auto-flex rows.
- **Items fill their cell.** Set frame `align:'stretch'` (auto-flex cross) + `justify`+`align`
  `'stretch'` (auto-grid), `grow` (auto-flex main) / equal `basis` / `fr` tracks, or per-child
  `alignSelf`/`justifySelf:'stretch'`. A short title occupies its whole cell.
- **Text is layout-sized, not self-sized.** The box size comes from the layout; glyphs are
  placed with `textAlignHorizontal`/`textAlignVertical`. Do not pin a guessed px height; do not
  detach a layout child with `absolute-constraints` (only intentional free-form text uses that).
- **Grid children follow layout changes** via the auto-grid child policy, never absolute coords.

Prompt-rule change only (no editor/runtime change); no deterministic gate.

## Scope (edits)

`apps/web/src/features/aku/agent/weave-capabilities.ts`:
- `auto-grid` layoutKind description — flagged as the table tool + stretch-to-fill.
- `text` itemKind `PLACEMENT & SIZING` — hug → fill (layout-sized, stretch/grow, textAlign).
- `WEAVE_DOMAIN_KNOWLEDGE` rule 0 — "TABLES ARE GRIDS" clause; rule 3 retitled "ITEMS ARE
  LAYOUT-SIZED — FILL THE CELL, DON'T HUG" with the stretch/grow + grid-follows-layout rules.
- `WEAVE_TASK_PRIMER` — compact bullet (tables → grid; children fill cells; text aligns, never
  hugs).

## Consequences

- Column-aligned, editable tables; filled, intentional cells instead of content-hugging
  fragments.
- Refines DR-038: the layout still owns fit, now by FILLING cells (stretch) rather than the
  hug-and-absorb model. DR-038's "auto-grows / do not pin height" is superseded by this fill
  model where they conflict.

## Update — 2026-06-03 (schema descriptions made self-sufficient)

Verified the agent/MCP tool schema (`weave-command-schemas.ts`) can express these rules from the
schema alone, and closed the gaps found:

- `LAYOUT_SPEC` — `align`/`justify` `'stretch'` now states it FILLS the cross axis / whole cell;
  `auto-grid` flagged as the table tool (not nested flex rows).
- `LAYOUT_CHILD_POLICY` — `grow` ≥1 = expand to fill the main axis; `alignSelf`/`justifySelf`
  `'stretch'` = fill the cell.
- `TEXT_ATTRS_NOTE` / frame-geometry note — ratio basis is the item's IMMEDIATE parent frame
  (its `containerId` frame), not the slide/canvas.

Mechanisms (tracks, span, grow, alignSelf, fontSizeSpec, containerId, presentable) were already
present; only the FILL semantics and immediate-parent precision needed documenting.
