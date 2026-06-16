# DR-156 — Text-fit post-correction boundary (WI-051 Step 4)

## Metadata

| Field | Value |
|---|---|
| ID | DR-156 |
| Date | 2026-06-16 |
| Owner | hbpark |
| Status | ACCEPTED (live-verified on dev server) |
| Work Item | agocraft [WI-051](../../../agocraft/records/work-items/WI-051-engine-text-measure-seam.md) (engine text measurement); weave commits bc2a1bc · 1a61b68 · dd7342b · 2af437c · 905be77 · 1ce29f8 · c8a6e19 · 0aa9608 · 3d9ecf1 |
| Supersedes | the "Step 4 = remove fitFontScale / estimateTextHeightRatio" plan in DR-064 §migration (reinterpreted here) |

## Context

The text-fit goal (DR-064 / WI-051): the **engine/model owns text box sizing** via
real measurement (Pretext browser measurer, opentype node measurer), and weave's
**view-side post-correction is removed**. With engine measurement now DEFAULT ON
(weave 3d9ecf1) and every content-hug path live-verified (free add, edit re-hug,
paste into flex/grid, reparent into flex/grid/free), Step 4 asked to delete the
remaining view-side post-correction (`fitFontScale` render font-shrink;
`estimateTextHeightRatio` agent add-time height guess).

## Decision — the post-correction is MINIMIZED, not deleted; the boundary is "the box cannot grow"

Step 4's literal "delete both" is **not correct** — each has an irreducible role:

1. **`fitFontScale` (render font-shrink) is now scoped to boxes that CANNOT grow.**
   The `engineHugged` gate (`TextBlock.tsx`) turns it OFF for every AUTO-resize text
   when measurement is on — the model sizes those boxes to content, so a render-time
   shrink would only fight a sub-pixel DOM-vs-measure mismatch (the bug that shrank a
   pasted text on commit — `1ce29f8`). It still fires ONLY for:
   - a **Fixed (NONE)** text whose content overflows its user-fixed box, and
   - a **grid cell** (track-bound) whose content overflows the cell.
   For those, font-shrink is the ONLY way to fit content into a box that can't grow —
   removing it would overflow, not fit.
   **Live-verified (dev server):** an auto-width free text → `transform: none` (no
   shrink); a Fixed text in a too-small box with long text → `transform: matrix(0.3…)`
   (shrinks, as intended).

2. **`estimateTextHeightRatio` (agent add-time height) stays** — it is the agent
   path's pre-paint seed and the choice between `basis:"auto"` (content-auto, which the
   Step 3.5 `reflowMeasuredText` then measures) and the `grow:1` share policy that
   prevents the WI-235 FULL_FRAME→floor collapse. Removing it forces share-only sizing
   (a behavior change) and was not live-verifiable (the agent path needs the Aku/server).

## Consequence / boundary

- **Auto-resize text (free / flex / grid-auto): zero view-side post-correction.** The
  engine/host measures and the box is the content size; nothing post-shrinks it.
- **Box-can't-grow text (Fixed, grid cell): `fitFontScale` is the legitimate, minimal
  fit.** This is the irreducible remainder.
- The only way to drop `fitFontScale` entirely is to **move grid-cell font-shrink into
  the engine** (a measured, doc-written shrink for track-bound cells — the role the
  decommissioned `shrinkFontTarget` once played, but engine-side). Tracked as future
  work, not part of Step 4.

## Follow-up — measured grid-cell font-shrink (started 2026-06-16)

The "move grid-cell font-shrink into measurement" future work is now **underway**, path
by path (so `fitFontScale` can be dropped for grid only once EVERY grid-text path
writes a measured font — otherwise the uncovered paths would overflow):

- **`gridCellFontShrink(measure, spec, cellWPx, cellHPx)`** (`text-measurer.ts`, pure +
  unit-tested) — wraps the text to the cell width, and when the wrapped content height
  overflows the cell height, returns `fontPx × (cellH / contentH)` floored at
  `MIN_GRID_FONT_PX = 11`. The measured, model-written successor to the render-observer
  `shrinkFontTarget`. `gridCellFontShrinkPx` is the flag-gated engine-measurer wrapper.
- **Reparent-into-grid: DONE + live-verified.** `reparentTextHugPatches` (auto-grid
  branch): content overflows the cell → write `fontSizeSpec:{kind:"px"}` (the shrunk px)
  + fill the cell (`justify/alignSelf:"stretch"`); content fits → content-hug at `start`
  (unchanged). Dev-server: a long 40px text reparented into a small cell → font written
  to the doc as 11px (floored), stretch; a short 28px text into a big cell → 28px kept,
  start (no shrink). The shrink is now in the MODEL, not a render transform.
- **Remaining before `fitFontScale` can be dropped for grid:** the add-into-grid,
  paste-into-grid, and **edit (typing in a grid cell)** paths must also write a measured
  font. Until then `fitFontScale` STAYS as the net for those paths (it is a near-no-op on
  a reparented cell whose font is already model-shrunk). Tracked as the next increment.

## Related

- DR-064 (text-measure capability + package split), WI-051 (engine seam → default on).
- DR-152/DR-153 (the decommissioned host measure→engine channel + render shrink-to-fit).
- `text-measurer.ts` (`engineTextMeasureEnabled` default on), `TextBlock.tsx`
  (`engineHugged` gate), `reparent-text-hug.ts`, `free-text-hug.ts`.
