# WI-217 — 평면 scene 렌더러 + 호스트 순수화(NestedFrame 제거, 셀렉션 크롬 scene화)

- **Status:** IN PROGRESS (S2+S3 done) · 2026-06-14
- **Decision:** DR-138 (pairs agocraft DR-054/WI-041)
- **Driver:** 운영자 — NestedFrame 제거 + 셀렉션/핸들 바닐라화 + 뷰모델은 그리기만.

## Goal

엔진 `computeScene`/`resolveHandleGeometry`(agocraft WI-041)를 소비해 weave를 순수 렌더/그리기 계층으로
전환. 위치계산·DOM측정 제거.

## 단계 (빅뱅 브랜치 `refactor/layout-scene-engine`)

- **S2 · 재vendor + 평면 렌더러**
  - [x] @agocraft/layout+editor 재vendor rc.20260614000000(3핀 갱신, active-link 검증, 하위호환). 커밋 5d04c43.
  - [x] `SceneFrame.tsx`(단일 엔트리, scene 좌표, 비재귀) + `FrameScene.tsx`(computeScene→평면 맵) 신설.
  - [x] `FrameStage` 배선(frames.map(NestedFrame)→`<FrameScene/>`), `NestedFrame.tsx` 삭제. 커밋 06b2a17.
  - [x] weave 타입체크 + biome 클린 + 단위 1377/1377 green + **라이브 스모크 검증**(에디터 마운트·페이지
        프레임 절대좌표 정확·JS 예외0).
- **S3 · 셀렉션 크롬 순수화 (DONE — 3커밋, 라이브검증)**
  - [x] **S3-1**(3b5593f): 기본 변형 핸들(리사이즈8+회전)+셀렉션 아웃라인+잠금배지를 엔진
        `resolveHandleGeometry`로 — 회전인지 design px, 라이브 `[data-design-plane]` rect로 viewport 투영.
        아웃라인=회전 rect placement(hideOutline+SelectionLayer `interactive` 플래그 신설, 박스-스팬
        아웃라인이 클릭 가로채는 회귀 차단). `SceneFrame`에 designWidth/Height 전달.
  - [x] **S3-2**(f630317): `findFramesAtPoint`를 엔진 `computeScene`+`hitTestScene`로 위임(동일 시그니처,
        호출부 2곳 무변경). 자체 비율수학(composeAbsolute/AABB) 제거 → 회전 프레임 hit/레이어피커 정확.
        hit-test.test.ts 9 green 유지(패리티).
  - [x] **S3-3**(e196307): freeform 핸들(poly-vertex/코너반경/레이아웃에딧)을 scene-geom 버스
        (`chrome-geom.ts` — FrameScene가 매 렌더 design-px 지오메트리+직속자식 링크 발행; viewport
        투영은 design-plane rect 라이브 읽기)로 전환. poly `frameGeom`=버스 θ+bounds, 코너반경
        `boxGeomFromScene`, 레이아웃 `frameScreenFromScene`+`childBoxesFromScene`. 차트는 이미 ctx.bounds
        (S3-1) 사용. **모두 DOM 폴백 유지**(no-publish 시 무회귀). `recoverUnrotatedSize` 사용처 소멸→제거.
  - **카브아웃(의도)**: ① 텍스트 자동너비/높이 chrome=라이브 콘텐츠 DOM 측정(엔진은 글리프 미측정—
        승인된 측정 카브아웃) ② hotspot 영역 드래그의 parent rect 읽기(별개 기능, S3 범위 외).
  - **검증**: `e2e/selection-chrome-rotation.spec.ts` 4 테스트(networkidle 회피)=핸들 회전코너·코너반경
        회전그립·레이아웃에딧 라인·레이어피커, 전부 green·페이지예외0. tsc/biome 클린, 단위 1374 green.
- **S4 · Decommission Sweep**
  - [ ] grid-spec.ts/grownGridSpec/enforceGridCapacity 배선/cascadeReflowFromSiblingPatches/normalizeLayoutSpec
        제거(엔진이 흡수). derive-text-auto-resize→layoutChildForContentAuto 재배선. 테스트 이관, green.
- **S5 · 검증·통합**: e2e + WEAVE_PERF=1(WI-197/198 기준) + main 통합.

## Acceptance

- 위치/핸들 지오메트리 weave 계산 0. DOM 측정 0(텍스트 intrinsic·echarts 카브아웃 제외).
- 회전 프레임 hit/핸들 정확(라이브). 퍼포먼스 회귀 없음.

## Progress

S2 DONE(스모크 검증). **S3 DONE**(S3-1 핸들/아웃라인 + S3-2 hit-test + S3-3 freeform 버스, 3커밋,
라이브검증 4 e2e). 다음 **S4**(엔진이 흡수한 grid-spec/enforceGridCapacity/cascade/normalizeLayoutSpec
배선 제거 — agocraft 측은 이미 흡수, weave 잔여 배선 정리) → S5(perf 회귀확인 + main 통합).
