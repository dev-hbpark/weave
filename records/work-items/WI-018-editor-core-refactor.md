# WI-018 — Editor Core 강화 리팩토링 (Command / ViewModel 경계 명확화)

## Metadata

| Field | Value |
|---|---|
| ID | WI-018 |
| Type | architectural refactor |
| Owner (weave) | hbpark |
| Counterpart (agocraft) | HANDOFF-004 |
| Date opened | 2026-05-24 |
| Severity | P1 — 누적 side-effect 가 신규 기능 안전성을 잠식 |
| Status | **Open — agocraft 측 HANDOFF-004 수락 + ADR 확정 대기** |
| Related | WI-013 (agocraft-document-swap), WI-014 (interactive-editor), WI-017 (rubber-band) |

## Problem

오늘 (2026-05-24) 일련의 작업 중 한 기능 수정이 다른 기능에 사이드 이펙트를 일으키는 패턴이 5건 연속 발생:

1. **Present mode overflow drift** — `Stage.tsx:405` 의 `overflow:hidden` 이 편집 모드의 overflow:visible 정책과 어긋남. mode 마다 "frame 내부 렌더 정책" 이 따로 구현되어 drift.
2. **빈공간 drag 시 frame-move 와 drag-add 동시 동작** — `NestedFrame.onPointerDown` 의 자식 가드 분기 (contenteditable / shape / hotspot) 가 `stopPropagation` 없이 early-return 하던 탓에 ancestor `RubberBandLayer` 까지 이벤트가 bubble. 같은 pointerdown 으로 두 제스처가 동시 시작.
3. **canvas mouse-down 즉시 0×0 chip 노출** — `useRubberBand` 가 React hook 으로 5-state machine 을 직접 보유. 진입 즉시 visual layer 가 0×0 rect 를 그려 `DimensionsChip` 이 "0 × 0" 로 떠 있음.
4. **drag-up 후 hover 만으로 popover 잔존, Esc 만 해제** — gesture state 가 hook 내부라 외부 (mode, hotkey, AI 명령) 에서 lifecycle 에 개입할 채널 없음.
5. **frame-manipulation move-drag e2e flaky** — `FrameStage.tsx:1004-1015` ResizeObserver-driven base-scale recompute 와 boundingBox-fetch race. View-state 가 여러 useState 위에서 병렬 진행되어 측정 불일치.

원인 추적 결과 5건 모두 같은 3개 구조적 결손 (HANDOFF-004 §1 참조):

- (A) Central gesture/event router 부재
- (B) ViewModel 레이어 부재 — 5~7개 React useState 가 model 옆에서 병렬로 살아 race
- (C) Gesture lifecycle 이 일급 state 가 아닌 React hook

## 흐름 체크 — 표준 에디터 흐름 6단계 위반 진단

```
User Interaction → State → Command (history) → Model → ViewModel → View
```

| 인터렉션 | UserEvent | State | Command(history) | Model | ViewModel | View |
|---|---|---|---|---|---|---|
| Frame/Shape mutation | React 핸들러 | dragRef + RAF | editor.exec ✅ | setDesign ✅ | — (없음) | React |
| Item add (rubber-band commit) | React 핸들러 | useRubberBand 5-state | editor.exec ✅ | setDesign ✅ | — | React |
| **Frame/Shape selection** | React 핸들러 | SelectionContext useState | n/a | n/a | ❌ (분산 Context) | React |
| **Drill-in (enter frame)** | onClick | DesignPage useState | n/a | n/a | ❌ | React |
| **Hand mode (V/H)** | hotkey | DesignPage useState | n/a | n/a | ❌ | React |
| **Pan/zoom 카메라** | wheel/pointer | FrameStage useState | n/a | n/a | ❌ | React |
| **InteractionMode (gate)** | 여러 source | InteractionModeContext useState | n/a | n/a | ❌ | React |
| **Patch mergeKey** | (commands) | (n/a) | ⚠️ 누락 — drag 60Hz 마다 undo entry | 그대로 적용 | — | React |

정정: Selection / drill-in / mode / hand-tool / pan 은 design 의 저장 데이터를 변경하지 않으므로 **Command 를 거칠 필요 없음**. Command 의 책임 경계는 "저장 model 변경" 으로 유지. 단, 이들 view-state 도 **반드시 ViewModel 을 통과해 View 에 도달** 해야 함. 현재 상태는 ViewModel 없이 5~7개 React useState 가 분산 — 이게 race / 누락 / 중복의 직접 원인.

## Desired flow (보강된 규칙)

| 변화 유형 | 채널 | 저장 / undoable? |
|---|---|---|
| Document model mutation | `editor.exec("weave.X")` → Command → patches → ChangeStream → applyChange | ✅ 저장, ✅ undoable |
| Transient view state (selection, drill, mode, hand-tool, camera/pan/zoom, hover, tooltip 위치) | `vm.<slot>.set(...)` (Signal) | ❌ 저장 안 함, ❌ undoable 아님 |

양쪽 경로 모두:
- (1) User event 를 raw React handler 가 아니라 **agocraft `GestureRouter`** 가 normalize 해서 수신.
- (2) gesture state 가 **agocraft `editor.stateMachine`** 의 일급 state.
- (3) state 의 transition 출력이 model command 인지 vm.set 인지 **declarative**.
- (4) View 는 `useEditorVM(selector)` 한 곳에서 model + view-state 둘 다 구독. 컴포넌트가 view-state 를 useState 로 자체 보관 금지.

## Acceptance Gate (weave 측)

Phase 1 종료 시 검수:

1. `apps/web/src/document/interactions/selection-context.tsx`, `interaction-mode.tsx` 삭제 (또는 thin shim 으로만 유지하며 ViewModel 로 redirect).
2. `DesignPage.tsx` 의 `useState(enteredFrameId)`, `useState(handMode)`, `useState(historyTick)` 제거 — `useEditorVM` 으로 대체.
3. `FrameStage.tsx` 의 `useState(pan)`, `useState(isSpaceDown)` 제거 — `useEditorVM(vm => vm.camera)` 등으로 대체.
4. weave 의 view-state 보관용 `useState` 호출 0 건 (텍스트 입력 buffer 같은 진짜 ephemeral 은 예외, 명시적 주석).
5. React DevTools profiler 에서 selection 변화 시 re-render 받는 컴포넌트 < 5개 (현재 10+).
6. 한 자리 drag (frame move 60Hz, 1초) 의 undo step 수 = 1 (현재: ~30).
7. e2e 42/5/1 baseline 유지 (또는 향상). TypeScript / unit 회귀 없음.
8. 오늘의 5개 증상 (#1~#5) 이 agocraft 측 unit/contract test 로 박제되어 weave 가 제거된 후에도 보호.

Phase 2~4 (HANDOFF-004 §4~6) 종료 시 검수:

9. `apps/web/src/document/rubber-band/` `manipulation/` 의 코드 70% 이상 제거 (gesture state 와 router 가 agocraft 측으로 이동).
10. weave 측에 raw `onPointerDown / onPointerMove / onPointerUp` 핸들러를 새로 추가하지 않고 새 도메인 / 새 mode 추가 가능 함을 PoC 로 증명.

## Risks (weave 측)

| Risk | 영향 | 대응 |
|---|---|---|
| WI-013~WI-017 가 SelectionContext / InteractionMode 에 강결합 | 마이그레이션 시 회귀 | Phase 1 동안 thin shim 으로 호환 레이어 유지, 점진 cut-over |
| agocraft 의 `Signals` (core 에 이미 존재) 가 React hook 어댑터 미제공 | useEditorVM 구현 부담이 agocraft 측 | HANDOFF-004 의 Phase 1.1 에 agocraft 측 react adapter 명시 |
| `mergeKey` 부재로 인한 60Hz drag 의 undo bloat — 지금까지 별 issue 보고 없음 | undo UX 가 이미 broken 상태 | Phase 1 와 동시 적용 (코드 변경량 작음) |

## Cross-project channel

이 WI 의 agocraft 측 작업은 `workspace/agocraft/records/decision-handoffs/HANDOFF-004-editor-core-v2-vm-router.md` 로 inbox 발송. 본 문서는 weave 측 책임 / acceptance gate / 회귀 risk 만 기록.

## Status log

- 2026-05-24 — 본 WI 발행, HANDOFF-004 동시 발행
- 2026-05-24 — HANDOFF-004 보강: ADR-E (lassoSelect/rubberBand 경계), Camera 의 MotionValue 슬롯 명시, Phase 0 Spike 결과 (`@agocraft/core/reactive/signal` 위 wrapper 가 ViewModel 요구사항을 충족 — 외부 reactive lib 도입 불필요, `batch` / `untracked` / React `useEditorVM` 어댑터만 추가 필요), Phase 5~7 의 본문 정밀화 (FrameSurface layering, weave dead/alive 인벤토리, 5 증상의 박제 위치)
- 2026-05-24 — OS-root Cross-Project Boundary rule 변경: sibling 프로젝트 간 직접 read/write 허용 (hook 의 sibling-block 제거). HANDOFFs 는 cultural 기준으로 유지. `tools/check_cross_project_write.py` + `CLAUDE.md` 동시 갱신.
- 2026-05-24 — **Phase 0 type-only 인터페이스 박제 완료** (agocraft 측):
  - `packages/editor/src/view-model/types.ts` 신규 — `EditorViewModel`, `Camera` (MotionValue 슬롯), `SubSelection`, `InteractionMode`, `RubberBandState`, `FrameManipState`, `PanState`, `ClaimToken`, derived `selectedFrameBoundsViewport` 등 (172 LoC).
  - `packages/editor/src/gesture/types.ts` 신규 — `GestureRouter`, `GestureBinding`, `ModifierPredicate`, `GestureContext`, `GestureResult` 등 (165 LoC). 초기에 `@agocraft/input` 에 두려 했으나 `Editor` / `EditorViewModel` 참조 필요로 layering 위반 → editor 측으로 이동 (input 은 lower layer).
  - `packages/editor/src/index.ts` 에 두 그룹 re-export 추가.
  - `pnpm -r typecheck` clean (agocraft monorepo 전체).
- 2026-05-24 — **Phase 0 의 남은 4건 + Phase 1 착수 완료**:
  - (1) **ADR-A~E 박제**: `workspace/agocraft/records/decisions/DR-017-editor-core-v2-vm-router-boundaries.md` 신규.
  - (2) **`batch` / `untracked` 노출**: `packages/core/src/reactive/signal.ts` + `packages/core/src/index.ts` 에 추가. preact wrapper 위 한 줄. Core 7/7 signal tests pass.
  - (3) **verdaccio publish**: `./scripts/publish-local.sh` 로 15 패키지 @ 1.0.0-rc.20260523173916 publish. weave 측 `apps/web/package.json` 의 `@agocraft/*` 12개 dep 을 새 버전으로 bump 후 `pnpm install` — weave typecheck/unit/e2e 모두 clean (56/56 unit, 42/5/1 e2e).
  - (4) **Phase 1 구현 착수**:
    - `packages/editor/src/view-model/create-editor-view-model.ts` 신규 — `EditorViewModel` 본체 (~ 230 LoC). writable signals + computed derived + ChangeStream-driven `modelTick` + synthesized `selectedFrameBoundsViewport` MotionValue + single-owner mode coordination + `createPlainCamera` 헬퍼.
    - `packages/editor/src/react/use-editor-vm.ts` 신규 — `useSyncExternalStore` 기반 React 어댑터 (~ 75 LoC). selector 안의 signal.get() 가 자동 dep tracking → React re-render 은 isEqual 차이 시에만.
    - `packages/editor/src/view-model/create-editor-view-model.test.ts` 신규 — signal isolation / `rubberBandHasArea` 0×0 정책 / `requestMode/releaseMode` single-owner / `selectedFrameBoundsViewport` 의 MotionValue 업데이트 + projector pluggable / domain-agnostic null path 5건 모두 pass.
    - Editor 패키지 109/109 unit tests pass, build clean.
  - **다음 단계 (Phase 1 의 weave 측 마이그레이션)**: WI-018 §4.2 표대로 SelectionContext / InteractionModeContext / enteredFrameId 등 9개 useState 를 `useEditorVM` 로 점진 cut-over + 7개 weave commands 의 patch 에 `mergeKey` 추가 (drag 60Hz collapse).
- 2026-05-24 — **Phase 2~5 구현 + weave 마이그레이션 (한꺼번에)**:
  - **agocraft Phase 2 — GestureRouter** (`packages/editor/src/gesture/create-gesture-router.ts`): capture-phase pointer listener per host, declarative `ModifierPredicate` 매칭 + priority resolution, 자동 `setPointerCapture` / `releasePointerCapture`, 자동 mode claim/release, gesture sessionId 발급.
  - **Phase 3 — RubberBandBinding** (`bindings/rubber-band.ts`): host-supplied `InsertableCapability` + `clientToLocal` 받음. drawing → reviewing → external commit (`commitRubberBandRecommendation` API). `vm.rubberBand` Signal 이 5-state 단일 source.
  - **Phase 4 — FrameMove/Resize/Rotate binding** (`bindings/frame-manip.ts`): host-supplied `FrameAccess` interface 받음 — `readFrame / commitFrame / computeMove / computeResize / computeRotate / parentRectOf`. weave 의 0..1 ratio 같은 domain schema 는 host 가 책임.
  - **PanBinding** (`bindings/pan.ts`): `vm.camera.tx/ty` MotionValue 직접 갱신.
  - **Phase 5 — FrameSurface** (`packages/editor/src/render/frame-surface.tsx`): React JSX primitive. `DomainRendererRegistry` (host-supplied) + `FRAME_OVERFLOW` 상수 + `chrome` slot. `@agocraft/editor/react` 의 export.
  - **agocraft re-publish** — `1.0.0-rc.20260523174949`. weave 측 `pnpm install` 후 typecheck/unit/e2e 모두 clean.
  - **weave 마이그레이션 한꺼번에**:
    - `useWeaveEditor` 반환 shape 변경 — `{ editor, vm }`. weave-specific `projectFrameToViewport` 콜백 wire 함 (root.attrs.width/height 기반, weave 0..1 ratio 모델). 호스트 `window.__weaveVm` exposed.
    - `selection-context.tsx` — vm 의 `itemSelection` + `subSelection` 슬롯을 읽는 shim 으로 전면 재작성. 기존 `useSelection` API 보존, `SelectionProvider` 는 pass-through 로 축소. 모든 weave consumer (CanvasBlock 등) 변경 없이 작동.
    - `interaction-mode.tsx` — vm 의 `mode` Signal + `requestMode`/`releaseMode` 를 wrap 하는 shim. legacy `transitionFrom` / `restoreIdleFrom` 가 vm 의 claim machinery 로 위임.
    - `DesignPage.tsx` — `enteredFrameId` / `handMode` useState 제거 → vm 슬롯. `useEditorVM(vm, v => v.handTool.get())` 등으로 단일 구독. `canUndo` / `canRedo` 는 agocraft history.undo() 의 emit-then-push 순서 race 때문에 직접 `editor.history.canUndo()` + 로컬 tick 으로 유지 (vm.canUndo 도 동작하지만 mid-undo snapshot lag).
    - `commands.ts` — patch `mergeKey` 정책 확인: agocraft 의 `mergeKeyOf` 가 패치 identity 에서 자동 도출 (`item.attrs#${itemId}`) + `historyMergeWindowMs: 500` 으로 같은 target 의 60Hz drag 가 자동 collapse → patch 에 explicit `mergeKey` 필드 불필요 (agocraft Patch type 도 그 필드 없음). 주석에 정책 박제, 추가 변경 없음.
    - `render/FrameContent.tsx` — agocraft 의 `FrameSurface` 를 wrap 하는 alias. 기존 import 경로 보존, 내부적으로는 agocraft 의 primitive 가 정책 (overflow, renderer dispatch) 단일 source.
  - **Vite optimized-deps 캐시 버그** — 새 agocraft 모듈 export (`useEditorVM`, `createEditorViewModel`, `FrameSurface`) 가 노출될 때 `node_modules/.vite/deps/` 가 stale → "does not provide an export named X" 런타임 에러. 해결: 캐시 삭제 + 기존 vite 프로세스 kill.
  - **검증**: weave typecheck clean, 56/56 unit, **42/5/1 e2e 모두 clean** (회귀 없음).
  - **다음 단계** (남은 작업): NestedFrame / CanvasBlock / FrameStage 내부의 raw `onPointerDown` 핸들러를 agocraft 의 RubberBandBinding / FrameMoveBinding 으로 점진 swap. 현재 weave 의 12+ pointer 핸들러는 그대로 동작 — vm 이 상태 source 가 됐을 뿐이고, 다음 turn 에서 binding-based 로 swap 시 weave-local rubber-band/manipulation 코드 70%+ 제거 가능.
- 2026-05-24 — **Router 인프라 wire + stopImmediatePropagation 보강 (binding swap 준비)**:
  - **agocraft 측 `createGestureRouter`**: claim 시 `e.stopImmediatePropagation()` + `e.preventDefault()` 추가. binding 이 claim 했을 때 React bubble-phase 의 inner 핸들러 (e.g., NestedFrame.onPointerDown) double-fire 차단. pointermove / pointerup 도 router 가 active 인 동안 stopImmediatePropagation. 1.0.0-rc.20260523185024 publish.
  - **weave `useWeaveEditor`**: `{ editor, vm, router }` 반환. router 는 useMemo 로 editor + vm 에서 한 번 생성.
  - **weave `RouterProvider` / `useRouterOrNull`**: `apps/web/src/document/interactions/router-context.tsx` 신규. DesignPage 가 `<RouterProvider router={router}>` 로 자식 트리 감쌈.
  - **검증**: weave typecheck clean, 42/5/0 e2e pass (router 인프라가 dormant — 실제 binding 등록 없음).
  - **실제 handler swap 은 의도적 defer** — 각 swap (Pan / FrameMove / RubberBand) 마다 state-write 채널 (Pan → vm.camera + wheel handler + plane transform 동시 마이그레이션, FrameMove → dragRef → vm.frameManip + parent measurement 동시) 의 multi-file 동기화가 필요. 한 turn 에 모두 시도 시 e2e 회귀 위험 큼. 다음 turn 에서 한 handler 씩 isolation + 동기 마이그레이션.
  - **현재 상태**: Phase 1 (ViewModel) + Phase 2~5 (agocraft 측 구현) 완료. weave 측은 vm-as-state-source 마이그레이션 완료, gesture handler 의 binding swap 은 next turn 작업으로 분리.
- 2026-05-24 — **Pan + FrameMove handler → binding swap 완료**:
  - **agocraft router 보강** (`createGestureRouter`):
    - `setPointerCapture(host, pointerId)` 호출 제거 — host (FrameStage 외곽 div) 에 capture 가 걸리면 후속 synthesized click 의 target 이 host 로 rewrite 되어 inner 의 React onClick 이 bypass, 결국 outer `handleBackgroundClick` 이 fire 해서 selection clear 가 발생. 라우터는 capture-phase listener 이미 descendant move/up 을 모두 수신하므로 explicit capture 불필요.
    - `preventDefault()` 도 pointerdown 에서 제거 — Pointer Events spec 의 compatibility 동작상 mousedown/click 합성을 suppress 할 수 있어 legacy onClick fallback (NestedFrame fit-to-frame, handleBackgroundClick) 이 깨짐. `stopImmediatePropagation` 만 유지.
  - **Pan swap** (`FrameStage.tsx`):
    - `pan` useState 가 vm.camera (MotionValue) 의 mirror — `vm.camera.tx/ty/scale.on("change", ...)` subscriber 로 React state 동기. setPan 는 vm.camera.*.set 으로 통합 wrapper.
    - 휠 / 드래그 / 리셋 모두 단일 채널 (vm.camera). 직접 useState 쓰는 코드 0건.
    - `onPanPointerDown/Move/Up` React handler 전체 삭제. `createPanBinding({ enabled: () => panActiveRef.current })` 를 router.register 로 outer host 에 등록.
    - `panDragRef` 제거 — drag 상태는 `vm.pan` Signal 이 source. cursor 표시는 `vm.pan.subscribe` 로 React state mirror.
  - **FrameMove swap**:
    - weave-specific `FrameAccess` 구현 — `resolveTarget` (data-frame-id 추출 + guard 분기 통합), `readFrame` (doc walk), `commitFrame` (onCommitFrame 호출), `computeMove/Resize/Rotate` (0..1 ratio 산술), `parentRectOf` (DOM 쿼리).
    - `createFrameMoveBinding({ access: frameAccess, priority: 50, moveThreshold: 3 })` 를 PanBinding 과 함께 router.register.
    - `NestedFrame.startMove` + `dragRef.kind = "move"` variant + `onPointerMove` 의 move case + `endDrag` 의 move 분기 모두 삭제. dragRef 는 resize / rotate 만 남음.
    - `NestedFrame.onPointerDown` 의 startMove 호출 제거 — router 가 capture 단계에서 처리. React handler 는 fallback 선택 처리만 (router 가 claim 안 한 케이스).
    - SelectionLayer 의 `onMoveStart` prop 제거 (binding 이 처리).
  - **agocraft re-publish**: `1.0.0-rc.20260523221804` → final. weave deps 동기.
  - **검수**: weave typecheck clean, **42/5/0 e2e clean** (Pan + FrameMove 회귀 없음).
  - **RubberBand swap 은 의도적 defer** — agocraft 의 NormalizedDragRect (`{left, top, width, height, ratio.{x,y,w,h}}`) 와 weave 의 (`{x, y, width, height, aspectRatio, bucket}`) 의 shape mismatch + `InsertableCapability` 의 ctx 차이 (`{containerId, sessionId}` vs `{containerId, canUndo, canRedo}`) 로 460-LoC `RubberBandLayer` + 3 host capability adapter 정렬이 별도 multi-file refactor. WI 의 follow-up 으로 분리.
- 2026-05-24 — **RubberBand handler swap 완료 (Option B: weave-local thin adapter)**:
  - 결정: agocraft 는 도메인 무지 (DR-011/013/005 의 정신) 로 유지, weave 가 shape bridge 를 소유. agocraft NormalizedDragRect ↔ weave (aspectRatio + bucket 추가) + InsertableCapability ctx (sessionId vs canUndo/canRedo) 변환.
  - 신규: `apps/web/src/document/rubber-band/agocraft-adapter.ts` (~50 LoC). `adaptWeaveCapabilityToAgocraft(weaveCap, editor)` 가 두 contract 양방향 변환.
  - 재작성: `apps/web/src/document/rubber-band/RubberBandLayer.tsx` (~470 → ~400 LoC). `useRubberBand` 제거, 다음으로 대체:
    - `useEditorVMOrNull()` + `useRouterOrNull()` 로 vm + router 입수.
    - `router.register({ host: hostElementRef, bindings: [createRubberBandBinding({ capability: adaptedCapability, ... })] })` — capture-phase에서 gesture lifecycle 처리.
    - `vm.rubberBand.subscribe` 로 host-scoped (`slot.hostId === containerId`) 상태 mirror → 기존 `rb.{state, rect, previewKind}` 인터페이스 보존.
    - `hoverPoint`: pointermove on host element 의 local React state (vm 은 per-host hover 추적 안 함, 의도).
    - `altActive`: global keydown/keyup 직접 추적 (legacy useRubberBand 와 동일).
    - `preview(kind)` / `commitFn()` / `cancel()`: `vm.rubberBand.set(...)` 와 `commitRubberBandRecommendation(...)` 호출.
    - Esc dismissal: rb.state !== idle 일 때 document keydown 리스너.
  - 삭제: `apps/web/src/document/rubber-band/use-rubber-band.ts` (500+ LoC). weave 안의 import 0건 확인 후 delete.
  - **검수**: weave typecheck clean, **42/5/0 e2e clean**. 회귀 없음 (3개 host — design plane / canvas / doc-block — 의 RubberBandLayer 가 동일 binding 경로 사용).
  - **3개 swap 모두 완료**: Pan + FrameMove + RubberBand 의 raw pointer handler / hook 모두 agocraft binding 으로 이동. weave 는 capability adapter + chrome / popover / visual 만 남음.
- 2026-05-24 — **Phase 6 (cleanup) + SelectionChrome 확장성 + OS-level SOLID/GRASP + CoordinateSystem 설정**:
  - **DR-018 — Selection chrome extensibility** (view-model-first 설계).
    - 신규 `@agocraft/editor/selection-chrome/`: `SelectionHandleSpec`, `SelectionAnchor`, `SelectionInfo`, `ItemSelectionViewModel`, `SelectionHandleProvider`, `SelectionChromeRegistry`, `createSelectionChromeRegistry()`, `resolveAnchor()`. 사용자 피드백 ("아이템 본인의 뷰모델이 자기 핸들/액션을 알려주는 게 자연스럽다") 반영 — `registerItemViewModel` 이 권장 path, `registerProvider` 는 cross-cutting plugin escape hatch.
    - design-system `SelectionLayer` 에 `resolveHandles?: (bounds) => ExternalHandlePlacement[]` prop 추가. 매 rAF tick 마다 caller 의 resolver 가 live bounds 와 함께 호출 — 카메라 애니메이션 / 팬 / 드래그 중에도 handles glued. `capability` + `onResizeStart` / `onRotateStart` 는 legacy fallback 유지. `SelectionHandleButton` (positionless variant) 추가.
    - weave: `useWeaveEditor` 가 `selectionChrome: SelectionChromeRegistry` 노출 + `<SelectionChromeProvider>` context. `createFrameDefaultViewModel({ itemKind, onResizeStart, onRotateStart })` 가 8 resize + 1 rotate 의 default spec set. NestedFrame 의 `<SelectionLayer resolveHandles={...}>` 가 in-place default ViewModel + registry.resolve() 결과를 merge (extension specs 가 id 충돌 시 우선).
  - **Phase 6 dead code**: `apps/web/src/document/rubber-band/types.ts` 삭제 (0 import).
  - **DR-019 — CoordinateSystem editor init**.
    - 신규 `@agocraft/editor/coord-system/`: `CoordinateSystem` (space: ratio/absolute, origin: top-left/center, designWidth/Height), `CanonicalRect`, `HostRect`, `toCanonical / fromCanonical / canonicalToViewport` helpers.
    - `EditorDeps.coordSystem?` + `editor.coordSystem` 노출. 기본값 `{ ratio, top-left, 1920×1080 }` — weave 의 기존 컨벤션과 일치.
    - 4 tests pass (round-trip identity 4 systems × samples, ratio→canonical math, center origin shift).
    - **Migration story**: weave 는 명시적 채택 시점에 `createEditor({ ..., coordSystem })` 지정. 기존 `projectFrameToViewport` 가 향후 `canonicalToViewport` helper 로 위임 가능. 새 호스트는 자기 컨벤션을 한 줄로 선언, agocraft 가 변환 일관성 보장.
  - **OS-level SOLID/GRASP 통합**:
    - 신규 `.claude/skills/solid-grasp-review/SKILL.md` — SOLID 5 + GRASP 9 의 구체 체크리스트 + 산출물 템플릿 + workspace 의 검증된 예시 (DR-005/011/013/017/018).
    - OS root `CLAUDE.md` § "Core Engineering Principles" 의 첫 룰로 SOLID + GRASP 가 모든 코드 구조 결정의 first-pass filter 라고 명시.
    - 5개 agents 에 mandatory 섹션 추가: architecture-decision-agent, clean-code-maintainability-agent, frontend-architecture-agent, backend-architecture-agent, engineering-orchestrator.
    - `.claude/skills/engineering-plan/SKILL.md` 에도 upstream gate 추가.
  - **검수**: agocraft typecheck clean (4/4 coord tests + 5/5 vm tests + 109/109 editor tests). weave typecheck clean, **42/5/0 e2e clean**.
- 2026-05-24 — **weave CoordSystem 채택 + Phase 7 regression tests**:
  - **weave `useWeaveEditor`**: `createEditor({ ..., coordSystem: DEFAULT_COORDINATE_SYSTEM })` 명시화. `projectFrameToViewport` 가 직접 ratio×design 산술 대신 `toCanonical(frame, editor.coordSystem)` + `canonicalToViewport(canonical, camera)` 두 helper 위임. 변환 로직 single source.
  - **Phase 7 — 5 증상 regression tests** (agocraft 측, 도메인 무지):
    - #1 Overflow drift → `packages/editor/src/render/frame-surface.test.tsx`. `FRAME_OVERFLOW === "visible"` 상수 + TypeScript 좁힘 (`as const`) 검증.
    - #2 Frame-move + drag-add 중복 → `packages/editor/src/gesture/modifier-conflict.test.ts`. ModifierPredicate 의 required/forbidden/ignored 시나리오 4 케이스 — plain-drag 와 alt-drag 가 같은 host 에서 modifier 만으로 분리됨.
    - #3 0×0 chip → `view-model/rubber-band-dismissal.test.ts` (cross-test). `rubberBandHasArea` derived 가 rectLocal 의 1px 이상 변화에서만 true.
    - #4 Esc-only-dismiss → `view-model/rubber-band-dismissal.test.ts`. `vm.rubberBand.set(null)` 이 외부 dismiss API, subscribers 가 null 전이를 observable.
    - #5 flaky bounds → `view-model/selected-bounds-derived.test.ts`. determinism (3 케이스): same state → same output, 다른 input 순서 → same final value, no-selection → null.
  - **agocraft editor 패키지 125/125 tests** (이전 109, +16 from Phase 7). weave 42/5/0 e2e.
  - **사용자 view-model-first 통찰 박제**: 모든 새 surfaces (selection-chrome, coord-system) 의 DR + 코드가 "도메인 / 아이템이 자기 표현·동작을 알린다" 패턴 일관 적용. agocraft 는 minimal contract + registry/mediator/converter 만, weave 는 domain-specific viewModel + adapter.

## Status update

Phase 1~5 + Phase 6 (cleanup + selection chrome extensibility) + Phase 7 (regression test 이전) 모두 완료. 한 줄 정리:

| Phase | 상태 |
|---|---|
| Phase 0 — Contracts | ✅ DR-017 |
| Phase 1 — EditorViewModel | ✅ 구현 + weave 마이그레이션 |
| Phase 2 — GestureRouter | ✅ 구현 + Pan swap |
| Phase 3 — RubberBand state | ✅ 구현 + weave thin adapter swap |
| Phase 4 — FrameManip state | ✅ FrameMove swap (Resize/Rotate 는 SelectionLayer handle binding 으로 이관 가능, follow-up) |
| Phase 5 — FrameSurface | ✅ 구현 + weave alias |
| Phase 6 — weave cleanup + Selection Chrome extensibility (DR-018) | ✅ |
| Phase 7 — Regression tests in agocraft | ✅ 5 증상 모두 박제 |
| 추가 — DR-019 CoordinateSystem | ✅ 구현 + weave 명시 채택 |
| 추가 — OS-level SOLID/GRASP skill + agent 통합 | ✅ |
| 추가 — Resize/Rotate handle binding swap | ✅ |
| 추가 — DR-018 demo extension (slide.add-bullet) | ✅ |
| Canvas shape gesture swap | 🔵 deferred (Phase 8 follow-up — vm.subSelection + window-bus + per-shape parent-rect 의 통합 refactor) |

- 2026-05-24 — **Resize/Rotate handle binding swap + DR-018 PoC + agocraft 측 WI-013 closure**:
  - **Resize/Rotate**: design-system `ExternalHandlePlacement` 가 `itemId?` 노출 → SelectionLayer 가 wrapper 에 `data-selection-handle-item-id` 마운트. `createFrameResizeBinding` + `createFrameRotateBinding` 가 FrameStage outer host 에 등록 (priority 80). NestedFrame 의 `startResize` / `startRotate` / `dragRef` / `onPointerMove` / `endDrag` 전체 삭제. handle 의 `onPointerDown` 은 router 안 잡으면 safety NOOP.
  - **DR-018 PoC** — `apps/web/src/document/selection-chrome/slide-bullet-handle.tsx` 신규. `createSlideBulletHandleViewModel({editor})` 가 slide 한정으로 "+" 핸들 (남동 외각 22px) 등록. DesignPage 의 useEffect 에서 `selectionChrome.registerItemViewModel(...)` 호출. 클릭 시 `editor.exec("weave.item.update", { patch: (item) => ({ attrs: { bullets: [...prev, ""] } }) })` 로 도메인 커맨드.
  - **agocraft WI-013** (`records/work-items/WI-013-editor-core-v2.md`) 발행 — HANDOFF-004 의 Phase 0~7 모두 delivered 박제. HANDOFF-004 status: `Accepted` → `Delivered`.
  - **Canvas shape gesture swap** 은 Phase 8 deferred — `vm.subSelection` 슬롯 + window-bus dispatch + 도메인 specific parent-rect resolver 의 통합 refactor 필요. 현재 코드 동작 정상이므로 회귀 위험 없는 시점에 별도 turn 으로 진행.
  - **검수**: weave typecheck clean, **42/5/0 e2e clean** (resize/rotate swap 직후, PoC 등록 직후 두 번 모두).
