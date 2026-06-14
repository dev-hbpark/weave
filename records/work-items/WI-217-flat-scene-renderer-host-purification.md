# WI-217 — 평면 scene 렌더러 + 호스트 순수화(NestedFrame 제거, 셀렉션 크롬 scene화)

- **Status:** DONE (S2–S5) · 2026-06-14 · main 통합(weave b43edcd / agocraft f789121, push 보류)
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
- **S4 · Decommission Sweep (DONE — 정밀감사로 범위 정정)**
  - **감사 결론(중요)**: S4 계획이 over-scope였음. 6정책 중 실제 제거가능=①②뿐. ③④⑤는 *중복 아닌
    load-bearing*(엔진 디스패처/가드/브리지), ⑥은 의도 카브아웃 — 삭제하면 회귀.
  - [x] **① grid track ⌈√n⌉ de-dup**: weave `layout/grid-spec.ts`(gridDimsForChildCount/gridSpecForChildCount)는
        엔진 export와 **byte-identical** → 파일+테스트 삭제, 2 importer(commands setLayout·design-root insertable)를
        `@agocraft/layout`로 재지정. (엔진이 동일 함수 테스트 보유.)
  - [x] **② grid auto-grow → 엔진 위임**: weave `grownGridSpec`(≡엔진 `grownAutoGridSpec`, byte-identical) +
        수동 pre-grow 블록 제거. `onChildAdd({growToFit: enforceGridCapacity})`로 위임, 엔진의 `parentPatch`를
        gridGrowPatch로 사용(엔진이 grown 스펙 소유·item.layout 반환). 동작 동일.
  - **유지(load-bearing/carve-out, 삭제 금지)**: ③ `cascadeReflowFromSiblingPatches`=DR-053 이후 *얇은
    디스패처*(엔진 reflowSubtree를 nested 컨테이너마다 재진입; 엔진은 1레벨/호출이라 호스트 와이어 필요).
    ④ `normalizeLayoutSpec`=에이전트 부분스펙 방어가드(엔진은 read시 padding 무가드 → 크래시 방지).
    ⑤ `derive-text-auto-resize`=레거시 3모드↔엔진 2축 브리지(툴바/렌더 의존; 2축 마이그레이션은 별도 대공사).
    ⑥ min/0면적 가드=의도 카브아웃.
  - **검증**: tsc/biome 클린, 단위 1368 green(−6=삭제된 grid-spec 테스트). grid auto-grow는
    `commands-layout-relayout.test.ts`가 권위검증(2×2→3컬럼 grow + item.layout 패치 + no-grow 케이스 +
    nested cascade, 전부 실엔진 경유). 라이브 스모크=selection-chrome-rotation 4 e2e(add/setLayout 경로) green.
- **S5 · 검증·통합 (DONE)**
  - **Perf**: WI-197(카메라 zoom=ref-mutation, React 재렌더 0 — 미변경) / WI-198(드래그 memo 보존)
    핫패스 무영향. scene-geom 버스 발행은 FrameScene 렌더(문서변경)에서만 — zoom 경로 미진입. geomMap/
    childrenMap O(N) 빌드는 드래그 커밋당 ~수백 op(<0.1ms). **라이브 camera-glue 스모크**(ctrl+wheel zoom 후
    핸들이 새 스케일의 SE 코너로 재투영, <12px)=green. **권위 FPS 스펙(canvas-zoom-fps-perf/canvas-cull-perf)은
    prepareDesign networkidle로 샌드박스 실행불가 → CI에서 측정 필요(잔여).**
  - **e2e**: selection-chrome-rotation 5 테스트 green. 전체 e2e 스위트는 networkidle 차단으로 샌드박스 비실행
    (기준선 아님 — 메모리 기록).
  - **통합**: agocraft/weave 각 `refactor/layout-scene-engine`→main fast-forward(agocraft 3커밋 f789121,
    weave 8+커밋). agocraft 단위 layout 303+editor 191 green 재확인. 외부레포(100_hackathon) 서브모듈
    포인터 bump 커밋 완료. **origin push는 운영자 몫**(로컬 main까지만 진행).

## Acceptance

- 위치/핸들 지오메트리 weave 계산 0. DOM 측정 0(텍스트 intrinsic·echarts 카브아웃 제외).
- 회전 프레임 hit/핸들 정확(라이브). 퍼포먼스 회귀 없음.

## Progress

S2 DONE(스모크 검증). **S3 DONE**(S3-1 핸들/아웃라인 + S3-2 hit-test + S3-3 freeform 버스, 3커밋,
라이브검증 4 e2e). **S4 DONE**(범위정정: ①grid-spec de-dup + ②grid-grow 엔진위임만 제거가능, ③④⑤⑥은
load-bearing/carve-out 유지; 단위 1368 green, commands-layout-relayout 권위검증). 다음 **S5**(WEAVE_PERF
회귀확인 + main 통합).
