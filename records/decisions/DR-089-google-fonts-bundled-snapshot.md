# DR-089 — Google Fonts 전체 찾아보기: 번들 스냅샷 (API 키 미사용)

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: WI-136 Phase 6, DR-087(카탈로그/로더), DR-088(역할/테마 타이포그래피)

## 맥락

큐레이션 카탈로그(~40종)를 넘어 "더 다양한 폰트"의 상한을 Google Fonts 전체로 열어야 했다. 소스 전략 두 후보(엔지니어링 플랜):
- (A) Google Fonts Developer API 런타임 조회 — 최신성↑이나 **API 키 관리 + 쿼터 + 키 노출 + CORS** 부담.
- (B) 번들 스냅샷 JSON — 키/쿼터/CORS 없음, 정적.

## 결정

**(B) 번들 스냅샷 채택.** `fonts/google-fonts-snapshot.ts`에 패밀리 메타(`[family, category, korean?]`) 정적 목록(현재 ~110종, 한글 포함)을 동봉. 큐레이션 카탈로그와 중복되는 항목은 `fontIdFromFamily`로 필터링해 찾아보기 다이얼로그에 카탈로그 외 폰트만 노출.

- **선택 흐름**: `FontBrowseDialog`(검색 + 미리보기 hover 로드) → 선택 시 `makeGoogleFontEntry`로 ad-hoc `FontEntry` 생성 → `ensureFontLoaded` → `attrs.fontFamily`에 **리터럴 stack 저장**(개별 override).
- **재수화**: ad-hoc/레거시 stack은 카탈로그 `FONT_BY_STACK`에 없으므로, 로더가 **선행 따옴표 패밀리를 파싱해 best-effort google 로드**(`gf:` 키 dedup). 따옴표 없는 system stack은 무시. 덕분에 찾아보기로 고른 폰트와 레거시 따옴표 stack 모두 재오픈 시 복원.
- **운영**: 스냅샷은 분기별로 Google Fonts API 덤프에서 재생성해 교체(주석에 명시).

## 트레이드오프 / 결과

- (+) API 키·쿼터·CORS·런타임 실패 표면 0. 첫 화면 빠름(정적).
- (+) 선택은 리터럴 stack이라 직렬화/round-trip 변경 0.
- (−) 스냅샷은 전체 Google Fonts(1500+)의 부분집합 — 최신/희귀 폰트는 누락. 재생성으로 갱신.
- **개인정보**: 여전히 `fonts.googleapis.com` 직접 로드(클라이언트 IP 노출). 셀프호스팅 옵션은 DR-087의 후속 항목으로 유지.

## 갱신 (2026-06-07) — ad-hoc 레지스트리

`fonts/adhoc-registry.ts` 추가로 ad-hoc 폰트가 1급 시민이 됨:
- 찾아보기 선택 시 `registerAdHocFont`로 localStorage 영속 등록(`weave.fonts.adhoc`).
- `resolveFontEntryById`(카탈로그 → ad-hoc fallthrough)로 **TypographyPicker가 임의 Google 폰트를 테마 역할 기본으로** 지정 가능.
- 로더가 ad-hoc stack을 정밀 해석(`adHocByStack`) — best-effort 따옴표 파싱은 미등록 레거시 stack 전용 폴백으로 강등.
- jsdom 29 Storage 스텁(메서드 없음)은 try/catch로 무해화(영속은 e2e에서 검증).

## 후속

- 스냅샷 자동 재생성 스크립트(Google Fonts API 덤프).
- 폰트 셀프호스팅(개인정보 — 오프라인에서 폰트 파일 확보 불가라 보류).
