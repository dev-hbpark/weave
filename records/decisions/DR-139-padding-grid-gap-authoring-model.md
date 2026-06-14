# DR-139 — Padding + grid-gap authoring model (px-first, ratio mirror)

## Metadata

| Field | Value |
|---|---|
| ID | DR-139 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Status | ACCEPTED |
| Work item | [WI-219](../work-items/WI-219-padding-grid-gap-authoring-handles.md) |
| Related | DR-design-031, WI-043 P5 (gap-line px authoring), WI-146 |

## Context

On-canvas authoring for a flex/grid frame's **padding** and a grid's **gap** must agree
with WI-043's fixed-px model and not regress the existing track-resize drag.

## Decision

1. **px-first, ratio mirror** — same contract as WI-043 P5's gap line. A drag authors the
   absolute px field (`paddingPx[side]` / `columnGapPx` / `rowGapPx`) directly from the
   design-px pointer delta, and writes a *mirror* ratio (`px ÷ frame current main/cross px`)
   into the legacy `padding`/`columnGap`/`rowGap` so the immediate no-dims reflow is exact.
   On a later container resize the engine reads the px field (WI-043) → the value stays
   **fixed px** instead of scaling with the container. Known limit (DR-056): the ratio
   mirror goes stale after a resize and self-heals on the next edit of that value.

2. **Per-side padding** — each of the 4 edges authors its own side. No linked "set all"
   in v1 (follow-up). Clamp each side to `[0, MAX_PADDING]` (ratio) so a drag can't push
   content off-frame.

3. **Grid gap = dedicated grip, NOT the track line** (user pick, DR-design-031). The
   track-boundary line keeps `resizeGridAxis` (pair-preserving track resize). A separate
   gap grip authors the **uniform** `columnGap`/`rowGap`. factor = `boundaryIndex + 0.5`
   (identical to flex gap) so the grip tracks the cursor 1:1. Rejected: overloading the
   boundary line with an Alt modifier (low discoverability) and toolbar-only (defers the
   on-canvas affordance the WI is about).

4. **Single mutation path** — every drag dispatches `weave.frame.setLayout` (Document
   mutation rule); high-frequency drags collapse to one undo via the existing mergeKey.

5. **Pure helpers** — `setPaddingSide` / `setGridColumnGap` / `setGridRowGap` live in
   `layout-spec-edit.ts` (no DOM), unit-tested; the px field is spread in at the call site
   exactly like P5's `{...setFlexGap(...), gapPx}`.

## Consequences

- No new core spec fields (WI-042/WI-043 already added `paddingPx`/`columnGapPx`/`rowGapPx`).
- No engine change — the px-derivation already consumes these fields.
- a11y gap: no keyboard alternative yet (toolbar numeric input = follow-up WI).
