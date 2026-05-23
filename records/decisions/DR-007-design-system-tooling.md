# Decision Record — DR-007

## Metadata

| Field | Value |
|---|---|
| ID | DR-007 |
| Title | Design system tooling — Tailwind v4 + Radix UI + motion + View Transitions API |
| Status | **Accepted** (recommendation 기반, user confirm 시 변경 가능) |
| Owner | hbpark |
| Date | 2026-05-22 |
| Triggering Work Item | WI-002 |

## Context

WI-002 의 design system foundation 의 도구 stack 결정. 사용자 결정 (2026-05-22): Aurora premium glass+gradient + 3 theme + 톡톡 모션. 그에 맞는 도구 stack.

## Options

### Option A (Recommended): Tailwind v4 + Radix UI + motion + View Transitions API

- **Tailwind v4** — CSS variable 기반 `@theme` directive 가 theme switch 자연. JIT. 표준.
- **Radix UI primitives** — a11y headless 컴포넌트. unstyled.
- **motion** (구 Framer Motion) — spring 기본, reduced-motion 자동 처리.
- **View Transitions API** — Page transition 표준 (2024 Baseline 진입), Safari 18+ Chrome 111+.
- **CSS @property + container queries** — animated gradient + responsive 자연.

### Option B: Panda CSS + Radix + motion

- type-safe tokens (TypeScript), JIT zero-runtime.
- 단 Tailwind v4 의 type-safe 가 작년부터 좋아짐 → Panda 의 장점 약화.

### Option C: Vanilla CSS variables + Radix + motion

- 가장 minimal. Tailwind 없음.
- 단 utility class 의 dev 속도 손실. 큰 codebase 에서 dead style 검출 어려움.

### Option D: shadcn-ui copy + 기존 component

- 빠른 dev. 단 디자인 자유 약함 (shadcn 의 톤 = Vercel 모노톤). weave 의 Aurora 톤과 충돌.

## Decision

**Option A (Recommended) Accepted**.

근거:
1. Tailwind v4 의 `@theme` directive 가 3 theme variant 의 cleanest 셋업 path.
2. Radix UI 가 a11y 무료 — 우리는 헤드리스 위에 Aurora 톤 입힘.
3. `motion` 의 spring 이 premium glass tone 의 부드러운 easing 과 맞음. reduced-motion 자동 처리는 a11y 의무.
4. View Transitions API 가 page transition 의 새 표준 — weave 의 인터랙티브 프레젠테이션 요구와 맞음. Baseline reachability 검증 필요 (Safari 18+).
5. shadcn-ui 의 일부 컴포넌트 (Button, Input 등) 의 unstyled skeleton 만 차용, 톤은 weave 자체.

## Library specifics (M0 install)

| Package | Version | 용도 |
|---|---|---|
| `tailwindcss` | ^4.0.0 | utility + @theme directive |
| `@tailwindcss/vite` | ^4.0.0 | Vite plugin |
| `@radix-ui/react-toggle-group` | latest | theme switcher |
| `@radix-ui/react-tooltip` | latest | tooltip |
| `@radix-ui/react-slot` | latest | composable primitives |
| `motion` | ^11.0.0 | spring + reduced-motion 자동 |
| `clsx` | ^2.0.0 | className concat |
| `tailwind-merge` | ^2.0.0 | utility conflict 해결 |

## Alternatives ruled out

- Option B (Panda): Tailwind v4 의 진보로 차별점 약화.
- Option C (Vanilla): dev 속도 손실, weave 가 큰 size 로 성장 예정.
- Option D (shadcn): 톤 충돌. 단 일부 컴포넌트의 skeleton 코드 참조는 허용.

## Consequences

### Bundle 의 영향 측정 (M0 후 평가)

- Tailwind v4 의 JIT 가 최종 CSS < 20 KB gzip 목표.
- motion lib + radix 합 < 30 KB gzip 목표 (tree-shake).
- View Transitions API 는 native — 0 bytes.

### a11y 의무

- `prefers-reduced-motion: reduce` 시 motion 모두 fade-only.
- color contrast WCAG AA (4.5:1 normal, 3:1 large).
- keyboard navigation 의무 — Tab/Shift+Tab/Enter/Space/Esc.
- focus-visible ring 의 high-contrast 색.

### Browser Baseline 의무

- Tailwind v4 — Safari 16.4+, Chrome 111+, Firefox 128+ (이건 `standards-runtime-platform-intelligence-agent` 사인 의무).
- View Transitions API — Chrome 111+, Safari 18+, Firefox: experimental. **fallback 의무** (opacity-fade) 박제.
- `prefers-color-scheme` — Baseline 자연.
- container queries — Baseline 2024.

### Risk

- Tailwind v4 의 ecosystem (plugins) 가 v3 대비 마이그레이션 중. 일부 plugin 미지원 가능 — M0 평가.
- motion lib 의 bundle size — radix slot 와 함께 tree-shake 의무.

## Mitigations

- M0 의 첫 install 후 `pnpm --filter @weave/web build` 의 CSS / JS size 측정 박제.
- View Transitions API 미지원 브라우저의 fallback 의 e2e 검증.
- a11y test — axe-core 의 첫 통합 (M0 deferred or M1).

## Links

- WI-002
- RISK_NOTES R-17 (planned: Tailwind v4 dependency), R-18 (planned: motion a11y reduced-motion)
- `library-adoption-supply-chain-governance-agent` 사인 의무 (M0)
- `standards-runtime-platform-intelligence-agent` 사인 의무 (M0, View Transitions API)
