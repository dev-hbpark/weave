# WI-149 — Flex-row text squished into a vertical 1-char strip

**Status:** DONE
**Date:** 2026-06-08
**Related:** DR-103 (this), DR-101 (px-fixed font), DR-098 (fixed text box), small-think DR-052 (server guidance)

## Problem

Agent-generated slides occasionally render a text item as a tall, ~1-character-wide
**vertical strip** of stacked glyphs (one glyph per line) — observed on a hovered
middle layout region. Console scan of the offending item:

```
"148건 TIMEOUT Unkno…"  w: 0.009  h: 0.76  ratio: 0.01
parentLayout: "auto-flex"  dir: "row"  lc: "auto-flex"
```

## Root cause

Two compounding factors:

1. **Placement (agent):** the text was added as a **direct child of a flex ROW**.
   In a row the MAIN axis is the width, so flex shrank the text to a sliver
   (`w ≈ 0.009`, ≈1ch) as it competed with its siblings for main-axis width.
2. **Render (weave):** `TextBlock` set `word-break: break-word`, which lets text
   shatter **character-by-character**. A 1ch box therefore wrapped to one glyph
   per line → a vertical strip, and the auto-height observer then grew the box to
   `h = 0.76` to fit the tall stack.

## Fix

- **A — render guard (deterministic, fixes existing + future slides):**
  `TextBlock` now uses `word-break: keep-all` + `overflow-wrap: break-word`.
  Korean 어절 / words stay intact (Korean wraps at spaces — its natural break),
  so a too-narrow box overflows/clips ONE line instead of stacking vertically;
  a genuinely unbreakable long token (a URL) still breaks only when it would
  overflow. A slivered box now stays one line tall, so auto-height no longer
  inflates it. See DR-103.
- **B — placement guidance (prevents the bad layout at the source):**
  - weave `weave-capabilities.ts` PLACEMENT & SIZING: explicit "NEVER place
    wrapping body text as a direct child of a flex ROW … wrap each side in its
    own flex-COLUMN sub-frame or a grid cell."
  - small-think Layout-architect lens (DR-052): general principle that a text
    rendered as a 1–2-char vertical ribbon is ALWAYS a defect — bind wrapping
    text's width to its cell, never leave it bare in a row.

## Verify

- `biome check` TextBlock — clean.
- `@weave/web` typecheck — clean.
- Unit: `weave-capabilities.coverage` (10) + `agent-text-resize` (7) — pass.
- small-think `@small-think/design` typecheck + test (93) — pass.
