# DR-079 — Named design-style catalog (recipe-based) replaces the abstract tone presets; content-aware auto

- **Date:** 2026-06-06 · **Status:** Accepted (D1 picker-exposure partially superseded by DR-085) · **WI:** WI-114
- **Superseded (부분, 2026-06-07):** DR-085가 D1의 "각 스타일을 **개별 선택**" 노출을 카테고리 선택
  + 내부 seed-랜덤 스타일로 대체. 카탈로그·recipe·register·자동 디렉티브·variation은 DR-085에서도 유지.
- **Supersedes:** DR-077 (axis registry + abstract tone presets) for the PICKER path — the
  axis-decomposition (`tone-axes.ts`) + tone presets (`compose-tone.ts`) are retired. The
  register transport (DR-077 HANDOFF-025 → small-think DR-043) and the diversity harness
  (DR-077 D6, `features/aku/diversity/`) are kept and reused.
- **Relates:** small-think DR-043 (register restraint policy), `@small-think/client`
  SubmitOptions.register, 루트 CLAUDE.md (Decommission Sweep)
- **Operator directive (2026-06-06):** 다음 디자인 스타일들을 적절히 적용하고 싶다 — **자동일 때는
  내용을 분석해 적용, 수동이면 사용자가 고른 대로**. 예시는 두 개씩 묶여 있지만 **각각 선택**하고 싶다:
  Glassmorphism / Aurora(AI·금융·미래), Bento / Minimalism(SaaS), Neo Brutalism / Editorial(브랜드),
  Dark UI / Cyberpunk(개발·게임·보안), Material / Card UI(관리·생산성), Claymorphism / 3D illustration(교육·키즈·온보딩).
- **Operator choice (2026-06-06):** 기존 톤 피커를 이 12 스타일로 **교체**(자동은 콘텐츠-aware로 업그레이드).

## Context

DR-077 modelled the picker as ABSTRACT tone presets (editorial/bold/minimal/…) decomposed
into 5 axes (palette × typography × layout × decor × shape). The operator wants a concrete,
contemporary **named-style** vocabulary instead. These named styles are holistic visual
languages — glassmorphism's frosted blur, cyberpunk's neon glow, claymorphism's puffy 3D —
that **lose fidelity when forced through the 5 abstract axes**. And "자동" must mean
**content-aware selection** (analyze the content → apply the matching style), not the random
axis-rotation DR-077 used.

## Decision

### D1 — Recipe-based style catalog (`design-styles.ts`).
12 `DESIGN_STYLES`, each a self-contained `{ id, label, groupId, recipe, register }`. The
`recipe` is the visual-language directive (palette/effects/typography/layout) injected as the
`[디자인 스타일]` block — NOT decomposed into axes. 6 `STYLE_GROUPS` carry the use-case the
group fits (the auto-match mapping); each group holds the operator's two styles, **individually
selectable**.

### D2 — Manual = picked style; Auto = content-aware.
- A user pick → `composeStyleTask(style, seed)` = `[디자인 스타일] recipe + commit-tail + variation`.
- No pick + auto on → `autoStyleDirective(seed)` tells the agent to **analyze the content's
  domain/audience and choose the best-fit style from the catalog** (listed by use-case), then
  commit and name its choice. Off / no pick + auto off → no style block.

### D3 — Within-style diversity preserved (`variationLine`).
A per-request variation block rotates **style-safe** knobs (composition / density / emphasis)
by the variation seed — NEVER palette or effects (the style's signature). Paired with the
existing per-request temperature jitter (DR-077 D3). So the SAME style differs run-to-run and
on regenerate without losing identity. (The DR-077 axis-sampling D4 anti-convergence is dropped
with the axes; seed rotation + jitter cover within-style variation.)

### D4 — Register transport reused (`styleToRegister`).
Each style maps to a small-think `register` (DR-043). A manual pick sends it via the submit
option (HANDOFF-025 path) so the server conditions its restraint. In AUTO mode the agent picks
the style, so weave can't know the register ahead → omit it and let the server infer from
content (consistent: the server reads the content too).

### D5 — Decommission Sweep.
`compose-tone.ts` (+ test) and `tone-axes.ts` (+ test) are removed; `presetToRegister`/
`resolveTonePicks`/`composeToneTask`/`TONE_PRESETS` are replaced by the design-style API.
`AkuComposer` renders grouped style chips; `aku-settings` labels move from "디자인 톤" to
"디자인 스타일" / "자동 스타일 선택". The diversity harness + register transport are untouched.

## Consequences

- (+) Named styles render with full fidelity (recipe, not lossy axes); the operator's exact
  catalog is selectable individually + grouped by use-case.
- (+) Auto is genuinely content-aware (agent matches style to content), matching the directive.
- (+) Within-style diversity retained (seed-rotated style-safe knobs + temperature jitter);
  register restraint still flows to small-think for manual picks.
- (+) Net simpler than DR-077's axis machinery (one flat catalog vs axes + presets + pins).
- (−) Loses DR-077's axis-product ceiling + D4 axis anti-convergence — acceptable: these styles
  are holistic recipes, and within-style variation is handled by the variation block.
- (−) Auto-mode register is server-inferred (weave doesn't know the agent's pick) — fine, the
  server reads content anyway.
- (−) Style fidelity in the final render is model-dependent (the recipe steers; the agent +
  small-think harness execute). The catalog/auto-directive are best-effort prompts.

## Verification

- `design-styles.test.ts`: 12 styles (unique ids, valid group/register, operator's exact set),
  6 groups × 2 styles, `styleById`/`styleToRegister` coverage, `variationLine` determinism +
  rotation, `composeStyleTask` (recipe + tail + variation), `autoStyleDirective` (lists every
  use-case + style label). aku feature **91 tests** + `tsc --noEmit` + `biome` green.
- Full-turn style fidelity is model-dependent → measure with the DR-077 D6 diversity harness on
  collected outputs.
