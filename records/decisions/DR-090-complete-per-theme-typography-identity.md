# DR-090 — 모든 기존 테마에 폰트 정체성 부여 (Phase 3 완성)

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: WI-138, DR-088(폰트 역할 토큰 + 테마별 타이포그래피 — 이 DR가 후속 Phase 3을 완성),
  DR-087(카탈로그/온디맨드 로더), DR-089(google 폰트 번들 스냅샷)

## 맥락

DR-088이 "테마별 기본 타이포그래피"를 **Phase 3 후속**으로 미뤘고, `theme-typography-defaults.ts`
(WI-136 Phase 3)가 5개 테마(paper/webtoon/noir/sunset/ocean)만 채워 둔 채였다. 테마 레지스트리
`@weave/design-system` `THEMES`는 10개 → 나머지 5개(aurora/vivid/mono/forest/daylight)는
폰트 정체성이 없어 base(Inter/JetBrains Mono)로만 렌더됐다. 사용자 요청: "기존 테마에 적절한
폰트 테마를 적용해서 사용할 수 있게."

배선은 이미 완료 상태였다 — `use-theme-typography.ts`가 활성 테마에 `themeTypographyDefault(theme)`를
적용하고(사용자 override가 이기며, 미설정 역할은 base로 폴스루), 카탈로그 폰트는 테마 활성 시
온디맨드 로드. 따라서 이 작업은 **데이터 레지스트리를 완성**하는 것이지 새 메커니즘이 아니다.

## 결정

남은 5개 테마에 각 정체성에 맞는 역할→폰트 매핑을 추가한다(카탈로그 google 폰트만). 미설정
역할은 의도적으로 base로 둔다(색상 기본값과 대칭, DR-088). 선택 근거:

| 테마 | 정체성(hint) | display | body | mono | 근거 |
|---|---|---|---|---|---|
| aurora | premium dark glass + gradient (기본 테마) | manrope | — | — | Manrope의 모던·약간 기하학적 고급감이 글래스 프리미엄과 맞음; 본문은 중립적 Inter 유지 |
| vivid | max playful dark | archivo-black | nunito | — | Archivo Black로 강한 펀치감 제목; Nunito 라운드 본문이 경쾌함 유지 |
| mono | Linear-grade sharp monochrome | dm-sans | — | ibm-plex-mono | DM Sans의 샤프한 기하학 제목; mono 역할에 IBM Plex Mono로 기술적 정체성 강조; 본문은 Linear의 실제 서체인 Inter 유지 |
| forest | calm emerald dark | source-serif-4 | work-sans | — | Source Serif 4의 차분한 에디토리얼/유기적 온기; Work Sans(휴머니스트) 본문이 자연스러움 |
| daylight | clean light, sky accent | raleway | — | — | Raleway의 가볍고 우아한 톤이 밝고 맑은 정체성과 맞음; 본문 Inter 유지 |

전체 엔트리를 `THEMES` 레지스트리 순서(dark: aurora·vivid·mono·noir·forest·sunset·ocean →
light: daylight·paper·webtoon)로 재정렬해 "10개 모두 커버"를 한눈에 감사 가능하게 한다.

**회귀 가드:** `catalog.test.ts`에 "모든 등록 테마는 비어있지 않은 타이포그래피 정체성을
가진다"는 테스트를 추가 — 새 테마가 폰트 없이 배포되면 CI fail. 기존 검증(카탈로그 id +
google source)은 신규 엔트리에 자동 적용.

## 트레이드오프 / 결과

- (+) 10개 테마 전부가 의도된 타입 정체성을 갖고, 테마 전환 시 폰트가 온디맨드 로드된다.
- (+) 타입/직렬화/serializer 변경 0(DR-088 리터럴-var 아키텍처 유지). 데이터 추가뿐.
- (+) 완결성 테스트가 향후 테마 추가 시 폰트 누락을 강제 차단(Rule 6 데이터 레지스트리 규율).
- (−) 폰트 선택은 주관적 디자인 판단 — 사용자/디자인팀이 picker로 언제든 override 가능하므로
  잠금이 아니라 "좋은 기본값". 향후 design-review에서 큐레이션 미세조정 가능.
- (−) Korean-우선 테마(webtoon/noir는 noto-sans-kr/black-han-sans)와 달리 신규 5개는 라틴
  중심 — 한국어 본문 비중이 큰 경우 사용자가 본문 역할을 한국어 폰트로 override(picker 지원).

## Rule 6 / 라이브러리 경계

- 데이터 레지스트리(테마명 → 역할맵)에 엔트리 추가 — 분기 없음. 테마 추가 = 한 줄.
- `theme-typography-defaults.ts`는 apps/web 측(카탈로그 의존)이라 design-system 패키지
  purity에 영향 없음(DR-088: design-system은 apps/web 카탈로그에 의존 불가 → 분리 유지).

## 검증

`apps/web` typecheck(`tsc --noEmit`) 클린. `catalog.test.ts` 18 tests 통과 — 신규
완결성 테스트("모든 등록 테마는 비어있지 않은 타이포그래피 정체성") + 기존 카탈로그-id/
google-source 검증이 신규 5개 엔트리(manrope/archivo-black/nunito/dm-sans/ibm-plex-mono/
source-serif-4/work-sans/raleway)에도 적용돼 통과. biome 변경 2파일 클린.

한계: 테마 전환 시 실제 폰트 온디맨드 로드의 브라우저 확인은 no-network 샌드박스에서
e2e networkidle가 막혀 단위(데이터 계약) 검증으로 대체 — 로드 배선 자체는 DR-087/088에서
기검증.
