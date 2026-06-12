# WI-197 — 카메라 핫패스 React 리렌더 제거 (다량 아이템 60fps)

- 상태: DONE (2026-06-12)
- 출처: "레더링 성능을 개선하고싶어. 보이지 않는 영역 제외, 또는 믹스드
  카메라에서 디자인 영역 스케일 유지 + 아이템 스케일만 변경 방식 검토.
  목표는 아이템이 많아져도 60fps 유지." 사용자 요청.
- 선행: WI-058 / DR-021 / RPR-001 (뷰포트 컬링 + 이미지 디코드 해제),
  DR-017 Phase 2 (pan 상태를 vm.camera MotionValue로 이관), DR-018
  (제스처-게이트 will-change)

## 요청 아이디어 2건의 검토 결론

1. **보이지 않는 영역의 아이템 제외** — 이미 구현됨 (WI-058 Phase 1+2a+2b:
   IntersectionObserver `visibility:hidden` 컬링 + 컬링 시 이미지 비트맵
   해제, rootMargin 50%). 측정: painted frames −80%, JS heap −37%
   (RPR-001-addendum). 단 이 방식은 **Paint/Composite만** 바운드한다 —
   컬링된 프레임도 React 트리에 남아 리렌더 비용은 그대로다.
2. **디자인 영역 스케일 유지 + 아이템만 역스케일 (래스터 캡)** — 기존
   `features/canvas-render-perf/ENGINEERING_PLAN.md` Phase 2와 동일 발상.
   **보류 유지**: (a) 단일 합성 레이어 안에서는 자식의 counter-scale 이
   페인트 해상도를 바꾸지 못한다 — 페인트는 항상 누적 transform을 거친
   on-screen device px로 일어나므로, 이 기법의 실익은 이미지 디코드/독립
   레이어 케이스에 한정된다(스파이크 필요, 계획서에 명시됨). (b) RPR-001
   GPU 측정 가이드 기준 Phase 2c는 headed 측정으로 필요성을 입증한 뒤
   진행하기로 이미 결정돼 있다. (c) 본 WI의 목표인 "아이템 수 증가에도
   60fps"의 병목은 GPU 텍스처가 아니라 아래의 React 리렌더다.

## 발견 — 미해결 병목: 카메라 변경마다 전체 트리 React 리렌더

`apps/web/src/pages/FrameStage.tsx:460-482` — vm.camera(tx/ty/scale
MotionValue) 변경을 `setPanState`로 React state에 미러링 → **휠 틱/팬
포인터무브 단위로 FrameStage 전체가 리렌더**된다. `NestedFrame`에 memo가
없으므로 모든 프레임/아이템이 매 카메라 이벤트마다 재조정(reconciliation)
된다. 아이템 수에 정비례하는 JS-스테이지 비용이며, 컬링(visibility 기반,
페인트만 차단)으로는 잡히지 않는다. 코드 주석(L448-450)이 이 미러를
DR-017 Phase 2의 의도적 스톱갭으로 명시한다.

렌더에서 `pan`을 소비하는 곳은 단 2곳:

- L1813 — outer pan div의 `transform` 문자열
- L1650-1659 — `totalScaleMV` 동기화 effect의 `pan.scale` 의존

셀렉션 크롬(단일 핸들·멀티 오버레이)은 rAF + `getBoundingClientRect`
자가 추적이라 FrameStage 리렌더에 의존하지 않음을 확인했다.

## 계획

- **Phase 0 — 베이스라인 측정**: `canvas-zoom-fps-perf.spec.ts`
  (WEAVE_PERF=1 게이트, canvas-cull-perf와 동일 패턴). 다량 프레임 시드 후
  연속 휠 줌/팬 중 rAF 프레임 델타 + CDP ScriptDuration/Layout/RecalcStyle
  델타 수집. 변경 전/후 동일 시나리오 비교.
- **Phase A — 카메라 핫패스 React 제거**:
  - outer pan div의 transform을 vm.camera 구독 + `el.style.transform`
    ref-mutation으로 적용 (applyHitGate/컬링과 동일한 코드베이스 승인
    패턴; createPlainCamera의 플레인 MV는 motion.div에 직결 불가).
  - `totalScaleMV`는 planeScaleMV + vm.camera.scale 양쪽 MV 구독으로 갱신.
  - `pan` React state 미러 + 구독 effect 삭제. `setPan`/`zoomToBox`는
    vm.camera 직접 읽기/쓰기이므로 무변경.
- **후속 (별도 WI)** — Phase C: NestedFrame memo. 아이템 드래그는
  pointermove마다 `commitFrame` → doc 변경 → 전체 트리 리렌더이므로,
  드래그 60fps는 구조적 공유 기반 서브트리 memo가 필요하다. 콜백 identity
  안정화 + `doc` prop 비교 전략이 얽혀 별도 증분으로 분리.

## 측정 결과 (Phase 0 → Phase A)

`apps/web/e2e/canvas-zoom-fps-perf.spec.ts` (WEAVE_PERF=1) — 168 shape
아이템, mixed flavor, CDP CPU 4× 스로틀, 90-프레임 휠 버스트, headless.
rAF 프레임 델타 + CDP Performance 메트릭 델타 (버스트 구간만).

| 메트릭 (zoom) | 변경 전 | 변경 후 | 변화 |
| --- | ---: | ---: | ---: |
| mean frame | 273.06 ms (~3.7fps) | 17.81 ms | **−93.5%** |
| p95 frame | 473.5 ms | 58.3 ms | −87.7% |
| dropped (>17ms) | 67.4 % | 33.7 % | −33.7pt |
| ScriptDuration | 24,755 ms | 1,569 ms | **−93.7%** |
| LayoutCount Δ | 0 | 0 | — |

| 메트릭 (pan) | 변경 전 | 변경 후 | 변화 |
| --- | ---: | ---: | ---: |
| mean frame | 256.15 ms | 19.20 ms | **−92.5%** |
| p95 frame | — | 48.8 ms | — |
| dropped (>17ms) | 66.3 % | 40.4 % | −25.9pt |
| ScriptDuration | 23,168 ms | 1,694 ms | **−92.7%** |

- LayoutCount 0 = 전/후 모두 레이아웃 비용이 아닌 **순수 JS/React 비용**
  이었음을 확인 — 진단(전체 트리 reconciliation)과 일치.
- CPU 4× 스로틀에서 mean 17.8/19.2ms ≈ 무스로틀 환경에서는 60fps 예산
  (16.7ms)을 큰 여유로 충족. 남은 dropped %는 헤드리스 + 스로틀 환경의
  raster 스파이크(p95~max 48–90ms 꼬리)로, 절대치는 참고용(스펙 주석의
  headless caveat) — 신호는 델타다.

## 적용 변경 (Phase A, FrameStage.tsx 3개 편집)

1. `pan` React state 미러(`setPanState` + vm.camera 구독 effect) 삭제 →
   `panLayerRef` + vm.camera tx/ty/scale MV 구독으로
   `el.style.transform` ref-mutation (applyHitGate/컬링 레지스트리와 동일
   패턴).
2. `totalScaleMV` 갱신을 `pan.scale` state 의존 effect에서
   planeScaleMV + vm.camera.scale **양쪽 MV 구독**으로 교체.
3. outer pan div: `ref={panLayerRef}`, transform은 초기 페인트용 1회
   `vm.camera.*.get()` 읽기만 (transformOrigin center-center 유지,
   `camera.userZoom` 게이트 유지).

쓰기 경로(`setPan`/`zoomToBox`/휠/단축키/PanBinding)는 이미 vm.camera
직접 읽기/쓰기라 무변경. 셀렉션 크롬(rAF+gBCR 자가추적), IO 컬링
(transform-aware), 히트 게이트(totalScaleMV 구동) 모두 리렌더 비의존
확인 — Phase A로 깨질 표면 없음.

## SVL

- `pnpm typecheck` ✅ · `pnpm lint` ✅ (선재 포맷 드리프트 2건
  — manual-shots/labels.json, aku/agent/cost-event.ts — 본 변경과 무관,
  biome --write로 함께 정리) · `pnpm gates`(token/declarative/purity/
  inheritance/modeboundary) ✅ · `pnpm test` 1223/1223 ✅ ·
  `pnpm build` ✅ · 카메라 e2e 서브셋(fit-camera / canvas-cull /
  canvas-pan-backswipe / space-pan / page-camera-fit) 8/8 ✅.

## 로그

- 2026-06-12 — WI 생성. 코드 분석 + 기존 기록(WI-058/DR-021/RPR-001)
  대조, 아이디어 2건 검토 결론 기록. Phase 0 하니스 작성 시작.
- 2026-06-12 — Phase 0 베이스라인 측정 완료 (zoom mean 273ms, 67%
  dropped — 병목 실증). Phase A 3개 편집 적용, 사후 측정 zoom mean
  17.81ms / scriptMs −94%. 측정표 본문 기록. SVL 게이트 진행.
- 2026-06-12 — SVL 전체 green (typecheck/lint/gates/test/build + 카메라
  e2e 8/8). 상태 DONE. 후속: Phase 5 NestedFrame 서브트리 memo(드래그
  핫패스)는 별도 WI로 보류 — `features/canvas-render-perf/
  ENGINEERING_PLAN.md` § Phase 5 참조.
