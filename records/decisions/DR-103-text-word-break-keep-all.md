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

## Root cause (engine)

Confirmed in `@agocraft/layout` `auto-flex.js` `resolveMainSizes`: when a row
overflows, each child is shrunk by `Math.max(0, b + delta)` — the shrink floor
is **0**, not the child's `min-content` size. CSS flexbox floors a flex item at
its min-content width (`min-width: auto`); agocraft is geometry-only and has **no
text measurement**, so it cannot compute a text min-content and shrinks the text
toward zero → the observed `w ≈ 0.009` sliver. The per-child policy is only
`{grow, shrink, basis}` (no `min`), so the engine cannot be given a floor either.

This decision is therefore a **render-side legibility floor**, not the systemic
fix. The systemic fix is keeping wrapping text out of starved flex rows: agent
guidance in `weave-capabilities.ts` + small-think Layout-architect lens (DR-052),
and/or a `shrink: 0` default for text flex children (deferred — see Consequences).

## Decision

Render wrapping text with **`word-break: keep-all` + `overflow-wrap: normal`**
(NO `break-word`):

- `keep-all` — never break **between** characters; CJK runs / Korean 어절 stay
  whole, wrapping happens only at real break opportunities (spaces).
- `overflow-wrap: normal` — **first attempt set `break-word`, which FAILED**: in a
  box narrower than one glyph it force-broke every word at the overflow point →
  one glyph per line → the illegible vertical ribbon the bug reported. Dropping it
  means a word too wide for the box overflows that word **horizontally on one
  line** (legible) instead of shattering vertically.

This is a pure render-layer guard: it makes the squish impossible regardless of
how the box got narrow, so it repairs **already-generated** slides and future
ones alike, independent of agent/layout guidance (which is the WI-149 fix B
companion).

## Consequences

- A slivered box now stays one line tall → auto-height no longer inflates it.
- Korean line-breaking is *improved* (space-based wrapping is more natural than
  the previous syllable-level breaking).
- Trade-off: a genuinely unbreakable long token (a spaceless URL) now overflows
  horizontally rather than breaking — rare, and far better than a glyph ribbon.
- This is a legibility FLOOR, not a cure: an over-full flex row still produces a
  tall word-per-line stack that can overflow neighbours. The real fix is the
  agent not building text bare in a starved row (capabilities + DR-052).
- DEFERRED — a `shrink: 0` default for text flex children (CSS `flex-shrink:0`)
  would stop the engine starving text, but it converts starvation into row
  overflow (text keeps width, spills off-canvas) and risks regressing slides
  that currently shrink text acceptably; it does not save an over-full row
  either. Not adopted without live agent-server reproduction.

## Verify

`biome` + `@weave/web` typecheck clean; `weave-capabilities.coverage` +
`agent-text-resize` unit suites pass.
