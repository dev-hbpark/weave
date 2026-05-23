# Work Item — WI-002

## Metadata

| Field | Value |
|---|---|
| ID | WI-002 |
| Title | Design system foundation — Aurora premium glass+gradient tone + 3 theme variant + 3-layer token |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 (모든 후속 UI 작업의 base) |
| Created | 2026-05-22 |
| Target date | 2026-06-12 (M0 안에 1차 완성) |
| Closed | — |

## Summary

weave 의 시각 정체성 + 모든 후속 UI 의 base 가 될 design system 의 1 차 구축. 사용자 결정 (2026-05-22): **Aurora premium glass + gradient 톤** (Stripe + Apple 의 합), 3 theme variant (Aurora 기본 / Mono Linear-grade / Vivid 가장 톡톡), 3-layer token (base / semantic / component), 인터랙티브 motion 풍부 (aurora bg 자체 움직임 + micro-interaction).

## Scope

### In scope (이 WI 의 outcome)

1. **DR-007 발행** — Tailwind v4 (`@theme` directive) + Radix UI primitives + `motion` lib + View Transitions API + a11y 의무. Accepted.
2. **features/design-system/ folder** — 첫 도메인 feature. README + token CSS + theme switcher + 기본 컴포넌트 (Button / Card / TextField / Toggle / ThemeSwitcher).
3. **3-layer token system**:
   - **base** — color palette / spacing scale / radius / shadow / motion easing / typography scale
   - **semantic** — background / text / accent / surface / border / focus-ring / aurora-stops
   - **component** — button / card / input / toggle 의 도메인 별 token
4. **3 theme variant** — Aurora (default, premium glass), Mono (Linear-grade 진중), Vivid (가장 톡톡)
5. **Aurora background animation** — slow gradient drift (CSS animation, prefers-reduced-motion 의무 OFF)
6. **Theme switcher UI** — top-right pill, click → smooth transition (View Transitions API)
7. **`App.tsx` 재구성** — design system 의 first showcase. Hero + status section + next milestones, glass card + button + theme switcher 모두 의도된 톤으로.

### Out of scope (별도 WI)

- Per-workspace theme override (M2+, multi-tenant + brand 결정 후)
- Theme builder (사용자가 색 직접 선택) — M5+
- Component library 의 full 갯수 (Modal / Toast / DataTable / etc.) — incremental 추가 per feature
- 다국어 (i18n) typography fallback — M2+
- Token RTL 지원 — M2+ enterprise 진입 시
- agocraft 의 StyleProvider tokens 와 weave 의 design tokens 의 connection — PRODUCTION_BACKLOG 박제 또는 별도 WI

### 명시적 deferred

- 컴포넌트 storybook — M2+ component 가 충분히 쌓이면.
- visual regression baseline (Chromatic / playwright pixel) — M1+ playwright 셋업 후.
- design token export to Figma — collab tool 도입 시.

## Acceptance criteria

- [ ] `records/work-items/WI-002-design-system-foundation.md` (이 파일) Status=Done.
- [ ] `records/decisions/DR-007-design-system-tooling.md` Accepted.
- [ ] `features/design-system/README.md` 의 token / theme / 컴포넌트 가이드 + visual contract.
- [ ] `apps/web/src/design-system/tokens.css` 의 3 theme variant 박제 (CSS variables).
- [ ] `apps/web/src/design-system/components/` 의 최소 5 컴포넌트 (Button / Card / TextField / Toggle / ThemeSwitcher).
- [ ] `apps/web/src/App.tsx` 가 design system 사용하여 의도된 톤 렌더.
- [ ] Browser 확인 — Aurora bg motion 동작, 3 theme switch 동작 (Aurora ↔ Mono ↔ Vivid), micro-interaction 동작 (hover / focus / active).
- [ ] `prefers-reduced-motion: reduce` 의 모션 비활성화 동작.
- [ ] WCAG AA color contrast — semantic token 의 color pair 모두 ≥ 4.5:1 (large text 3:1).
- [ ] keyboard navigation 동작 — Tab / Shift+Tab / Enter / Space / Esc.
- [ ] `pnpm lint && pnpm --filter @weave/web typecheck && pnpm --filter @weave/web build` PASS.

## Context

사용자 결정 (2026-05-22 turn):
- 디자인 시스템 작업이 첫 우선순위 (DR-002~005 보다 먼저).
- 톤: **Premium Glass + Gradient (Stripe + Apple)** — Aurora theme as default.
- 4 요청 키워드: (a) 다른 서비스 벤치마킹, (b) 인터랙티브한 프레젠테이션, (c) 다이나믹·톡톡 튀는 감성, (d) 테마 변경 가능.

벤치마크 결정 후 정리:
- 가장 가까운 벤치마크: Stripe (premium soft gradient) + Apple Vision Pro (glassmorphism) + Linear (sharp typography 일부 차용) + Pitch (presentation playfulness) + Arc browser (vibrant motion 차용).
- 피할 함정: Notion (too warm/safe) / Canva (too chaotic) / Miro (too childlike for B2B).

## Escalation triggers (check before starting)

- [ ] User data — design system 자체는 무관. component 가 향후 input 다룰 때 의무.
- [ ] Payment — N/A.
- [ ] AI — N/A.
- [x] **UI / UX change** — `frontend-performance-agent` / `rendering-performance-architecture-agent` 사인 의무. 특히 aurora bg animation 의 paint cost / motion 의 INP / a11y reduced-motion.
- [x] **Public page** — design system 이 landing 의 base. `seo-ai-visibility-agent` 사인.
- [x] **Library / dependency** — Tailwind v4 + Radix + motion. `library-adoption-supply-chain-governance-agent` 사인 (DR-007 동행).
- [ ] Release — 첫 launch 시 별도 LAUNCH_GATE.

## Technical Feasibility verdict

- FR record: design system 자체는 기존 기술 표준 — 별도 FR 발행 없이 WI 안에 inline assess.
- Verdict: **FEASIBLE**. 모든 도구 (Tailwind v4 stable / Radix prod-ready / motion v11 / View Transitions API Baseline 2024) production-ready.
- Risk: View Transitions API Safari 18+ 만 (2024 Baseline 진입). M0 의 fallback 의무 — CSS opacity-fade 로 degrade.

## Links

- Related Decision Records: DR-007 (planned: design system tooling)
- Related Risk reviews: `features/foundation/RISK_NOTES.md` (R-17 의 신규 추가 — Tailwind v4 dependency risk, R-18 motion a11y)
- Related Feasibility Reviews: FR-001 (이미 verdict, design system 은 그 범위 안)
- Related Handoffs: —
- Related Engineering Plan: `features/foundation/ENGINEERING_PLAN.md` M0 의 design-system slot

## Status updates

- 2026-05-22: WI-002 발행. 사용자 결정 (Aurora premium glass+gradient + 3 theme + 톡톡 보완 motion/accent). DR-007 동시 발행. features/design-system 셋업 시작.
