# WI-233 — Generated designs converge: everything forced into grid/flex looks alike

## Metadata

| Field | Value |
|---|---|
| ID | WI-233 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | **DONE (code + unit green); needs small-think server rebuild+restart for the server-side rule softening to take effect live** |
| Type | Agent generation quality (design diversity) |
| Decision | [DR-148](../decisions/DR-148-composition-archetype-axis.md) |
| Related | WI-228 (style/palette diversity), WI-231/DR-146 (table interpretation) |

## Problem (reported)

Operator: "그리드와 플렉스를 사용해서 디자인하는 규칙을 완화해야 할 것 같아. 모든 걸 해당
레이아웃으로 넣으려다 보니 디자인이 모두 비슷해져." Every generated design comes out
looking similar because the agent funnels everything into auto-flex/auto-grid frames.

## Root cause

The convergence is **structural (macro-layout) monotony**, not a palette problem
(WI-228 already varies palette/effects per style). The layout rules present
auto-layout as the single correct structure and offer NO vocabulary for varying
the macro composition:

- `prompt.ts` DESIGN_RULES — "this is the **default** for any multi-item region".
- `weave-capabilities.ts` WEAVE_TASK_PRIMER — "STRUCTURE EVERY SLIDE FROM NESTED
  LAYOUT FRAMES — **REQUIRED**, the **#1 rule** to get wrong".
- `profiles.ts` GENERAL_PRINCIPLES / GENERAL_EDITOR_PLAYBOOK — "the DEFAULT for any
  multi-item placement".
- The per-request variation engine (`design-styles.ts`) rotated only four weak
  ADVERBS (비대칭/중앙/그리드/대각선) that never translate into real topology.

Net: every slide becomes the same stack of full-width bands (header → body →
columns → stat-row), re-skinned by the style. The auto-layout rules exist for a
real reason — fit-safety (the WI-149/WI-215/WI-232 overflow/collision bug family) —
so the fix must KEEP per-group fit-safety while opening macro-structure.

## Decision (chosen by operator)

1. **Add a structural diversity axis** (composition archetypes), sibling to the
   12-style palette axis — NOT just soften prose, NOT broaden absolute placement.
2. **Leave the expression matrix** (trend→line / comparison→bar …) untouched — it
   serves data correctness, not layout.

## Change

**weave (client-controlled — effective on weave rebuild):**
- NEW `composition-archetypes.ts` — a catalog of 10 palette-agnostic MACRO
  compositions (full-bleed hero, asymmetric split, editorial columns, big-number
  focal, layered overlap, sidebar shell, diagonal flow, bento mosaic, centered
  stage, full-canvas diagram) + a seeded picker that rotates every generation +
  `composeArchetypeDirective(seed)` that names the archetype and restates the
  fit-safety boundary (groups stay in auto-layout; the archetype only shapes the
  whole slide; palette/effects stay owned by the style spec).
- `design-styles.ts` — `variationLine` now rides the archetype axis instead of the
  four weak adverbs (decommission sweep of `VAR_COMPOSITION`). Both the picked-style
  (`composeStyleTask`) and auto-style (`autoStyleDirective`) paths get it for free
  via the shared `variationLine` seam.
- `weave-capabilities.ts` — softened PRIMER ("REQUIRED #1") and DOMAIN_KNOWLEDGE §0:
  auto-layout reframed as per-GROUP fit-safety, NOT a mandate that every slide be a
  uniform band stack; explicit "VARY THE MACRO COMPOSITION" guidance with the
  archetype vocabulary.

**small-think (server-controlled — needs server rebuild+restart):**
- `prompt.ts` DESIGN_RULES + `profiles.ts` GENERAL_PRINCIPLES (9) + EDITOR_PLAYBOOK
  (3) — same softening so the cached server rules don't contradict the per-task
  archetype directive.

## Tests

- NEW `composition-archetypes.test.ts` (6) — catalog shape, palette-agnostic
  (no literal hex in recipes), per-seed rotation cycles the whole catalog, directive
  preserves the fit-safety + palette-ownership boundary.
- `design-styles.test.ts` (+1) — `variationLine` carries the macro archetype axis.
- All green: weave aku-agent suite 304, small-think design 113.

## Remaining / live verification

- **small-think rebuild+restart** for the server-side softening (DESIGN_RULES /
  profiles) to reach the live agent; weave-side archetype axis + PRIMER/DOMAIN
  softening reach it on the next weave rebuild.
- **Live visual check** — generate the same content several times and confirm the
  macro structure genuinely varies (and that per-group fit still holds: no overflow/
  collision regression from the relaxed framing). The prompt-only nature means
  effect is probabilistic; tune the archetype recipes / weighting after observing.
