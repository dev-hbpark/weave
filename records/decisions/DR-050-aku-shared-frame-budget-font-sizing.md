# DR-050 — Aku: shared-frame font-size budget (size text against its own share, not the whole frame)

- **Date:** 2026-06-03 · **Status:** Accepted
- **Relates:** DR-040 (text auto-height + fit the font), DR-038/DR-041 (text placement / wrap), DR-049 (relax frame mandate)
- **Host counterpart:** small-think **DR-030** (design-agent prompt + critique)

## Context

The agent sizes text whose font overflows its layout. The advertised `fontSizeSpec` ratio is
a fraction of the **immediate parent frame's height**; when multiple items share a frame
(title + subtitle + body in a column, a stat card, etc.) each item gets only part of that
height. The capability text told the agent to size to the parent frame and even said "a
heading that should FILL a small card needs a LARGER ratio" — which the agent read as
licence to size every text to fill its frame, ignoring siblings + gaps + padding. The
renderer has no auto-fit (TextBlock applies the ratio verbatim), so the stack overflows.

## Decision

Teach the **shared-frame budget** in the advertised capabilities and reframe the ratio as a
unit conversion, not a fill cue:

- Items in one frame SHARE its height (minus padding and the gaps between them); a text does
  NOT own the whole frame.
- Budget: `usable height = parent frame px height − padding − Σ gaps`; size each text against
  its OWN share; keep Σ(children heights ≈ fontSize × lineHeight × line-count) + gaps within
  the usable height with margin (stack + gaps ≤ ~85%).
- Anchor to px role targets (heading ~5–7% of CANVAS height, body ~3%); ratio = target px ÷
  parent-frame px height, never a cue to fill. Roles (~0.06–0.09 heading, ~0.04 subheading,
  ~0.03 body of a slide-height parent) are per-text targets.

## Scope (edits)

- `apps/web/src/features/aku/agent/weave-capabilities.ts`
  - `text` itemKind SIZING — added the SHARED-FRAME BUDGET; reframed roles as per-text targets
    + the ratio as a unit conversion (not "fill"); kept "size DOWN if it would overflow".
  - `WEAVE_DOMAIN_KNOWLEDGE` rule 2 — softened "a heading that should FILL a small card needs a
    LARGER ratio" → "a heading ALONE in a small card …"; inserted the shared-frame budget +
    px-anchor guidance.

No renderer change. This is advertised-capability prompt text consumed by the small-think
design agent's cached prompt.

## Consequences

- The dominant overflow mode (one text sized to fill a frame it shares) is named and budgeted.
- Pairs with DR-049: with fewer wrapper frames, texts more often share a region directly — the
  exact case the budget governs.
