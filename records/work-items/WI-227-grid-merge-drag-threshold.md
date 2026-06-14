# WI-227 — Grid cell merge: drag threshold + spreadsheet engine re-vendor

## Metadata

| Field | Value |
|---|---|
| ID | WI-227 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE (drag threshold + re-vendor + live e2e) |
| Type | Bug fix (grid interaction) |
| Decision | [DR-142](../decisions/DR-142-grid-merge-drag-threshold.md) |
| Upstream | agocraft [WI-049 / DR-062](../../../agocraft/records/work-items/WI-049-grid-merge-eviction.md) — spreadsheet-style merge eviction (engine) |

## Problem

After merging grid cells (열 병합 / 행 병합), clicking a cell moved it, swaps
landed in weird places, and cells appeared/disappeared. The engine half is
agocraft WI-049 (covered siblings now evict; merged-cell drop is span-aware). The
weave half is the **interaction**: `use-layout-child-drag-controller` committed a
grid drop on `pointerup` with **no movement threshold** — a plain click on the
selected (merged) child fired `weave.item.dropGridCell`, relocating it.

## Fix

- `apps/web/src/document/interactions/use-layout-child-drag-controller.ts`:
  record the press origin, and only treat the gesture as a drag once the pointer
  travels past `DRAG_THRESHOLD_PX` (4px). A press that never crosses it is a
  CLICK — no drop preview, no commit, selection untouched.
- Re-vendor the spreadsheet-merge engine: `@agocraft/layout` →
  `agocraft-layout-1.0.0-rc.20260615010000.tgz` (apps/web/package.json,
  root package.json, pnpm-workspace.yaml override, lockfile).

## Verification

- `apps/web`: `tsc --noEmit` clean; `vitest run src/document` → 1046 tests green
- Live e2e (real browser, weave command path → vendored engine):
  - `apps/web/e2e/grid-merge-eviction.spec.ts` — merge a cell to 2×2 → the 3 covered siblings relocate to distinct free cells, none under the merged block (green, 9.3s)
  - `e2e/layout-extensions-command-path.spec.ts`, `e2e/grid-grow-columns.spec.ts` — green (no regression)
