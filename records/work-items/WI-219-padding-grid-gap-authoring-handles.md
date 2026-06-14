# WI-219 — Padding + grid-gap on-canvas authoring handles

## Metadata

| Field | Value |
|---|---|
| ID | WI-219 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Status | IN PROGRESS |
| Type | Feature (layout UX / Figma parity) |
| Depends on | WI-146 (layout-edit handles), WI-043 (px-native gap/padding), DR-design-030 |
| Decision records | [DR-design-031](../design-reviews/DR-design-031-padding-grid-gap-handles.md), [DR-139](../decisions/DR-139-padding-grid-gap-authoring-model.md) |

## Problem

WI-043 made gap/padding **fixed-px capable** end-to-end (engine derives px gap/padding
against a container's absolute box; flex gap is *authored* in px via the P5 gap-line
drag). But two authoring affordances are still missing on canvas:

1. **Padding** — there is **no** way to author a flex/grid frame's padding on canvas at
   all (the handles only *read* `info.pad`). No toolbar numeric input exists either.
2. **Grid gap** — the grid boundary lines only **resize tracks** (`resizeGridAxis`);
   there is no affordance to author a grid's uniform `columnGap`/`rowGap`. (Flex already
   has gap-line authoring from WI-043 P5.)

Result: a user can make a fixed-px gap on a flex row but cannot set padding on any
container, nor a grid's gap, without editing JSON. This WI closes that — the last
"사용자 체감" piece WI-043 flagged as a follow-up.

## Scope

In-scope (on-canvas, app-local overlay chrome — same class as WI-146):

- **Padding edges** (flex + grid) — 4 draggable inner-edge lines at the padded inset.
  Drag a side inward/outward → author that side's `paddingPx` (+ ratio mirror so the
  immediate no-dims reflow is exact; the engine reads `paddingPx` on later resize → the
  padding stays fixed px, like the P5 gap).
- **Grid-gap grips** (grid only) — a dedicated small grip centered in each gap band
  (distinct from the track-boundary line). Column grip drag (horizontal) → uniform
  `columnGapPx`; row grip drag (vertical) → uniform `rowGapPx` (+ ratio mirror).
  Plain track-boundary line drag keeps resizing tracks (unchanged). (DR-139 / user pick.)

Out of scope (follow-up):

- Toolbar numeric inputs for gap/padding (keyboard-accessible alternative). On-canvas
  drag is the only path for now — consistent with the existing on-canvas-only model, but
  noted as an a11y follow-up.
- Per-corner / linked-padding modifiers (Figma's "set all sides"); v1 authors per side.
- Flex per-side padding cross-axis subtleties beyond the 4 straightforward edges.

## Plan (SOLID/GRASP)

- Pure spec-edit helpers (`layout-spec-edit.ts`): `setPaddingSide(spec, side, ratio)`
  (flex|grid), `setGridColumnGap(spec, ratio)`, `setGridRowGap(spec, ratio)` — each
  returns a new clamped spec, no DOM. Unit-tested (Rule 2 / testability).
- Handle rendering stays in `LayoutEditHandles.tsx` (app-local canvas overlay, NOT a
  design-system primitive — DR-design-030 precedent). New `PaddingEdge` + `GapGrip`
  portal components mirror the existing `LayoutLine` (same gesture runner, same
  `weave.frame.setLayout` dispatch, one undo via mergeKey).
- All mutation routes through `editor.exec("weave.frame.setLayout", …)` (Document
  mutation rule). The px basis (gapPx/paddingPx) is authored directly; ratio is mirrored.

## Verification

- Unit: `layout-spec-edit.test.ts` — padding-side clamp + set, grid column/row gap set.
- e2e: `padding-grid-gap.spec.ts` — (1) drag a flex padding edge → `paddingPx.left` > 0;
  (2) drag a grid gap grip → `columnGapPx` > 0; (3) (regression) plain grid boundary drag
  still resizes tracks, not gap.
- Regression: weave unit suite + the layout e2e set (px-gap / hug-resize / nested-resize).

## Status log

**Build DONE (2026-06-14):** pure helpers `setPaddingSide` / `setGridColumnGap` /
`setGridRowGap` + `clampPadding`/`MAX_PADDING` in `layout-spec-edit.ts` (unit-tested,
layout-spec-edit 21 pass). `LayoutEditHandles.tsx` gained `PaddingEdge` (4 dashed inner
edges, flex+grid, authors `paddingPx[side]` + ratio mirror, absolute cursor-follow) and
`GapGrip` (diamond per grid gap band, authors `columnGapPx`/`rowGapPx` + ratio mirror,
factor `boundaryIndex+0.5`). Two new gesture kinds registered in `handle-gesture-runner.ts`
(`layout-padding-drag`, `layout-gap-grip-drag` → `dragGestureStates`) — the first run
failed because unknown kinds are no-ops; registering them fixed it. Track-boundary line
keeps `resizeGridAxis` (unchanged). All via `weave.frame.setLayout` (one undo). weave unit
1373 green, tsc/biome clean. Live e2e `padding-grid-gap.spec.ts` (3): padding-edge authors
paddingPx, gap-grip authors columnGapPx, track-line still resizes tracks (no gap authored).
