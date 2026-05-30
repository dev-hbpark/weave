# DR-design-028 — Light-theme overlay tone split (floating chrome follows theme)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-028 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Component | `@weave/design-system` → `tokens.css` (overlay token family) |
| Triage Decision | **Step 4 — Grew (token)** — overlay 토큰을 테마 무관 단일 정의 → dark/light tone-split |
| Predecessor | DR-design-026 (테마 3→10, light 3종 추가), DR-design-027 (status 토큰 + ThemePicker) |

## Motivation (버그)

사용자 보고: **"최근 추가된 테마들이 모든 UI에 적용되지 않는다."**

조사 결과 — 테마 토큰(`--bg-page`/`--accent`/`--surface-1·2`/`--text-*`)은 10종 모두
`[data-theme]` 블록에 완비돼 있고 `data-theme` 도 `<html>` 에 정상 적용된다. 그러나
**overlay 토큰 군**:

```
--surface-overlay / --surface-overlay-2 / --surface-overlay-border(-strong)
--text-overlay(-soft/-muted) / --shadow-overlay
```

은 `:root` 에 **단 한 번, 다크 글라스 고정값**(`rgba(15,23,42,0.94)` 배경 + 흰 글자)으로만
정의되고 어떤 `[data-theme]` 블록에도 override 가 없었다.

이 overlay 토큰은 **에디터 chrome 대부분**이 사용한다 — `Panel`(PropertiesPanel),
`ContextualToolbar`, 전 toolbar 섹션(text/flex-child/frame-background/multi-edit),
모든 메뉴(ContextMenu/DropdownMenu/Select/LayerPickerMenu/SlashCommandMenu),
팝오버·다이얼로그(Popover/ColorPicker/Dialog/MediaSrcDialog/NewDesignWizard),
툴팁(Tooltip/AITooltip/CursorTooltip/UnifiedTooltip/Banner), ThemePicker 자신 등.

따라서 테마를 바꾸면 페이지 배경·카드·accent 는 바뀌지만 이 floating chrome 은 항상 다크로 남는다.
기존 7종(aurora/vivid/mono/noir/forest/sunset/ocean)은 **전부 다크**라 다크 overlay 가
자연스럽게 맞아 아무도 못 느꼈고, 이번에 추가된 **light 3종(daylight/paper/webtoon)**에서
비로소 "패널·툴바·메뉴만 안 바뀐다"로 드러났다. (DR-design-026 의 10테마 육안검증은
페이지 배경/카드 위주라 overlay chrome 대비를 놓침.)

## 원 설계 의도와 트레이드오프

overlay 토큰의 원 의도(`tokens.css` 주석): floating chrome 은 사용자 **캔버스(어떤 색이든)**
위에 떠야 하므로, 어떤 배경 위에서도 읽히는 **불투명 다크 글라스 + 단일 제품 레이어**.
이 의도 자체는 유효하나 "모든 테마가 다크"라는 전제가 light 테마 도입으로 깨졌다.

해법: overlay 를 **dark/light 두 톤으로 split** 한다. dark 테마는 기존 `:root` 다크
overlay 유지, light 테마는 light 글라스 + dark-ink 램프로 override. "어떤 캔버스 위에서도
읽힘" 의도는 light overlay 도 **≥0.97 불투명**으로 유지해 보존한다.

## 적용

`tokens.css` 의 `:root` overlay 블록 **뒤에** light 3종 override 블록 추가:

- `[data-theme="daylight"]` — cool white 글라스(`rgba(248,250,253,0.97)`) + `rgba(15,23,42)` 잉크
- `[data-theme="paper"]` — warm cream 글라스(`rgba(246,241,233,0.97)`) + `rgba(43,34,24)` 잉크
- `[data-theme="webtoon"]` — bright white 글라스(`rgba(255,253,248,0.98)`) + `rgba(20,20,30)` 잉크,
  shadow 는 webtoon 의 flat "printed" 잉크 드롭 결 유지

**위치가 중요**: `:root` 와 `[data-theme="…"]` 는 specificity 가 동일(0,1,0)하므로
`:root` overlay 블록(파일 후반)보다 **나중 source order** 여야 이긴다. dark 테마는 override
없이 `:root` 다크 overlay 를 그대로 상속한다.

status 토큰(`--status-success/-warn/-danger`)은 보편 의미라 의도적으로 테마 무관 유지(변경 없음).

## Triage Walk

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | 기존 `--surface-1·2` 는 translucent-white 라 light 캔버스 위에서 사라짐 → floating chrome 엔 부적합. overlay 토큰이 정답. |
| 2. Extend | ✓ | 새 토큰 추가 아님 — 기존 overlay 토큰의 테마별 값만 추가. |
| 3. Grew (token) | ✅ | overlay 토큰을 단일 정의 → dark/light tone-split. 신규 토큰 0, 신규 컴포넌트 0. |
| 4. Escape | ✗ | 공용 토큰이므로 design-system 내부에서 해결. |

## Verification

- `apps/web/e2e/theme-overlay-chrome.spec.ts` — 프레임 선택으로 PropertiesPanel +
  ContextualToolbar(둘 다 overlay 소비) 띄운 뒤 테마 전환:
  - aurora → `--surface-overlay` 가 다크 네이비(`15, 23, 42`) 유지
  - daylight/paper/webtoon → overlay 가 다크와 다르고 첫 채널 ≥ 230(light) 확인
  - 4개 테마 스크린샷(`test-results/overlay-*.png`) 육안 검증

## 영향 / 리스크

- 코드 변경은 `tokens.css` 한 파일, CSS 토큰만. 컴포넌트 0 수정 → 회귀 표면 최소.
- dark 7종 동작 불변(override 없음). light 3종에서만 chrome 톤 변경.
- a11y: light overlay 의 dark-ink 텍스트 대비는 AA 이상(daylight/paper/webtoon 본문 램프 재사용).
