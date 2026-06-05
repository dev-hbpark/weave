# DR-069 — Keep the focus (눈) button on excluded group thumbnails

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-100
- **Relates:** WI-039 (focus eye / dim-isolate on slide tiles), WI-072 (deck
  membership toggle = bottom-right DeckGlyph → `attrs.presentable`), DR-061 (lock)
- **Operator directive (2026-06-06):** the bottom-right thumbnail icon should be a
  button that includes/excludes a slide; AND excluded *group* thumbnails should
  still carry the eye button so editing convenience is retained.

## Context

`ThumbnailPanel` has two per-tile controls:
- **bottom-right DeckGlyph** → include/exclude from the deck (`onToggleSlide` →
  `attrs.presentable`), present on both slide tiles AND group tiles, already wired
  via `toggleFrameSlide` in DesignPage (WI-072). The operator's first ask is
  already satisfied — no behavior change needed there.
- **focus eye** (`FocusGlyph`, off → dim → isolate) for editing convenience —
  rendered ONLY on slide tiles. Group (excluded) tiles had NO eye, so a frame
  dropped out of the deck lost its dim/isolate affordance. That is the gap.

## Decision

Render the same focus-eye button on group (non-slide) tiles. Design System Triage
= **reuse**: the identical control (button + `FocusGlyph` + `handleToggleClick` /
`handleToggleKey` + `ariaPressedFor` / `nextStageLabel`) is reused inside the group
tile's preview slot — no new primitive / token / theme, so no design review needed.

- Group tiles now compute `isFocused` / `tileStage` / `isDisabled` like slide
  tiles, render the focus button (pointer-events-auto over the pointer-events-none
  preview), and show the stage inset glow on the preview when focused.
- The bottom-right deck-membership button is unchanged (already include/exclude on
  both sections).

## Consequences

- (+) An excluded frame stays fully editable from the panel — dim/isolate focus
  works on group tiles exactly as on slide tiles.
- (+) Pure UI reuse; no model/command change.
- (−) Two-control footprint now on group tiles too (eye + deck button) — consistent
  with slide tiles, acceptable.

## Verification (SVL gate)

`@weave/web` typecheck clean; biome clean on changed files. New e2e in
`thumbnail-panel.spec.ts` (exclude a slide → it moves to the group section → the
group tile's focus eye still cycles to stage 1 → re-include via the deck button).
e2e runs in CI (no browser locally).
