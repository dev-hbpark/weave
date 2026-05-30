# DR-design-027 — Theme picker (10-theme UX) + header Save/Present polish

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-027 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Component | `@weave/design-system` → **`ThemePicker`** (신규 primitive, `ThemeSwitcher` 대체); `IconButton`/`Button` 합성(헤더 Save/Present); `tokens.css` (+status 토큰); `themes.ts` (+`tone`) |
| Triage Decision | **Step 3 — Grew ×1** (ThemePicker 신규 primitive) + **Step 4 — Grew** (status 토큰 3) + **Extended**(Save/Present 합성) |
| Predecessor | DR-design-026 (테마 3→10 확장), DR-design-017 (header cloud save trigger) |

## Motivation

DR-design-026 으로 테마가 10종이 되며 기존 인라인 `ThemeSwitcher`(ToggleGroup pill 줄 + `flex-wrap`)가
비좁아짐. 사용자 요청: (1) 테마가 많아졌으니 다른 UX, (2) 헤더 **Present/저장 버튼이 못생김** → 함께 개선.

## Triage Walk — ThemePicker

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | `SegmentedControl`/`Select` 로는 10개 + 시각 정체성(테마별 색) 표현 불가. 단순 텍스트 드롭다운은 테마의 "보이는 것"을 못 보여줌. |
| 2. Extend | ✓ | `ThemeSwitcher` 에 prop 추가로 그리드/팝오버화 하면 단일 ToggleGroup 책임을 넘어섬(SRP). |
| 3. Grew | ✅ | `Popover` + Radix `ToggleGroup`(single, roving radio) 합성한 **`ThemePicker`** 신규. 트리거=활성 테마 swatch+label+chevron, 콘텐츠=다크/라이트 그룹 그리드. |
| 4. Escape | ✗ | 테마 선택은 모든 surface 공용 → 공용 primitive. `ThemeSwitcher` 는 폐기(삭제), 두 호출처(Landing/Design) 교체. |

## ThemePicker 동작

- **트리거**: `h-9` pill — 활성 테마의 `--accent-gradient` swatch + 라벨(`sm:` 이상 표시) + `IconChevronDown`. `data-testid="theme-picker"`.
- **콘텐츠**: `Popover`(overlay dark-glass, 전 테마 공통) 안에 `THEME_TONES`(dark/light) 섹션, 각 섹션 2-col 그리드.
- **라이브 프리뷰(핵심)**: 각 카드의 미니 타일에 `data-theme={t.name}` 를 걸어 **그 테마의 실제 토큰**(`--bg-page`/`--accent-gradient`/`--accent`/`--text-soft`)으로 렌더 — 문서 테마를 바꾸지 않고 라이트 테마는 흰 타일로 보임.
- **선택**: Radix ToggleGroup single → 항목 `role="radio"`, arrow-key roving. 각 항목 `aria-label`=테마 라벨 → `getByRole("radio",{name})` 안정 유지. 선택 시 active 테마 `--accent` 링 + `IconCheck`, 선택 즉시 팝오버 닫힘.
- **a11y**: Radix Popover 가 focus trap/Esc/aria-expanded 제공. `prefers-reduced-motion` 은 Popover 모션이 이미 존중.

## Save / Present 개선 (DR-design-017 동작 불변)

- **Save**: `IconButton` `variant="sm" ghost`(bare) → **`variant="subtle" size="md"` + 원형**(`rounded-pill`). 4-state glyph(`idle/saving/saved/failed`)·fire-and-forget·flash 정책은 DR-design-017 그대로. 상태 색은 신규 `SAVE_TINT_BY_STATUS`(state당 1행, Rule 6) — `saved`=`--status-success`, `failed`=`--status-warn`.
- **Present**: `trailingIcon` 14px → **`leadingIcon` `IconPlay` 16px** 유지(primary gradient CTA). 재생 아이콘이 라벨 앞에 와 "재생/발표" 의미가 명확.
- **결과**: 우 cluster 가 [ColorPicker swatch][테마 pill][원형 Save chip][Present pill] 로 라운드·높이 일관 — 이전의 사각 ghost Save + pill Present 불일치 해소.

## 신규 status 토큰 (Step 4 Grew)

`tokens.css` `:root` 에 theme-independent 추가(overlay 토큰과 동일 사유 — 보편적 의미는 전 테마 일관):
`--status-success`(emerald-500) · `--status-warn`(#d97706) · `--status-danger`(#e5453a).
기존 헤더의 임시 `var(--text-warn, #d97706)` literal 을 정식 시맨틱으로 대체.

## 검증 (Continuous Self-Verification)

- `declarativecheck`(Rule 6) GREEN, `lint`(biome) 0 error, `typecheck` GREEN, `@weave/web build` GREEN.
- Playwright 라이브: 새 디자인 생성 → 헤더 캡처. ThemePicker 트리거(닫힘)·팝오버(다크7/라이트3 그룹, 테마별 라이브 프리뷰, active 링+체크) 다크(Aurora)·라이트(Webtoon) 양쪽 육안 확인. Webtoon 선택 시 `data-theme=webtoon` 적용·트리거 swatch/라벨 갱신·링 색이 active accent(rose) 추종 확인. Save chip 상태 tint 동작 확인(오프라인 테스트 → failed=warn 경로 렌더; success 경로는 동일 lookup).
- e2e `present-poc.spec.ts` "theme switch persists" 를 팝오버 선행 오픈(`getByTestId("theme-picker")`)으로 갱신.

## Sign-off

| Role | Reviewer | Status |
|---|---|---|
| Design system (automated) | `design-system-agent` | Approved (Grew ×1 primitive + status 토큰 3, 합성으로 Save/Present, 변형 ceiling 영향 없음) |
| Human owner | hbpark | Pending |

## Follow-ups (deferred)

- DR-design-026 의 `seo-ai-visibility-agent` 사인오프(테마 메타)와 합쳐 처리.
- 온라인 환경에서 Save `saved`(green) 상태 스크린샷 baseline 확보(현 오프라인 검증은 failed 경로만 시각 확인).
- 테마가 더 늘면 ThemePicker 에 검색/필터 또는 즐겨찾기 행 검토(현 10종은 그리드로 충분).
- `--status-danger` 는 현재 미사용(향후 파괴적 액션/에러 배너용으로 예약).
