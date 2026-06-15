# DR-148 — A composition-archetype axis varies macro-structure while auto-layout keeps per-group fit

## Metadata

| Field | Value |
|---|---|
| ID | DR-148 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | Accepted |
| Work Item | [WI-233](../work-items/WI-233-composition-archetype-diversity.md) |
| Scope | weave `features/aku/agent/{composition-archetypes,design-styles,weave-capabilities}.ts` + small-think `packages/design/src/{prompt,profiles}.ts` |
| Related | DR-079 / WI-228 (style palette axis), DR-146 / WI-231 (expression matrix — untouched) |

## Context

Generated designs converge structurally: the layout rules treat auto-flex/auto-grid
as the one correct structure ("REQUIRED, #1 rule", "the default for any multi-item
region"), so every slide is the same stack of full-width bands re-skinned by the
style. But those rules are load-bearing: per-group auto-layout is the fit-safety
guarantee that fixed the WI-149/WI-215/WI-232 overflow/collision family. Relaxing
grid/flex wholesale would reopen that bug class.

## Decision

Separate the two concerns the single rule was conflating:

- **Per-GROUP arrangement = fit-safety.** A cluster of 2+ items stays in an
  auto-layout frame so it cannot overflow/collide. This is KEPT, unchanged.
- **Per-SLIDE macro composition = a diversity axis.** Add a `CompositionArchetype`
  catalog (full-bleed hero, asymmetric split, big-number focal, layered overlap,
  sidebar shell, diagonal flow, etc.) — palette-agnostic STRUCTURE — and rotate one
  per generation through the existing `variationLine` seam, exactly as the 12-style
  catalog rotates palette/effects. The archetype dictates how the GROUPS are
  arranged across the slide (and licenses off-grid moves: overlap, bleed, asymmetry,
  rotation, a single dominating focal element); each group's internal auto-layout
  still guarantees fit.

The absolutist rule prose ("REQUIRED #1", "default for any multi-item region") is
softened in both the client-owned prompts (PRIMER, DOMAIN_KNOWLEDGE) and the
server-owned prompts (DESIGN_RULES, profiles) so nothing contradicts the archetype
directive. The data expression matrix is explicitly left intact (it is about chart
choice / data correctness, not layout).

## Why not the alternatives

- **Just soften the prose** — fastest, but leaves the agent with no positive
  structural vocabulary; it would keep defaulting to the band stack.
- **Broaden absolute/overlap placement** — highest overflow/collision regression
  risk; the fit-safety guarantee is exactly what the band-stack discipline protects.
- The archetype axis gives concrete structural targets WITHOUT surrendering
  per-group fit — the diversity lever with the lowest regression risk.

## Consequences

- A held style now re-rolls a genuinely different MACRO layout each generation, not
  just a recolored band stack.
- The change is prompt-only (probabilistic): effect must be confirmed by live visual
  iteration, and the archetype recipes / weighting tuned from observation.
- Server-side softening (DESIGN_RULES / profiles) requires a small-think
  rebuild+restart to reach the live agent; the weave-side axis + PRIMER/DOMAIN
  softening land on the next weave rebuild.
- `VAR_COMPOSITION` (the four weak adverbs) is decommissioned — its structural-variety
  intent migrated to the archetype axis, its test coverage migrated with it.
