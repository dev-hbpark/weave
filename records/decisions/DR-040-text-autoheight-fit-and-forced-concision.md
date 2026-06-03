# DR-040 — AKU agent: text is auto-height + fit the font + force concision

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (rule change, no WI)
- **Relates:** DR-039 (cell-fill — **reverses its text-fill stance**), DR-038 (text placement), small-think **DR-022** (host-agnostic counterpart)

## Context

DR-039 told the agent to make every layout child FILL its cell (stretch/grow). For text that
produced stretched boxes + oversized fonts — content too big for the layout — and slides that
read like documents (long explanatory prose). User direction (2026-06-03): text back to
auto-height; fit the font to the layout; force one-point-per-slide concision and emphasis.

weave mechanics support this: a text item that is an auto-flex/auto-grid child is parent-driven
for width; with no `grow` and a non-`stretch` cross/`auto` track, its height fits content
(auto-height). `'stretch'`/`grow` remain valid for frames, backgrounds, and equal regions.

## Decision

1. **Text is AUTO-HEIGHT** — the frame sets WIDTH + position, the content sets HEIGHT. No
   `grow`/vertical-`stretch` on text, no pinned height; spare room handled by the frame's
   `justify`/`align`/`gap`/`padding`. Equal regions sized via FRAME tracks/grow, not leaf text.
2. **Fit the font** — pick the `fontSizeSpec` ratio so text sits inside its region with margin;
   if it crowds/overflows, size DOWN and cut copy, never oversize.
3. **Force concision/emphasis** — one point per slide, SHOWN not explained; key message/number
   is the visual hero; cut explanatory prose.

Prompt-rule change only; no editor/runtime change; no deterministic gate.

## Scope (edits)

`apps/web/src/features/aku/agent/weave-capabilities.ts`:
- `text` itemKind PLACEMENT bullet — fill → auto-height + fit-font.
- `text` SIZING bullet — added "the size must FIT (size down / cut copy, never oversize)".
- `WEAVE_DOMAIN_KNOWLEDGE` rule 3 — retitled "TEXT IS AUTO-HEIGHT — THE LAYOUT SETS WIDTH, THE
  CONTENT SETS HEIGHT"; tables-are-grids (rule 0) unchanged.
- `WEAVE_TASK_PRIMER` — table bullet → text-auto-height; new forced "ONE point per slide, SHOWN
  not explained + fit the font" bullet.

`apps/web/src/features/aku/agent/weave-command-schemas.ts`:
- `LAYOUT_SPEC` / `LAYOUT_CHILD_POLICY` — `stretch`/`grow` kept as fill mechanisms but caveated
  "for TEXT prefer non-stretch / auto-height; use stretch/grow on frames, backgrounds, equal
  regions".

## Consequences

- Text follows content height; fonts are sized to fit, not stretched/oversized.
- Slides pushed toward one focused point with cut prose.
- Supersedes DR-039's *text*-fill rule (its tables-are-grids and frame-level fill stand).
  DR-038/DR-039 carry "Refined by DR-040" pointers.
