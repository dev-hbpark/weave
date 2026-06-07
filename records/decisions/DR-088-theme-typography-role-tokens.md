# DR-088 — 폰트 역할 토큰 + 테마별 타이포그래피 override

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: WI-136, DR-087(카탈로그/로더), `features/theme-typography/ENGINEERING_PLAN.md`
- 참고: 색상 테마-반응형 기본값(`color: "var(--text-default)"`, domain-kinds.ts) 패턴을 폰트축으로 복제

## 맥락

테마는 색상만 알고 폰트를 몰랐다. "테마에서 폰트 관리"(WI-136)를 위해 폰트를 테마와 결합하되, 개별 텍스트는 특정 폰트로 덮어쓸 수 있어야 했다(사용자 결정: 역할 토큰 + 개별 override 둘 다).

## 핵심 단순화 — StyleRef 불필요

색상 **기본값**은 StyleRef가 아니라 리터럴 `"var(--text-default)"` 문자열로 저장되고, TextBlock이 inline style로 적용 → CSS가 `[data-theme]`별로 해석한다. 폰트도 동일하게 처리한다:

- 폰트 **역할** = 리터럴 CSS var 문자열 (`var(--font-display)` / `var(--font-sans)` / `var(--font-mono)`).
- `attrs.fontFamily`는 기존 `string` 타입 그대로 — **타입/serializer/resolver 변경 없음**. round-trip identity는 문자열이라 자명하게 보존.
- 개별 override = 카탈로그 stack 리터럴.

→ 엔지니어링 플랜이 예상한 `fontFamily: string | StyleRef` + `useResolveFont` + 토큰맵 병합은 **불필요**해졌다. StyleRef 캐스케이드는 per-slide/per-frame 폰트 override(미요청)에만 필요하므로 후속으로 미룬다.

## 결정

1. **역할 값** — `FONT_ROLES`(catalog.ts): 제목=`var(--font-display)`, 본문=`var(--font-sans)`, 모노=`var(--font-mono)`. picker 최상단 "테마 역할" 섹션에서 선택.
2. **신규 텍스트 기본 = 본문 역할** — `domain-kinds.ts` 기본 `fontFamily`를 `DEFAULT_TEXT_FONT_FAMILY`(`var(--font-sans)`)로. 새 텍스트가 테마 반응형(색상 기본값과 대칭). 기존 문서의 리터럴 폰트는 그대로 override로 보존(강제 마이그레이션 없음).
3. **테마별 타이포그래피 override** — `useThemeTypography`(use-theme-typography.ts): 활성 테마를 키로 {display, body, mono} 폰트 id를 localStorage(`weave.typography`)에 영속. 적용은 `<html>`에 inline CSS var(`--font-*`) 세팅(inline이 [data-theme] 캐스케이드를 이김) + 온디맨드 로드. 해제 시 inline var 제거 → 테마 CSS 기본값 복귀. 테마 전환 시 그 테마의 선택을 재적용.
4. **UI** — `TypographyPicker`(헤더, ThemePicker 옆): 역할별 드롭다운(테마 기본 + 카탈로그) + "초기화". design-system 패키지가 apps/web 카탈로그에 의존할 수 없어 apps/web 측 컴포넌트로 분리.

## 트레이드오프 / 결과

- (+) 타입/직렬화 변경 0. 색상 아키텍처와 대칭. 사용자가 테마별 타이포그래피를 직접 관리.
- (+) 역할 바인딩 텍스트는 테마 폰트 선택을 문서 변경 없이 따른다.
- (−) 테마별 폰트는 **사용자 override가 있을 때만** 달라진다. 박스에서 바로 테마마다 다른 기본 폰트(예: paper=세리프)를 주려면 `[data-theme]` CSS 기본값 + 테마→폰트 로드 와이어링이 필요 → **Phase 3 후속**으로 미룸.
- (−) per-slide/per-frame 폰트 캐스케이드(StyleRef)는 미구현(미요청).

## 후속

- Phase 3: 큐레이션 테마별 기본 타이포그래피 + 테마 전환 시 폰트 로드.
- Phase 5: picker 검색/미리보기 폴리시, 재수화 로드 경로를 클라우드 초기 로드까지 확대.
- Phase 6: Google Fonts 전체 찾아보기(번들 스냅샷 권장).
