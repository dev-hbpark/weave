# WI-138 — 모든 기존 테마에 폰트 정체성(타이포그래피 기본값) 적용

- **Status:** Done · **DR:** DR-090 · **Relates:** WI-136, DR-088(역할 토큰/테마별 override), DR-087(카탈로그/로더), DR-089(google 번들 스냅샷)

## Problem

테마 레지스트리(`@weave/design-system` `THEMES`)에는 10개 테마가 있는데,
`THEME_TYPOGRAPHY_DEFAULTS`(WI-136 Phase 3)는 **5개**(paper/webtoon/noir/sunset/ocean)만
폰트 정체성을 가졌다. 나머지 **5개(aurora·vivid·mono·forest·daylight)**는 폰트 기본값이
없어 전부 base(Inter/JetBrains Mono)로만 보여, "테마마다 적절한 폰트" 경험이 절반만 동작.
(배선 자체는 `use-theme-typography.ts`가 이미 `themeTypographyDefault(theme)`를 적용 →
데이터만 비어 있었음.)

## Change (데이터 레지스트리 완성 + 회귀 가드)

- `theme-typography-defaults.ts`에 누락 5개 테마의 역할→폰트 매핑 추가(카탈로그 google
  폰트만, 온디맨드 로드). 전체를 `THEMES` 레지스트리 순서로 재정렬해 10개 커버를 한눈에 감사 가능:
  - **aurora**(premium dark glass) → display `manrope`
  - **vivid**(max playful dark) → display `archivo-black`, body `nunito`
  - **mono**(Linear-grade sharp mono) → display `dm-sans`, mono `ibm-plex-mono`
  - **forest**(calm emerald dark) → display `source-serif-4`, body `work-sans`
  - **daylight**(clean light, sky accent) → display `raleway`
- `catalog.test.ts`: **모든 등록 테마가 비어있지 않은 타이포그래피 정체성을 가진다**는
  테스트 추가(신규 테마가 폰트 없이 배포되는 것을 CI에서 차단). 기존 검증(카탈로그 id +
  google source)은 신규 엔트리에도 그대로 적용.

## Acceptance

- `THEMES` 10개 전부 `THEME_TYPOGRAPHY_DEFAULTS`에 비어있지 않은 엔트리. ✔
- 신규 엔트리 폰트가 카탈로그 id + google source(온디맨드 로드 가능). ✔
- 미설정 역할은 base로 폴스루(타입/직렬화 변경 0, DR-088 패턴 유지). ✔
- catalog typecheck + test 그린; Rule 6 / 라이브러리 purity 게이트 영향 없음. ✔

## Links

- DR-090 · `apps/web/src/document/fonts/theme-typography-defaults.ts` · `apps/web/src/document/fonts/catalog.test.ts`
