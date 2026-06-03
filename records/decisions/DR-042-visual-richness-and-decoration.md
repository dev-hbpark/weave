# DR-042 — AKU agent: forced visual richness (frame backgrounds, accents, chart/shape/image/video)

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (rule change, no WI)
- **Relates:** DR-040 (concision — this is the visual counterweight), small-think **DR-025** (host-agnostic counterpart)

## Context

Agent-built decks read as plain text on bare slides: grouping frames left transparent, slide
backgrounds bare default white, and the visual vocabulary (charts, images, video, shapes,
colour panels, accent graphics) underused. The frame BACKGROUND/FILL capability was documented
but only descriptively, so the agent rarely used it. Must not undo DR-040 concision — richness
is visual polish, never more text.

## Decision

Force visual richness in the agent guidance while keeping concision:

- **Frame backgrounds (active):** `BACKGROUND/FILL` bullet rewritten — a slide should NOT sit
  on bare default white and grouping frames should NOT be transparent; give the slide a base
  fill and section/group/card frames their own colour panel / tonal band / card surface
  (`decoration.fill` + `cornerRadius` + soft `decoration.shadow`).
- **Visual treatment (required) in rule 5:** new bullet — ground content on designed surfaces +
  accent graphics from shapes/lines; a plain text-on-blank slide is a defect. Restraint: every
  graphic earns its place, contrast ≥ AA, consistent across slides, focal point dominant; not a
  licence to add text.
- **Full vocabulary incl. charts:** rule 5 MEDIA bullet now leads with `kind:'chart'` (via
  `weave.chart.add`) for quantitative data, alongside image/video/shape/qr.
- **Primer:** new "VISUAL RICHNESS" reminder bullet (per-turn recency).

## Scope (edits)

`apps/web/src/features/aku/agent/weave-capabilities.ts`:
- frame itemKind `BACKGROUND/FILL` bullet → active.
- `WEAVE_DOMAIN_KNOWLEDGE` rule 5 — MEDIA bullet adds chart; new VISUAL TREATMENT bullet.
- `WEAVE_TASK_PRIMER` — new visual-richness bullet.

Prompt text only; recursive typecheck green. Counterpart: small-think DR-025 (which also adds a
visual-richness lens to the final review stage, DR-024).

## Consequences

- Decks get designed surfaces, accents, and the right media — higher visual satisfaction.
- Concision preserved (richness is visual, never extra text; subordinate to the focal point).
