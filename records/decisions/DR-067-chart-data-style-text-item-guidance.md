# DR-067 — Agent guidance: chart data composition, styling, and text-as-items

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** WI-098
- **Relates:** WI-077/DR-036 (data-driven charts + encoding), WI-078/DR-035/DR-037
  (overrides + managed labels as REAL text Items), WI-092/DR-055 (chart direct
  manipulation), WI-094/DR-063 (chart partial-edit deep-merge), WI-095/DR-064
  (command descriptions)
- **Operator directive (2026-06-05):** strengthen how the agent composes chart
  DATA and makes charts beautiful, and make it use the fact that a chart shows its
  text through REAL weave text Items.

## Context

The agent could create + style charts, but the guidance was a single command-note
(`CHART_ATTRS_NOTE`) and there was **no `chart` itemKind in WEAVE_CAPABILITIES** —
so chart data-composition, beautification, and (critically) the text-as-items
model were under-taught. The load-bearing fact the agent didn't know: for
bar/line/area + pie, a chart's CATEGORY/axis labels are AUTO-MANAGED `text` child
Items derived from the dataset (DR-035 `chart-label-sync`), projected non-undoably;
their text/position re-derive, but their visual STYLE (color/font) persists. The
agent was therefore liable to hand-add duplicate labels, try to free-edit/reposition
managed ones, or ship a chart with no human title/takeaway.

## Decision

Teach chart **data → style → text** at every layer the agent reads (mode-symmetric):

1. **New `chart` itemKind in WEAVE_CAPABILITIES** (the authoritative cached home):
   - DATA: dataset shape (category col first, numeric series), pick the fitting
     type among 14, encoding per type, ≤~5 series.
   - STYLE: palette via the theme categorical tokens (--domain-slide/canvas/block/
     media-accent), variant (doughnut/stacked/smooth/horizontal), overrides to
     emphasise the hero datum, showLegend/showAxis/opacity/barWidth, ground on a
     card surface, AA contrast.
   - TEXT-AS-ITEMS: category/axis labels (bar/line/area + pie) are auto-managed
     text child Items derived from data → don't hand-add or reposition; editing
     their TEXT edits the DATA; you MAY restyle them (persists); ADD your OWN text
     Items for the TITLE / takeaway / callout / source note. (Other types keep the
     engine's own labels.)
2. **`CHART_ATTRS_NOTE`** (command schema) — append the data/style/text-items lines.
3. **`WEAVE_DOMAIN_KNOWLEDGE` rule 5** — a dedicated CHARTS bullet (data → style →
   title/takeaway + text-as-items).

(Generic, host-agnostic data-viz guidance also added to the small-think harness —
@small-think WI-027 — incl. "pair every chart with a title + takeaway as text" and
"some hosts render category labels as managed text items — restyle, don't dup".)

## Consequences

- (+) Charts come out with clean data, a restrained theme-reactive palette, a
  hero emphasis, a card surface, AND a human title + takeaway — and the agent
  stops fighting / duplicating the managed category labels.
- (+) No code/behavior change — documents existing engine behavior (DR-035/036/037).
- (−) More cached prompt text (a new itemKind); kept structured + concise.

## Verification (SVL gate)

`@weave/web` typecheck clean; aku-agent suites pass (capabilities consumed by the
coverage/schema tests); biome clean on changed files.
