# DR-103 — Text breaks at word boundaries (`keep-all`), not mid-character

**Status:** ACCEPTED
**Date:** 2026-06-08
**Work item:** WI-149
**Supersedes:** none

## Context

`TextBlock` rendered non-auto-width text with `word-break: break-word`, which
permits breaking **anywhere**, including between characters. When a flex ROW
shrinks a text child to a sliver (≈1ch, because the row's main axis is the
width), `break-word` wraps the content one glyph per line — a tall vertical
strip — and auto-height then grows the box to fit it. (WI-149.)

## Decision

Render wrapping text with **`word-break: keep-all` + `overflow-wrap: break-word`**:

- `keep-all` — never break **between** characters. Korean wraps at spaces
  (between 어절), Latin at spaces — the natural, readable break. A box too narrow
  to fit a word lets the word overflow/clip on ONE line rather than stacking
  vertically.
- `overflow-wrap: break-word` — a single token with no break opportunity (a long
  URL) still breaks, but only when it would otherwise overflow.

This is a pure render-layer guard: it makes the squish impossible regardless of
how the box got narrow, so it repairs **already-generated** slides and future
ones alike, independent of agent/layout guidance (which is the WI-149 fix B
companion).

## Consequences

- A slivered box now stays one line tall → auto-height no longer inflates it.
- Korean line-breaking is *improved* (space-based wrapping is more natural than
  the previous syllable-level breaking).
- Trade-off: a very long unspaced Latin run in a narrow box can overflow one
  line before `overflow-wrap` triggers — acceptable and far better than a
  vertical strip; the layout-side guidance (capabilities + small-think DR-052)
  keeps wrapping text out of width-starved rows in the first place.

## Verify

`biome` + `@weave/web` typecheck clean; `weave-capabilities.coverage` +
`agent-text-resize` unit suites pass.
