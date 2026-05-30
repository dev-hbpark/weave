# DR-design-026 — Theme expansion 3 → 10 (+ registry SSOT, + light-theme bg fix)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-026 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Component | `@weave/design-system` → theme registry (`themes.ts` 신규), `tokens.css` (+7 `[data-theme]` blocks), `ThemeSwitcher`, `use-theme`; `apps/web/src/main.css` (root canvas) |
| Triage Decision | **Step 5 — Grew (new theme variant)** ×7 |
| Governance | RULE.md #5 (theme registry closed) — Design Review + `seo-ai-visibility-agent` sign-off required |

## Motivation

사용자 요청: 테마를 다양하게 늘리고 싶다 — **라이트 테마**와 **웹툰스러운** 톤 포함, 약 10종.
기존 3종(aurora/mono/vivid)은 전부 dark 계열이라 밝은 환경·인쇄물·코믹 톤을 커버하지 못함.

## Triage Walk

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | 기존 3 테마로는 light / 웹툰 / 자연·계절 무드 표현 불가. |
| 2. Extend | ✓ | 테마는 component variant 가 아니라 semantic-token override 세트 → "변형 확장"이 아니라 레지스트리 항목 추가. |
| 3/4/5. Grew | ✅ | semantic layer override 블록 7개 신규(새 primitive/토큰 키 추가 없음 — 기존 37 시맨틱 키 재정의만). Theme variant = Grew step 5. |
| Escape | ✗ | 테마는 공용 자산. app-local override 금지(RULE #2). |

## 추가된 7 테마 (총 10)

SSOT = `packages/design-system/src/themes.ts`.

**Dark (7 total):** aurora(기본)·vivid·mono(기존) + **noir**(잉크/느와르, 흑백+blood-red, glow 없음)·**forest**(emerald/teal calm)·**sunset**(dusk orange→magenta→violet)·**ocean**(deep blue/cyan).
**Light (3, 전부 신규):** **daylight**(cool-white + sky-blue, 옅은 pastel aurora)·**paper**(warm cream/sepia editorial, flat)·**webtoon**(bright paper-white + bold ink outline + tri-color pop, 낮은 blur).

각 블록은 aurora 블록과 **동일한 시맨틱 세트**(page / aurora-stops / surface / text /
accent / border / focus / shadow / domain-accents / focus-stages)를 재정의. `--hover-affordance-*`,
`--arrange-preview-*` 는 `var(--accent)` / 고정 cyan 으로 use-time 재해석되므로 재정의하지 않음.

## 구조 변경 — 레지스트리 SSOT (OS Rule 6)

이전엔 테마 목록이 3곳에 중복: `ThemeName` 유니온 + `readStored` 검증 `||` 체인 +
`THEMES` 배열. 10종으로 늘면 3개의 N-way `||` 체인이 됨 → Open-Closed 위반(선언적 분기 규칙).

- 신규 `themes.ts`: `THEMES` 배열이 유일 소스. `ThemeName = (typeof THEMES)[number]["name"]`
  로 **파생**. 멤버십은 `isThemeName()` 단일 `Set` lookup.
- `use-theme.ts` / `ThemeSwitcher.tsx` 는 더 이상 테마명을 하드코딩하지 않음.
- 테마 추가 = `themes.ts` 1줄 + `tokens.css` 블록 1개. 끝.
- `declarativecheck`(Rule 6) GREEN — 잔여 분기 0.

## Light-theme background fix (main.css)

자체검증 중 발견한 **잠재 버그**: `apps/web/src/main.css` 의 `html, body { background: #050715 }`
(AUDIT-003 axe 폴백) 가 불투명 dark literal 이라, light 테마에서 fixed `.weave-aurora-bg`
(z-index:-10, `var(--bg-page)`) 위를 in-flow `body` 배경이 덮어 **화면이 계속 dark** 로 보였음.
기존 테마는 전부 dark(≈literal)라 드러나지 않았고, light 테마가 처음으로 노출.

수정: `html` 은 `background-color:#050715; background-color:var(--bg-page);`(literal 폴백 +
테마 추종), `body` 는 `transparent`. 루트 박스는 negative-z aurora 레이어를 가리지 않음.
부수 효과로 dark 테마의 aurora blob 가시성이 약간 향상(의도된 premium-glass 룩).

## a11y

- 모든 테마 WCAG AA 목표. Light 테마는 text/surface 를 dark-ink ramp 로 반전; accent-as-button-bg 는
  white `--text-on-accent` 와 ≥ 3:1(AA-large) 유지(webtoon accent 를 `#f43f5e` 로 선택해 폴백 확보).
- `prefers-reduced-motion` 경로 불변(기존 토큰 중립화 그대로).
- ThemeSwitcher: 항목 10개 → `flex-wrap` 추가(좁은 컨테이너 오버플로 방지). 1280px 헤더에서는 1줄 유지.

## 검증 (Continuous Self-Verification)

- `declarativecheck`(Rule 6) GREEN, `lint`(biome) 0 error, `typecheck` GREEN, `@weave/web build` GREEN(CSS 컴파일 — 미정의 var 없음).
- Playwright 라이브 런타임: 실제 `ThemeSwitcher` 클릭으로 10 테마 전환 → `data-theme` + `localStorage` 영속 + `.weave-aurora-bg` 페인트색 == `--bg-page` 전부 일치 확인. light(daylight/paper/webtoon)·noir·sunset·forest·ocean·aurora 스크린샷 육안 검증 통과.

## Sign-off

| Role | Reviewer | Status |
|---|---|---|
| Design system (automated) | `design-system-agent` | Approved (triage Grew ×7, primitive/토큰 키 추가 없음, 토큰만 확장) |
| SEO / AI visibility | `seo-ai-visibility-agent` | **Pending** — RULE #5 의무 사인오프. light 테마 메타 `theme-color` / `prefers-color-scheme` 정합성 확인 필요(후속). |
| Human owner | hbpark | Pending |

## Follow-ups (deferred)

- `seo-ai-visibility-agent` 사인오프: `<meta name="theme-color">` 를 활성 테마 `--bg-page` 와 동기화, `prefers-color-scheme` 기반 light 테마 자동 첫 진입 옵션 검토.
- Overlay surface 토큰(`--surface-overlay-*`)은 의도적으로 전 테마 공통 dark-glass — light 테마에서 popover/tooltip 이 dark 로 뜸. 현 결정 유지(단일 제품 레이어 의도)지만, light 테마 대중화 시 light overlay 변종 재검토.
- 10개 inline 토글이 많아지면 ThemeSwitcher 를 그룹형(dark/light) popover 로 승급 검토(현재는 flex-wrap 로 충분).
- Visual regression: 테마 × 핵심 페이지 pixel baseline(DR-013 deferred 와 동일 트랙).
