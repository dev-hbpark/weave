# DR-142 — A grid layout-child press is a click until it travels past a threshold

## Metadata

| Field | Value |
|---|---|
| ID | DR-142 |
| Date | 2026-06-15 |
| Status | ACCEPTED |
| Work item | [WI-227](../work-items/WI-227-grid-merge-drag-threshold.md) |
| Upstream | agocraft DR-062 (spreadsheet merge eviction — the engine half) |

## Context

`useLayoutChildDragController` arms when the user presses the currently-selected
layout child, then committed the resolved drop (`weave.item.dropGridCell` /
`weave.item.swapFlexOrder`) on **every** `pointerup` — there was no
press-vs-drag distinction. For a 1×1 cell this was harmless (dropping on your own
cell is an engine no-op). But a **merged** child visually covers neighbour cells,
so a click inside its span resolved to a non-origin `(col,row)` and committed a
relocation. The operator experienced "clicking a cell moves it."

The engine now also guards this (DR-062 span-aware own-cell), but the interaction
layer must not author a mutation for a plain click in the first place — pressing a
selected element to keep it selected is not a drag.

## Decision

Add a movement threshold to the controller: record the `pointerdown` origin; the
gesture becomes a DRAG only once the pointer moves past `DRAG_THRESHOLD_PX` (4px).
Below it, `pointerup` commits nothing and shows no drop preview — selection is
left as-is. This is the standard click-vs-drag discrimination, applied to the
layout-child move gesture.

## Consequences

- A click on a merged (or any) grid cell never relocates it.
- Real drags (≥ 4px travel) are unchanged: preview + commit as before.
- Pairs with DR-062: the engine makes merge non-overlapping and merged-drops
  span-aware; this makes the gesture not fire on a click. Both verified by
  `apps/web/e2e/grid-merge-eviction.spec.ts` + existing grid command-path e2e.
