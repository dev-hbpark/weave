# DR-153 — Grid row auto-fit: grow the grid frame when cells overflow their tracks

## Metadata

| Field | Value |
|---|---|
| ID | DR-153 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | ACCEPTED (live verification pending) |
| Work Item | [WI-238](../work-items/WI-238-grid-row-autofit.md) |
| Scope | weave `TextBlock` (grid cell measure) + `text-autofit-context` + `DesignPage` (grow grid frame). weave-only. |
| Builds on | WI-237/DR-152 (flex text auto-fit, default ON) — this is the grid sibling |

## Context / problem

WI-237 auto-fits flex/absolute text by correcting the text's own `frame.height`. For
GRID cells that does nothing: a grid CHILD's height is governed by its **row track**,
not its frame — so flex auto-fit SKIPS grid children. The 27-row price table clipped
because the grid frame was too short and the `fr` tracks squeezed each row below its
cell text (live: cells 14px box vs 18px need).

## Decision (rev 2 — render-level shrink-to-fit, box untouched)

Operator's precise ask: "if the text's bound + font exceed the cell/grid height, fit
it in" and "don't shrink the BOX too small — let it fill the flex/cell height, just
shrink the font." So auto-fit is now **purely render-level** in TextBlock and does
NOT touch the doc/box at all:
- `fitFontScale(boxH, naturalH, boxW, naturalW, minScale)` → CSS `transform: scale`
  on the content (full-font layout, so the measured size stays natural → loop-free,
  deterministic). The BOX is untouched (keeps filling its cell/slot); only the font
  visually shrinks to fit. Floored at `MIN_FIT_FONT_PX`. Works for grid AND flex AND
  present mode (no provider / no doc write / no undo / no save). 80ms settle debounce.
- The earlier doc-write paths (grow the flex box / grow the grid frame / shrink the
  grid fontSizeSpec via the provider) are SUPERSEDED — they shrank the box too small
  and were timing-flaky. The TextFitProvider is now dormant (cleanup pending).

## Decision (rev 1 — superseded)

**Revised**: the grow-the-grid-frame approach (below) under-fit (gap/padding + fr
distribution + cap) and was timing-flaky. Operator's call for #1: a grid cell that
overflows its track simply **SHRINKS its own font to fit** (keeps the table compact,
never overflows the slide). Routing still happens in the provider by REAL parent
layout: `auto-grid` parent → `shrinkFontTarget(currentFontPx, boxPx, contentPx)`
(scale font down by the overflow, floored at MIN_FIT_FONT_PX, never up) → write
`fontSizeSpec` on the cell; non-grid → grow the box (WI-237). Plus a **120ms settle
debounce** on the DOM measurement (in TextBlock) so it acts on the QUIESCED layout,
not transient mid-reflow frames — fixing the run-to-run non-determinism on reparent.

### (superseded) original grow approach

A grid cell that overflows its track asks the engine to **grow the GRID FRAME**
(so the tracks get room), not to resize the cell:

1. **Measure (TextBlock, grid child)** — instead of skipping, a grid-cell text
   measures `overflowRatio = contentPx / cellBoxPx`; when > 1+threshold it reports
   `requestGridFit(cellItemId, overflowRatio)`.
2. **Resolve + aggregate (DesignPage provider)** — from `cellItemId` find the parent
   grid frame in the doc (`findParentAndIndex`); coalesce per grid frame, keeping the
   MAX overflow ratio among its cells (rAF, last-wins).
3. **Grow (one runBatch)** — set the grid frame `frame.height = currentHeight ×
   maxRatio`, **capped** so it can't blow past its own parent (≤ a sane fraction) —
   the `fr` tracks then redistribute the taller frame and the worst cell just fits.
   Convergent: after the grow, `contentPx ≤ cellBoxPx` ⇒ ratio ≤ 1 ⇒ no more requests.

## Cap / trade-off

Growing is capped (won't push the grid frame off its parent / the slide). So a table
whose content genuinely exceeds the available area still clips the remainder — that
is a "too much content for the space" case for the LATER font shrink-to-fit, not
something row-growth can solve without overflowing the slide. Capped growth is the
safe default (no surprise slide overflow); the common "frame a bit too short" case is
fixed fully.

## Consequences

- Reuses WI-237's channel/coalesce machinery + the same flag
  (`localStorage["weave.textAutofit"]!=="off"`, default ON) and `runBatch` (one undo
  entry / save per settle). weave-only, no engine change, no re-vendor.
- Convergent + capped + the per-cell `MAX_REFIT_ATTEMPTS` backstop → no thrash.
- **Live verification required**: regenerate a dense table; rows should grow to fit
  (no clip) without the table overflowing the slide or oscillating.

## Related

- WI-237/DR-152 (flex text auto-fit) — the mechanism this extends.
- (Later) font shrink-to-fit for genuinely over-capacity fixed cells; HANDOFF-026
  (zero-undo system origin).
