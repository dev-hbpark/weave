# WI-217 — 평면 scene 렌더러 + 호스트 순수화(NestedFrame 제거, 셀렉션 크롬 scene화)

- **Status:** IN PROGRESS · 2026-06-14
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
- **S3 · 셀렉션 크롬 순수화(다음)**
  - [ ] 도메인 뷰모델 + SelectionLayer를 `resolveHandleGeometry(scene)`/`hitTestScene`로 전환.
  - [ ] DOM 측정 헬퍼(readBoxGeom/readFrameScreen/frameGeom/flexLines-DOM/zoom복원) 삭제.
  - [ ] `findFramesAtPoint`→엔진 `hitTestScene`. 텍스트 composeTextBounds→scene. 카브아웃: echarts datum.
- **S4 · Decommission Sweep**
  - [ ] grid-spec.ts/grownGridSpec/enforceGridCapacity 배선/cascadeReflowFromSiblingPatches/normalizeLayoutSpec
        제거(엔진이 흡수). derive-text-auto-resize→layoutChildForContentAuto 재배선. 테스트 이관, green.
- **S5 · 검증·통합**: e2e + WEAVE_PERF=1(WI-197/198 기준) + main 통합.

## Acceptance

- 위치/핸들 지오메트리 weave 계산 0. DOM 측정 0(텍스트 intrinsic·echarts 카브아웃 제외).
- 회전 프레임 hit/핸들 정확(라이브). 퍼포먼스 회귀 없음.

## Progress

S2 DONE(스모크 검증). 다음 S3.
