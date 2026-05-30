# features/design-system

> WI-002 의 home. weave 의 시각 정체성 + 모든 UI 의 base.

## Source of truth

- **WI-002** — `records/work-items/WI-002-design-system-foundation.md`
- **DR-007** — `records/decisions/DR-007-design-system-tooling.md` (Tailwind v4 + Radix + motion + View Transitions)
- **코드 위치** — `apps/web/src/design-system/`

## 3-layer token

1. **base** — palette / spacing / radius / typography / motion easing. 정의 위치: `tokens.css` 의 `@theme` block.
2. **semantic** — bg / text / accent / surface / border / focus / aurora-stops / shadows. 정의 위치: `tokens.css` 의 `:root` + `[data-theme="..."]` selectors.
3. **component** — Button / Card / ThemeSwitcher 의 own utility composition (Tailwind class + CSS var).

## 10 theme variants (DR-design-026)

레지스트리 SSOT = `packages/design-system/src/themes.ts`. `ThemeName` 은 거기서 파생,
멤버십은 `isThemeName()` 한 번의 lookup — switcher / storage guard 가 자동 동기화.

**Dark (7)**

| variant | DNA | 사용 의도 |
|---|---|---|
| **Aurora** (default) | premium glass + slow drifting gradient + magenta-cyan-violet aurora | 메인 톤. 신규 사용자 첫 진입. B2B 진중함 + 시각적 매력 동시 |
| **Vivid** | max playful, multi-color aurora (hot pink + cyan + yellow), 강한 glow | 캠페인 / 디자인 / 마케팅 자료. "톡톡 튀는" 의 극값 |
| **Mono** | Linear-grade sharp, monochrome + 단일 orange accent, aurora 비활성 | 노트 / 전문가 모드. 진중한 컨텍스트 (제안서 / 보고) 에 적합 |
| **Noir** | ink-comic / manhwa noir — near-black + white high-contrast outlines, 단일 blood-red accent, glow 없음, 낮은 blur | 만화/웹툰 작업의 흑백 잉크 톤, 드라마틱 surface |
| **Forest** | calm emerald/teal aurora, 자연 톤 | 차분 집중. 장시간 편집 세션 |
| **Sunset** | warm dusk gradient (orange→magenta→violet), 강한 glow | 따뜻한 무드 / 감성 콘텐츠 |
| **Ocean** | deep blue + cyan/teal, cool calm | 시원·차분, 데이터/정보 밀집 화면 |

**Light (3)**

| variant | DNA | 사용 의도 |
|---|---|---|
| **Daylight** | clean cool-white, sky-blue accent, 아주 옅은 pastel aurora wash | 밝은 환경 / 주간 작업 기본 라이트 |
| **Paper** | warm cream/sepia editorial, terracotta accent, aurora 없음 (flat) | 문서/읽기 중심, 인쇄물 느낌 |
| **Webtoon** | bright paper-white, bold ink outlines, tri-color pop accent + pastel pop aurora, 낮은 blur | 웹툰/코믹 톤. 밝고 통통 튀는 인쇄 만화 느낌 |

Light 테마는 text/surface 를 dark-ink ramp 로 뒤집고, accent-as-button-bg 는 white
`--text-on-accent` 와 ≥ 3:1 (AA-large) 을 유지. 루트 캔버스(`html`)가 `var(--bg-page)`
로 테마를 따라가야 light 가 실제로 light 로 보임 — 불투명 `body` bg 는 fixed aurora 레이어를
가리므로 금지 (main.css, DR-design-026 § Light-theme background fix).

전환은 `<html data-theme="...">` 의 attribute swap. View Transitions API 가 cross-fade.

## 박힌 a11y 의무

- `prefers-reduced-motion: reduce` 시 aurora drift + motion 모두 OFF (fade-only).
- WCAG AA color contrast — 모든 (bg, text) 쌍 ≥ 4.5:1 normal, 3:1 large.
- Keyboard navigation — focus-visible ring 의 contrast 박제.
- ARIA — Radix primitive 기본 (ToggleGroup 의 group / item role).

## 박힌 perf 의무

- Aurora bg `filter: blur(80px)` + `will-change: transform` — paint cost 의 trade-off 박제. 큰 페이지 (M3+) 에서 dirty-region 측정 의무.
- motion lib 의 `useReducedMotion` 의 모든 motion 컴포넌트에서 의무.
- spring transition 의 stiffness/damping — `var(--motion-spring-soft)` 기본.

## 다음 (M0 안)

- Component 추가 — TextField / Toggle / Select / Tooltip / Dialog / Toast (기본 5+α).
  - **Tooltip** → `AITooltip` (context + actions + shortcut keycap, smart debouncing 175 ms / 100 ms, shared-element morphing) 으로 격상 박제 진행 중. 참고: `records/work-items/WI-015-ai-agentic-tooltip.md`, `records/design-reviews/DR-design-006-ai-agentic-tooltip.md` (2026-05-23, Proposed).
- a11y 자동 검증 — axe-core 통합.
- Visual baseline — playwright pixel capture (DR-013 deferred).
- agocraft 의 StyleProvider tokens 와의 연결점 — PRODUCTION_BACKLOG 또는 별도 WI.
- 한국어 font fallback — Pretendard Variable 자체 host vs Google Fonts.
- 가독성 — semantic text 의 line-height / letter-spacing scale.

## 사용 예 (apps/web 외 다른 곳에서)

```tsx
import { Button, Card, ThemeSwitcher } from "../design-system";

<Button variant="primary" size="lg" trailingIcon={<span>→</span>}>
  Join the beta
</Button>;
```

theme 변경:

```tsx
import { useTheme } from "../design-system";

const { theme, setTheme } = useTheme();
setTheme("vivid");
```
