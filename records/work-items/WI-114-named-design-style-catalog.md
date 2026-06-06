# WI-114 — Named design-style catalog (manual pick + content-aware auto)

- **Date:** 2026-06-06 · **Status:** Done · **DR:** DR-079

## Problem

The operator wants a concrete set of named design styles applied to generated designs —
**auto = analyze content & apply the matching style; manual = the user's pick** — with each
style individually selectable (Glassmorphism, Aurora, Bento, Minimalism, Neo Brutalism,
Editorial, Dark UI, Cyberpunk, Material, Card UI, Claymorphism, 3D illustration). The DR-077
abstract tone-axis presets don't capture these named styles well, and its "auto" was random
variety, not content-aware.

## Change (DR-079)

- `features/aku/agent/design-styles.ts` (new) — 12 `DESIGN_STYLES` (recipe + register) in 6
  `STYLE_GROUPS` (use-case); `styleById`, `styleToRegister`, `variationLine` (within-style
  diversity), `composeStyleTask` (manual), `autoStyleDirective` (content-aware auto).
- `use-aku-agent.ts` — pick → `composeStyleTask`; no pick + auto → `autoStyleDirective`;
  `register = style?.register` (auto → omit, server infers).
- `AkuComposer.tsx` — grouped style chips + "자동 (콘텐츠 분석)".
- `aku-settings.ts` — labels: 디자인 스타일 / 자동 스타일 선택.
- **Decommission Sweep:** removed `compose-tone.ts` + `tone-axes.ts` (+ tests) — replaced by
  the design-style API. Register transport (HANDOFF-025) + diversity harness (DR-077 D6) kept.

## Acceptance

- Manual pick injects the style recipe + register; auto asks the agent to match the content to
  a catalog style; within-style variation preserved per request.
- Verify: `design-styles.test.ts` + aku feature **91 tests** + `tsc --noEmit` + `biome` green.
