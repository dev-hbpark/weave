# WI-222 — Structural typing for the agent's LayoutSpec / LayoutChildPolicy schema

## Metadata

| Field | Value |
|---|---|
| ID | WI-222 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Status | IN PROGRESS |
| Type | Agent quality / schema fix |
| Trigger | User report: the agent can't reliably produce grid/flex DETAIL properties. |

## Problem

The agent fails to construct grid/flex detail properties (tracks, minmax, padding,
repeats, gap, enums) reliably.

Investigation (command wiring is sound, schema is the gap):

- **Surface** — `weave.frame.setLayout` / `setSizing` / `item.setLayoutChild` /
  `resizeHug` are all exposed (canonical `allExcept` + `PAGE_PASSTHROUGH_TOOLS`).
  Micro-ops (swap/drop) are intentionally de-listed. ✓
- **Command wiring** — `normalizeLayoutSpec` → `createAutoFlexSpec`/`createAutoGridSpec`,
  both of which **spread `...overrides`**, so every advertised field (direction, gap,
  justify, align, padding, wrap, alignContent, columns/rows, columnGap/rowGap,
  columnsRepeat/rowsRepeat, autoFlow, dense, areas, minmax tracks, sizing, px) round-trips
  faithfully. No drop. ✓
- **Schema** — `LAYOUT_SPEC` and `LAYOUT_CHILD_POLICY` are **structurally empty**:
  `{ type:"object", additionalProperties:true }` with ALL shape in a prose `description`.
  The model has concrete property names only in prose, no JSON-schema scaffold — so it
  malforms the nested objects (TrackSize unions, minmax bounds, padding objects, repeat
  objects) and drops/renames enum values. ✗ ← root cause.

## Fix

Give both schemas real **typed structure** while keeping `additionalProperties:true`
(forward-compat) and the rich prose `description` (semantics + which field applies to which
kind, which JSON Schema can't gate on a `kind` discriminator):

- Reusable sub-schemas: `PADDING_SCHEMA` ({top,right,bottom,left:number}),
  `TRACK_SIZE_SCHEMA` (kind enum fr|ratio|auto|minmax + value/min/max),
  `TRACK_REPEAT_SCHEMA` ({mode:auto-fill|auto-fit, track}).
- `LAYOUT_SPEC.properties`: kind, direction, gap, justify, align (enums unioned across
  flex+grid — the prose says which applies where), padding, wrap, alignContent, columns,
  rows, columnGap, rowGap, columnsRepeat, rowsRepeat, autoFlow, dense, areas.
- `LAYOUT_CHILD_POLICY.properties`: kind, anchor, grow, shrink, basis, alignSelf, column,
  row, columnSpan, rowSpan, justifySelf, area.

No command/engine change (wiring already faithful). The existing description prose is kept
verbatim so `weave-command-schemas.layout.test.ts` term assertions stay green.

## Verification

- `weave-command-schemas.layout.test.ts` (prose-term assertions) green.
- New assertions: the schemas declare `properties` (not just `additionalProperties`) for
  the key fields (columns/rows/padding/gap/justify/align + TrackSize kind enum).
- weave unit suite green; tsc/biome clean.

## Status log

**Build DONE (2026-06-14):** Added `PADDING_SCHEMA`, `TRACK_SIZE_SCHEMA` (kind enum
fr|ratio|auto|minmax + value/min/max), `TRACK_REPEAT_SCHEMA` and gave `LAYOUT_SPEC` +
`LAYOUT_CHILD_POLICY` full `properties` (kind/direction/gap/justify/align/padding/wrap/
alignContent/columns/rows/columnGap/rowGap/columnsRepeat/rowsRepeat/autoFlow/dense/areas;
policy: kind/anchor/grow/shrink/basis/alignSelf/column/row/columnSpan/rowSpan/justifySelf/
area). `additionalProperties:true` + the full prose `description` kept verbatim. No command
or engine change (factories already spread every field). Verified the wiring chain first:
surface exposes setLayout/setSizing/setLayoutChild/resizeHug; normalizeLayoutSpec →
createAutoFlex/GridSpec spread `...overrides` (faithful round-trip). Tests: layout schema
7 (5 prose + 2 new structural — typed properties, columns.items TrackSize kind enum incl.
minmax, padding 4-side), weave unit **1381** green, tsc/biome clean.

**Note (deliberately out of scope):** the agent authors gap/padding as **ratio** (not the
px fields gapPx/columnGapPx/rowGapPx/paddingPx — those stay engine-internal per the WI-042
graduation). `sizing` (Fixed/Hug/Fill) remains its own command `weave.frame.setSizing`,
already documented in capabilities; it is not folded into the setLayout schema.
