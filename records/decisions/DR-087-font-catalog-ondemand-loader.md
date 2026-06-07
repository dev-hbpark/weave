# DR-087 — 폰트 카탈로그 레지스트리 + 온디맨드 로더 (정적 벌크 링크 폐기)

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: WI-136, `features/theme-typography/ENGINEERING_PLAN.md`, DR-088(테마 타이포그래피)
- 대체: WI-023 Phase 16의 하드코딩 `FONT_FAMILY_PRESETS`(6종) + `index.html` 벌크 `<link>`

## 맥락

폰트는 (1) `apps/web/src/document/toolbar/font-presets.ts`에 6종 하드코딩, (2) `index.html`의 단일 거대 Google Fonts `<link>`로 6종을 부팅 시 전부 로드했다. 폰트를 늘리려면 두 파일을 손으로 고쳐야 하고, 안 쓰는 폰트까지 매번 다운로드됐다. "더 다양한 폰트 공급"(WI-136)을 위해 확장 가능한 공급 메커니즘이 필요했다.

## 결정

1. **카탈로그 레지스트리를 SSOT로** — `apps/web/src/document/fonts/catalog.ts`의 `FONT_CATALOG`(한글 포함 큐레이션 ~40종)가 단일 출처. `FONT_BY_ID` / `FONT_BY_STACK` / `FONT_GROUPS`는 전부 파생. 폰트 추가 = 1 엔트리. (Rule 6: source/category 분기는 Map·filter, switch 금지.)
2. **온디맨드 로더** — `fonts/font-loader.ts`. `source → adapter` 레지스트리(`system`=no-op, `google`=`<link>` 1회 주입, id `Set`으로 dedup). 폰트는 선택·미리보기(hover)·재수화 시에만 로드.
3. **정적 벌크 링크 폐기** — `index.html`은 **base 타이포그래피 3종**(`--font-sans`=Inter, `--font-mono`=JetBrains Mono, 한글 base Noto Sans KR)만 첫 페인트용으로 유지. 나머지는 온디맨드.
4. **재수화** — `fonts/rehydrate.ts`가 문서 로드 시 트리를 1회 순회해 사용 중 `fontFamily`(+textRuns) 값을 수집, 카탈로그 폰트를 로드. 적용 지점: `useDesign` 마운트 이펙트(초기 로드) + `replaceDocument`(원격 교체). 세션 중 적용은 picker가 `ensureFontByStack`로 즉시 로드.

## `stack` 안정성 계약

아이템에 저장되는 `attrs.fontFamily`(개별 override)는 카탈로그의 `stack` 문자열이다. round-trip identity를 위해 `stack`은 릴리스 간 **변경 금지**(`buildStack(family, category, korean)`로 결정적으로 생성). 카탈로그에서 폰트를 제거해도 기존 문서의 리터럴 스택은 CSS 폴백으로 계속 렌더된다(무손실 보존).

## 트레이드오프 / 결과

- (+) 폰트 확장이 데이터 1줄. 안 쓰는 폰트 미로드 → 초기 전송량 감소.
- (+) 색상 아키텍처와 대칭(레지스트리 + 온디맨드).
- (−) 카탈로그 외 폰트가 쓰인 구 문서를 재수화 적용 전 경로(예: 일부 클라우드 초기 로드)로 열면 로드 누락 가능 → Phase 5에서 로드 경로 확대.
- (−) hover 미리보기가 첫 진입 시 폰트 로드를 트리거(swap 동안 폴백) — `display=swap`으로 완화.

## 후속

- Phase 5: 재수화 로드 경로를 클라우드 초기 로드까지 확대, picker 검색 UX.
- DR-088: 테마 타이포그래피 역할 토큰 + 사용자 override.
