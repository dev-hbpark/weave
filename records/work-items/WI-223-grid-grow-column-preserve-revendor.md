# WI-223 — Re-vendor column-preserving grid growth (fixes "content-heavy grid → header only")

## Metadata

| Field | Value |
|---|---|
| ID | WI-223 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Status | IN PROGRESS |
| Type | Bug fix (host re-vendor + e2e) |
| Upstream | agocraft WI-044 / DR-057 |
| Trigger | User: an agent-built CONTENT-HEAVY grid/table sometimes renders only the header. |

## Root cause (upstream)

`@agocraft/layout`'s `grownAutoGridSpec` reshaped an overflowing grid with a √n
square heuristic, so an explicit 3-column table dropped to 2 columns on the FIRST
data cell and kept morphing (10 cells → 4 cols). Cells scrambled / headers
misaligned, and the agent commonly stopped after the header — "헤더만 생성".

Fixed in agocraft WI-044: grow-to-fit PRESERVES an explicit column count (≥2) and
adds ROWS only; the square default applies only to an unconfigured (≤1-col) grid.

## weave change

- Re-vendor `@agocraft/layout` rc.20260614170000 (WI-044 fix). 3 pins bumped + install.
- Live e2e `grid-grow-columns.spec.ts`: build an explicit 3-column grid, add 10
  children via the agent grow path (`enforceGridCapacity:true`) — the grid stays
  **3 columns × 4 rows** (old behavior: 4 columns). No code change in weave (the
  `enforceGridCapacity` wiring already routes to the engine's growToFit).

## Note (not the cause, but adjacent)

"Only header" can also be an agent-stopping-early symptom; the column scramble was a
strong trigger of that. The deterministic reshape bug is fixed here; WI-222 already
hardened the layout schema so the agent emits grid specs more reliably.

## Verification

- e2e `grid-grow-columns.spec.ts` green; `hug-resize.spec.ts` (incl. grid Hug) green.
- weave unit suite green; tsc/biome clean.

## Status log

**DONE (2026-06-14):** Re-vendored `@agocraft/layout` rc.20260614170000 (WI-044). New live
e2e `grid-grow-columns.spec.ts` — a 3-col grid + 10 children (agent grow path) stays
**3×4** (was 4 cols). Updated two weave unit tests that encoded the old square reshape:
`commands-layout-relayout.test.ts` #3 grid grow (2×2 + 5th → now **2×3**, new cell at col0
row2) and #1 nested cascade (nested flex flipped to `row` so the preserved-columns ROW grow
shrinks F1's HEIGHT → grandchild cross/height recompute). weave unit **1381** green; e2e
grid-grow 1 + hug-resize 9 green; tsc/biome clean.
