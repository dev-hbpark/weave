# WI-198 — NestedFrame 서브트리 memo (드래그 다량 아이템 60fps)

- 상태: DONE (2026-06-12)
- 출처: WI-197 후속 (features/canvas-render-perf/ENGINEERING_PLAN.md
  § Phase 5). 사용자 "후속 진행부탁해".
- 선행: WI-197 (카메라 핫패스 — 줌/팬은 해결), WI-058 (컬링 —
  페인트만 바운드), DR-017 Phase 4 (FrameMoveBinding 제스처)

## 문제

아이템 드래그는 pointermove마다 `commitFrame` → `weave.item.update` →
doc 변경 → DesignPage/FrameStage 리렌더 → **NestedFrame 전체 트리
재조정**. `NestedFrame`에 memo가 없어 드래그 프레임 비용이 아이템 수에
정비례한다 (WI-197이 잡은 카메라 경로와 별개의 핫패스).

## 사전 분석 (memo 성립 조건)

- **구조 공유 확인**: `@agocraft/core` `applyPatch`→`mapItemDeep`은
  path-copy — 변경 경로의 조상만 새 identity, 형제는 ref 유지. ✓
- **memo를 깨는 불안정 prop 전수 목록** (드래그 틱마다 identity 변경):
  1. `doc` prop — 틱마다 새 문서 (설계상 불가피). 단 NestedFrame의
     doc 소비는 전부 **이벤트/rAF 시점**(onClick·toggle·resolveHandles)
     이고 렌더 출력에는 안 쓰임 → ref-컨텍스트로 전환 가능.
  2. DesignPage 인라인 람다: `onToggleSelect`/`onDropAdd`/`onDragOver`/
     `onCommitFrame` + 비-useCallback `handleUpdateItem`/`updateItem`/
     `renderFrameMenu`.
  3. FrameStage `handleFrameContextMenu` — deps에 `props.document`.
  4. FrameStage `handlePickLayer` — deps `[props]` (렌더마다 새 함수)
     → `wrappedRenderFrameMenu` 연쇄 불안정.
  5. `useFrameFocus`의 `dimmedFrameIds`/`isolatedFrameIds` — deps
     `[focused, document]`라 포커스 꺼진 평상시에도 틱마다 `new Set()`.
- **안정 확인된 prop**: `selectedIds`(useEditorVM 스냅샷 캐시),
  `roles`/`hit`(editorModeFor 레지스트리 싱글턴), `onSelect`
  (setSelectedFrameId), `artboardId`/`editing`/치수.

## 계획

- **P1 — 안정화 인프라**:
  - `DocRefContext` (ref-컨텍스트): FrameStage가 최신 doc을 ref로
    공급, NestedFrame은 이벤트/rAF 시점에 `docRef.current` 읽음.
    `doc` prop 제거. (이벤트 시점 doc이 렌더 스냅샷보다 항상 최신 —
    정확성도 개선.)
  - `useStableHandler` (latest-ref 래퍼, defined-ness에만 identity
    의존): FrameStage가 NestedFrame으로 내려보내는 모든 함수 prop을
    호출자(DesignPage) 위생과 무관하게 안정화. FrameStage가 핫패스
    계약을 소유.
  - `handleFrameContextMenu`/`handlePickLayer`/`wrappedRenderFrameMenu`
    deps 정리 (docRef / onSelect / rfm latest-ref).
  - `use-frame-focus`: 모듈 상수 EMPTY 셋 반환 (포커스 비활성 시).
- **P2 — `React.memo(NestedFrame)`**: 기본 얕은 비교. 재귀 참조도
  memo 버전 사용. 드래그 틱당 리렌더 = 루트→드래그 아이템 경로만.
- **P3 — 측정**: `canvas-zoom-fps-perf.spec.ts`에 drag 버스트 추가
  (page.mouse 드라이브 + in-page rAF 샘플러 동시 실행, 기존
  zoom/pan과 동일 PERF:: 출력). 변경 전/후 비교.
- **P4 — SVL**: typecheck/lint/gates/test/build + 드래그·선택 관련
  e2e 서브셋 (frame-move-snap, selection-follows-drag, multi-drag,
  frame-manipulation, editor-mode-hit, canvas-cull, fit-camera).

## 리스크

- memo + 이벤트-시점 doc 읽기: 클로저가 옛 doc을 캡처하는 버그 클래스를
  ref-컨텍스트가 원천 제거하지만, doc을 **렌더 시점**에 읽는 코드가
  NestedFrame에 추가되면 memo로 stale 렌더가 된다 — 코드 주석으로 가드.
- `selectedId`/`selectedIds` 변경 시 전체 프레임 리렌더는 유지(제스처당
  1회, 틱당 아님) — 허용. 후속 최적화 여지로만 기록.

## 구현 (P1+P2)

- `apps/web/src/document/interactions/doc-ref-context.ts` (신규) —
  `DocRefContext`: FrameStage가 안정 ref 객체 1개를 공급하고 매 렌더
  `.current`만 갱신. NestedFrame의 `doc` prop **제거** — 모든 doc 소비가
  이벤트/rAF 시점이므로 ref 읽기가 렌더 스냅샷보다 항상 최신(정확성도 개선).
  렌더 출력에 ref를 읽는 것은 금지(파일 헤더 RULE 주석).
- `apps/web/src/pages/frame-stage/use-stable-handler.ts` (신규) —
  latest-ref 래퍼. identity는 defined-ness에만 의존, 호출은 항상 최신
  콜백으로 포워딩. FrameStage가 NestedFrame으로 가는 10개 함수 prop 전부를
  래핑(onSelect/onToggleSelect/onUpdateItem/onUpdateShape/onRemoveShape/
  onDropAdd/onDragOver/onCommitFrame/onSelectHotspot/onCommitHotspotRegion)
  — DesignPage 호출자 위생과 무관하게 FrameStage가 핫패스 계약 소유.
- `FrameStage.tsx` — `DocRefContext.Provider` 최외곽 래핑;
  `handleFrameContextMenu` deps에서 `props.document` 제거(docRef 경유),
  `handlePickLayer` deps `[props]`→`[onSelect]`, `wrappedRenderFrameMenu`는
  rfm latest-ref + `pickerCtx`에만 키. 기존 중복 `docRef` 선언(페이지 핏
  effect 옆) 1개 제거 — WI-198 선언으로 통합.
- `use-frame-focus.ts` — 포커스 비활성 시 모듈 상수 `EMPTY_IDS` 반환
  (틱마다 `new Set()` identity 변경이 memo를 깨던 것 수정).
- `NestedFrame.tsx` — `doc` prop 제거(인터페이스/destructure/재귀 전달),
  4개 doc 읽기 사이트를 `docRef?.current`로 전환(onClick toggle·hit 해석,
  resolveHandles constraints·noCanvasHandles), **`export const NestedFrame
  = memo(NestedFrameImpl)`**. impl 이름을 다르게 둔 것은 의도적 —
  `memo(function NestedFrame(){…})`였다면 내부 재귀 `<NestedFrame>`이
  함수표현식 자기 이름에 바인딩되어 **비-memo 버전으로 재귀**했을 것.

## 측정 (P3 — canvas-zoom-fps-perf.spec.ts에 drag 버스트 추가)

drag 버스트 = page.mouse 90 moves(신뢰 포인터 이벤트 → FrameMoveBinding,
매 pointermove가 `weave.item.update` 커밋) + in-page rAF 샘플러 동시 실행,
window 플래그로 종료. 168 아이템, CPU ×4 스로틀, 동일 PERF:: 출력.

| drag | memo OFF (baseline) | memo ON | Δ |
|---|---|---|---|
| frame mean | 66.12 ms | **16.38 ms** | **−75.2%** (60fps 예산 17ms 진입) |
| frame p95 | 360.9 ms | 55.2 ms | −84.7% |
| ScriptDuration | 32 521 ms | 5 881 ms | −81.9% |
| LayoutCount | 207 | 208 | 동일 (레이아웃은 원래 바운드) |

- 반복 런: mean 16.13 / p95 53.4 / script 5585 — 안정.
- baseline은 memo 한 줄만 끈 상태(P1 안정화 포함) — P1 단독으로는
  리렌더가 안 막히므로 ≈ 변경 전 동작. max(~420ms) 스파이크는 제스처
  시작 1프레임(선택 set + 첫 커밋 전체 렌더)으로 양쪽 동일.
- zoom/pan은 WI-197 수치 범위 유지 (mean 13.7–14.8 / 14.2–17.1).

## SVL (2026-06-12)

- typecheck ✓ / biome ✓ / `pnpm gates` ✓ (declarative·purity·inheritance·
  mode-boundary 전부 OK) / unit 1228/1228 ✓ / build ✓
- e2e 서브셋: frame-move-snap·selection-follows-drag·multi-drag·
  frame-manipulation·editor-mode-hit·canvas-cull·fit-camera·
  page-camera-fit·space-pan → **15 passed / 1 failed**.
- 실패 1건 = `frame-move-snap.spec.ts:48` (정렬 스냅 가이드 visible) —
  **선재 실패(WI-198 무관) 확증**: 깨끗한 HEAD(ec5138e, WI-197/198 이전)
  worktree에서 동일 assertion으로 실패 재현. memo OFF로도 동일 실패.
  같은 파일의 grid-snap 가이드 테스트(:91)는 green → SnapFeedbackLayer/
  store/binding 파이프라인 자체는 정상, **frame-간 정렬 후보 경로만**
  죽어 있음. 후속 WI로 분리 필요 (스냅 자체 회귀 — 별도 조사).
  → **WI-200 / DR-129로 근치 완료** (셀렉션 툴바 포인터 인터셉트 —
  스냅 코드 자체는 무결했음).

## 로그

- 2026-06-12 — WI 생성. 구조 공유 + 불안정 prop 전수 분석 완료.
- 2026-06-12 — P1–P4 완료, DONE. 드래그 프레임 평균 66.12→16.38ms(−75%),
  60fps 예산 진입. 선재 frame-move-snap 정렬 가이드 실패 발견·격리.
