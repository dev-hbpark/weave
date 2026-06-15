# WI-238 — Grid row auto-fit (grow the grid frame when cells overflow)

## Metadata

| Field | Value |
|---|---|
| ID | WI-238 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | IN PROGRESS (impl + tests; live verify pending) |
| Type | Layout content-sizing (grid) |
| Decision | [DR-153](../decisions/DR-153-grid-row-autofit.md) |

## Problem

WI-237 flex auto-fit skips grid children (a grid child's height is the row track's,
not its frame's). The 27-row table clipped (cells 14px box vs 18px need) because the
grid frame was too short and `fr` tracks squeezed the rows.

## Change

- `text-autofit.ts` — `gridGrowTarget(currentHeightRatio, maxOverflowRatio, capRatio)`
  pure helper (grow proportionally, capped). Headless-tested.
- `text-autofit-context.tsx` — add `requestGridFit(cellItemId, overflowRatio)` to the
  refit channel.
- `TextBlock.tsx` — grid-cell text now MEASURES (not skips); on overflow reports
  `requestGridFit(selfId, contentPx/cellBoxPx)`.
- `DesignPage.tsx` — resolve the parent grid frame (`findParentAndIndex` on the doc),
  coalesce per grid frame (max ratio, rAF), grow its `frame.height` in one `runBatch`,
  capped so it can't overflow its parent.

Same flag (default ON) + `runBatch` (one undo/save per settle) as WI-237.

## Verification

- Headless unit tests for `gridGrowTarget`.
- **Live verify pending**: regenerate a dense table → rows grow to fit (no clip),
  table doesn't overflow the slide, converges, no oscillation. Disable via
  `localStorage["weave.textAutofit"]="off"`.
