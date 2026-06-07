# WI-136 — 테마 타이포그래피 & 폰트 공급 확장

## 문제 (User problem)

서비스 테마 관리가 **색상 팔레트만** 다룬다. 두 가지 빈틈:

1. **테마가 폰트를 모른다.** 테마를 바꿔도 타이포그래피는 그대로다. 폰트는 텍스트 아이템 단위 속성(`fontFamily` 리터럴 문자열)일 뿐, 테마와 결합되어 있지 않다.
2. **폰트 목록이 하드코딩 + 정적 로드라 확장이 안 된다.** `font-presets.ts`에 6종이 하드코딩되어 있고, `index.html`의 거대한 정적 Google Fonts `<link>` 하나가 6종을 항상 전부 다운로드한다. 폰트를 늘리려면 매번 두 파일을 손으로 고쳐야 하고, 안 쓰는 폰트까지 매번 받는다.

## 원하는 결과

- **테마 타이포그래피**: 테마가 제목/본문/모노 같은 폰트 **역할(role)** 을 정의하고, 텍스트가 역할을 참조하면 테마 전환 시 색상처럼 폰트도 같이 바뀐다. 개별 텍스트는 원하면 특정 폰트로 **override** 할 수 있다. (색상 토큰 아키텍처의 평행 복제)
- **폰트 공급 확장**: 한글 포함 큐레이션 카탈로그(30~50종)를 기본 노출면으로 두고, 선택/미리보기 시에만 **온디맨드 로드**. 그 위에 Google Fonts 전체를 **찾아보기(browse)** 백엔드 소스로 연동.

## 사용자 결정 (2026-06-07)

- 테마-폰트 결합: **역할 토큰 + 개별 override 둘 다**
- 폰트 공급원: **큐레이션 카탈로그(온디맨드) + Google Fonts API 하이브리드**
- 진행: **엔지니어링 플랜부터**

## 산출물

- 엔지니어링 플랜: `features/theme-typography/ENGINEERING_PLAN.md`
- 후속 DR(플랜 승인 시): 폰트 역할 토큰 + `fontFamily` StyleRef 결합 결정, 정적 링크 → 온디맨드 로더 전환 결정
- 타당성: **FEASIBLE** — 색상축 메커니즘(`style.provider` 루트 Unit + StyleRef 캐스케이드 + `[data-theme]` CSS var)이 이미 존재하므로 신규 발명 없이 평행 복제. 별도 FR 불필요(필요 시 경량 FR로 승격).

## 상태

- [x] 문제 정의 / 사용자 스코프 확정
- [x] 현행 구조 매핑 (색상 vs 폰트)
- [x] 엔지니어링 플랜 작성
- [x] DR-087(카탈로그/로더), DR-088(역할/테마 타이포그래피), DR-089(Google Fonts 번들 스냅샷)
- [x] **Phase 1** — 카탈로그 레지스트리(~40종, 한글 포함) + 온디맨드 로더 + 정적 벌크 링크 폐기(base 3종만 유지) + 재수화 + picker 역할/카탈로그 섹션 + `font-presets.ts` 제거.
- [x] **Phase 2** — 폰트 역할 값(`var(--font-*)`), 신규 텍스트 기본=본문 역할. (StyleRef 불필요로 단순화 — DR-088)
- [x] **Phase 3** — 테마별 기본 타이포그래피 `theme-typography-defaults.ts`(paper/webtoon/noir/sunset/ocean) + 테마 전환 시 inline var 적용 + 폰트 온디맨드 로드. effective = override ?? 테마기본 ?? base.
- [x] **Phase 4** — `useThemeTypography` + `TypographyPicker`(헤더, ThemePicker 옆). 테마별 제목/본문/모노 폰트 영속 + inline var + 온디맨드 로드 + 초기화 + 테마기본 라벨.
- [x] **Phase 6** — `google-fonts-snapshot.ts`(번들 ~110종) + `FontBrowseDialog`(검색/미리보기) + ad-hoc `makeGoogleFontEntry` + 로더 best-effort 재수화. text-section "모든 폰트 찾아보기" 연결.
- [x] **Ad-hoc 레지스트리** — `fonts/adhoc-registry.ts`: 찾아보기로 고른 폰트를 localStorage 영속 등록, `resolveFontEntryById`(카탈로그→ad-hoc fallthrough). 로더가 ad-hoc stack을 정밀 해석(best-effort 대체). **TypographyPicker 역할별 "모든 폰트 찾아보기"** → 임의 Google 폰트를 테마 역할 기본으로 지정 가능.
- [x] **Phase 5b** — 재수화 로드 경로를 **클라우드 초기 로드 + offline-discard**까지 확대(`use-design.ts`의 `setDesign(hydrated)` 지점들).
- [ ] (후속) picker 인라인 검색/가상화(카탈로그 ~40종이라 우선순위 낮음 — 대형 목록 검색은 FontBrowseDialog가 담당), 폰트 셀프호스팅(개인정보 — 오프라인 샌드박스에서 폰트 파일 다운로드 불가라 미구현, DR-087/089 후속 유지).

## 검증 상태

- typecheck 클린, 단위 테스트 **755건 전부 통과**(기존 733 + 신규 22), 프로덕션 빌드 성공(임포트 사이클 없음), Biome 클린.
- e2e: 이 샌드박스는 fonts.googleapis.com 접근 불가 → `prepareDesign`의 `waitForLoadState("networkidle")`가 폰트 링크로 타임아웃. **베이스라인(변경 전)에서도 동일 실패** 확인 → 회귀 아님(환경 제약). 폰트 로딩 실동작은 네트워크 가능 환경에서 재검증 필요. font-family picker e2e는 통과(flaky 재시도 후).
