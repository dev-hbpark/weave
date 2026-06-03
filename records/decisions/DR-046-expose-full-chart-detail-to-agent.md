# DR-046 — expose the full chart-detail surface to the agent (14 types, encoding, variant, style)

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (gap fix, no WI)
- **Relates:** DR-036 (generalized chart data model — 14 types + channel encoding), DR-037 (chart element overrides), DR-045 (agent command surface)

## Context

Audit of the agent's chart surface vs the chart model. The model (DR-036/037) supports **14
chart types**, a rich grammar-of-graphics `encoding` (category/x/y/series/value[]/size/OHLC/
boxplot/treemap/sankey channels), `variant` flags (stacked/normalized/horizontal/smooth/
doughnut), `palette`, `showLegend`/`showAxis`/`opacity`, and per-element `overrides`. But the
agent only saw **`chartType: 'bar'|'line'|'pie'`** and a legacy `{category, values}` encoding —
so it could not create 11 of the 14 types, set the channels non-cartesian types need
(scatter→x/y, sankey→source/target, candlestick→OHLC, …), or touch variant/style/overrides.
`weave.chart.add` also hard-capped its `chartType` input to bar/line/pie.

## Decision

Expose the full chart surface to the agent (no new command — chart detail is edited via
`weave.item.update` attrs; create via `weave.chart.add`):

- `weave.chart.add` input: widen `chartType` to the full `ChartType` (14) and accept optional
  `encoding` + `variant`, passed through (an explicit `encoding` wins over the auto-derived
  category=first/value=rest — REQUIRED for scatter/bubble/heatmap/candlestick/boxplot/treemap/
  sankey, which otherwise render a placeholder).
- Agent schema: `weave.chart.add` advertises all 14 `chartType`s + `encoding` + `variant`
  fields with descriptions of which channels each type needs.
- `CHART_ATTRS_NOTE`: documents the 14 types, the channel encoding per family, variant flags,
  and the style surface editable via `weave.item.update` — `palette` (series colors),
  `showLegend`/`showAxis`/`opacity`, and `overrides` (per-datum / per-series emphasis: color,
  borderWidth, pie offset). Data still via `weave.dataset.update`.

## Scope (edits)

- `apps/web/src/document/commands.ts` — `addChart` input widened (`ChartType`, `encoding`,
  `variant`) + passthrough; imports `ChartType`/`ChartVariant`.
- `apps/web/src/features/aku/agent/weave-command-schemas.ts` — `weave.chart.add` schema (14-type
  enum + encoding + variant) and `CHART_ATTRS_NOTE` rewritten to the full surface.
- `apps/web/src/features/aku/agent/weave-command-schemas.chart.test.ts` — assertion migrated to
  the 14-type enum + new fields.

## Editing-completeness audit (the second half of the request)

The non-chart editing surface is complete: text / shape / image / line / decoration / layout /
z-order / reparent / duplicate / remove are all reachable via `weave.item.update` /
`weave.items.update` + the structural commands; the hidden setters (setFill, setCornerRadius,
setCrop, flip, setVertices, setDecoration, multi-select family) are deliberately subsumed into
those two (WI-063). Chart detail was the one genuine gap — now closed.

## Verification

biome clean; apps/web recursive typecheck green; 502 document/aku unit tests pass (chart schema
test migrated to the 14-type enum).
