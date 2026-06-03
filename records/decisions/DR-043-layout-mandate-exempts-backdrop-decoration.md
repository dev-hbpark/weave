# DR-043 — AKU agent: layout mandate governs CONTENT only; backdrops & decoration exempt

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (clarification, no WI)
- **Relates:** DR-041 (nested-layout mandate / rule 0 — this scopes it), DR-042 (visual richness — removes the conflict that suppressed it), small-think **DR-026** (host-agnostic counterpart)

## Context

Audit (user): is the forced nested-layout structure blocking graphic elements (image, chart,
video, shape, background colour)? It was. `WEAVE_DOMAIN_KNOWLEDGE` rule 0 forbade dropping
"text / images / shapes" on the slide root with absolute x/y — which directly contradicts rule
5's "IMAGE AS BACKGROUND" (a kind:'image' at {0,0,1,1} + sendToBack) and the VISUAL TREATMENT
push for backdrops and bleeding accent shapes (DR-042). The blanket prohibition, stated as a
hard requirement, dominated and suppressed those graphics.

## Decision

Reword rule 0 so the mandate applies to **CONTENT** and add an explicit, ENCOURAGED backdrop /
decoration exception:

- Content (text, content images, data, cards) goes through the nested layout frames.
- BACKDROP / DECORATION layers use absolute / overlay placement freely (and are encouraged): a
  slide/frame background fill; a full-bleed or background IMAGE / VIDEO at {0,0,1,1} sent to the
  back; accent SHAPES / lines layered behind/over content or bleeding off an edge — often
  directly on the slide root.
- Absolute placement of CONTENT itself stays reserved for deliberate free-form composition.

## Scope (edits)

`apps/web/src/features/aku/agent/weave-capabilities.ts`:
- `WEAVE_DOMAIN_KNOWLEDGE` rule 0 — "DO NOT drop text/images/shapes on the slide root" reworded
  to CONTENT-only + backdrop/decoration carve-out.
- rule 5 "IMAGE AS BACKGROUND" — tied to the rule-0 exception (a background image is not
  hand-placed content; place absolutely + sendToBack, layout frames on top).

Prompt text only; recursive typecheck green. Counterpart: small-think DR-026.

## Consequences

- Rule 0 (structure) and rule 5 / DR-042 (visual richness) no longer contradict.
- The agent can add full-bleed/background images & video, background fills, and layered/bleeding
  accent graphics without tripping the layout mandate.
