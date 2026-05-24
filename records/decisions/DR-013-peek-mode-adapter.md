# Decision Record — DR-013 Peek-mode UI integration + ZOrderCapability adapter per weave domain

## Metadata

| Field | Value |
|---|---|
| ID | DR-013 |
| Title | weave가 agocraft의 ZOrderCapability + PeekModeController를 consume하는 방식 — 5 도메인 adapter + peek overlay layer + scope policy (entered frame only) |
| Status | Proposed |
| Owner | hbpark |
| Triggering Work Item | WI-019 |
| Pairs with | agocraft DR-021 (ZOrderCapability), agocraft DR-022 (`@agocraft/spatial`), agocraft WI-014, weave HANDOFF-005, weave DR-design-008 |

## Context

agocraft WI-014가 ZOrderCapability + `@agocraft/spatial` + PeekModeController를 cross-domain primitive로 표준화. weave는 자기 5 도메인 (`design-frame`, `canvas-design item`, `block-doc item`, `hotspot`, `slide` item) 중 z-order가 의미 있는 4 도메인에 대한 adapter를 등록 + Peek mode UI 표현 layer + Inspector panel을 박제.

해결할 3 결정:
1. **Adapter 등록 위치 + 도메인 별 z 표현** — 4 도메인 각각이 자기 model 어떻게 z를 표현하나? splice vs explicit z field?
2. **Peek scope** — n-level frame nesting에서 어느 frame의 item을 peek 대상으로?
3. **Mode boundary** — 어떤 다른 mode (drill, hand, pan, drawing, hotspot-editing)와 충돌하나? 우선순위?

## Decision A — Adapter 등록 위치

`apps/web/src/document/zorder/` 신규 폴더, 도메인 1개 = 파일 1개:

```
apps/web/src/document/zorder/
  types.ts                              — 공통 helper / 의존성 타입
  design-frame.zorder.ts                — design-frame (root canvas의 4 frame domain) — items 배열 index 기반
  canvas-design-item.zorder.ts          — canvas-design frame 내부 shape — items 배열 index
  block-doc-item.zorder.ts              — z 부재. adapter 미등록. (block-doc은 stacking 아닌 sequence)
  slide-item.zorder.ts                  — slide의 title / bullet / shape layered. attrs.layerIndex
  hotspot.zorder.ts                     — parent item의 attrs.hotspots 배열 index
  register.ts                           — useWeaveEditor 진입 시 4 adapter 일괄 등록
  index.ts
```

**도메인 별 z 표현 결정**:

| Domain | z 표현 | reorder operation | Patch shape |
|---|---|---|---|
| `design-frame` | `doc.root.children` 배열 index | array splice | path-based array move |
| `canvas-design item` (shape) | parent frame의 `attrs.items` 배열 index | array splice | array move |
| `block-doc item` | (z 부재) | — | adapter NOT registered |
| `slide item` (title/bullet/shape) | `attrs.layerIndex` (explicit field) | numeric reassignment | attr patch |
| `hotspot` | parent item의 `attrs.hotspots` 배열 index | array splice | array move |

`createZOrderAdapter` helper (agocraft 제공)의 `readZ` + `writeZ` 만 박제 — `reorderLocalStack` default가 z-pool 재분배 + writeZ 일괄 호출.

이는 [[feedback_doc_mutation_must_hit_history]] 의무에 부합 — adapter는 Patch[]를 반환할 뿐 직접 setAgoDoc 호출 0.

## Decision B — Peek scope: 현재 entered frame 내부만

n-level frame nesting (WI-013 Phase 12+에서 정착)에서 사용자가 drill-in한 가장 깊은 frame을 "current frame"으로 정의. Peek은 **그 frame 안의 item만** 대상.

근거:
- **인지 부담** — 부모 frame의 sibling item까지 포함하면 stack 깊이가 의도 외 증가, "여기 무엇이 쌓여있나?" 질문의 답이 흐려짐.
- **구현 단순** — Spatial index가 frame 단위로 자연스럽게 isolated. 다중 frame query는 별 layer 필요 (deferred).
- **사용자 의도 (2026-05-24 클리어)** — "현재 entered frame 내부만" 명시.

**구현**:
- `useWeaveEditor`가 노출하는 `vm.enteredFrameId` Signal을 PeekModeController의 `resolveIndex` deps로 wire.
- frame이 바뀔 때마다 PeekModeController의 spatial index가 swap (또는 ref 갱신) — 같은 controller instance가 다른 index를 query.
- `createFrameSpatialIndex({ editor, frameId, resolveBbox, listItems })`를 entered frame 별 lazy 생성 + WeakMap cache. drill-out 시 dispose 안 함 (재진입 빠르게).

**미래 확장**:
- Phase 2+의 follow-up: "global mode" 모디파이어 (예: Shift+Space)로 부모 frame까지 확장. 본 DR은 deferred.

## Decision C — Mode boundary 정책

weave의 현재 mode 시스템 (WI-018에서 InteractionModeContext → vm.mode shim으로 통합):

| Mode | Trigger | Peek과의 관계 |
|---|---|---|
| `idle` | default | Space → `peek` 진입 가능 |
| `hand-tool` | H key 또는 hand tool 선택 | Peek 진입 가능 (hand는 pan 의도, peek는 inspect 의도 — orthogonal) |
| `drawing` (rubber-band) | empty area drag | Peek 진입 차단 (drawing 중에는 Space로 다른 모드 불가) |
| `frame-manip` (move/resize/rotate) | frame body / handle drag | Peek 진입 차단 (drag 중에는 Space invalid) |
| `pan` (Space-only) | **conflict** | Space hold가 기존 pan과 충돌 — 해결책: Space는 peek, pan은 Space+drag만 |
| `drill` | frame double-click 또는 Enter | Peek 진입 가능 |
| `hotspot-editing` | hotspot select + Tab | Peek 진입 가능 — 대상 stack은 hotspots 배열 (Decision A의 hotspot adapter 사용) |

**Space 핫키 충돌 (현행 pan)**:

WI-013 Phase 12/13의 현재 동작: Space hold + drag = pan. Space tap = NOOP. Peek는 Space hold가 hover-only로 동작 (drag 안 함). 충돌 해결 방안:

- **Option 1 — Peek가 우선**: Space hold = peek. pan은 다른 트리거로 이전 (e.g., middle-click drag, H+drag).
- **Option 2 — Combined**: Space hold + hover = peek; Space hold + drag = pan. PeekModeController가 startDrag 진입 시 자기 mode를 양보, pan binding이 take over.
- **Option 3 — 모디파이어로 분리**: Peek = Space만, Pan = Space+Cmd / Shift+Space 등.

**채택: Option 2 (Combined)** — 사용자 학습 비용 최소화 + 두 인터랙션의 자연 결합. Space hold 직후 cursor가 1px 이상 움직이면 PeekModeController가 자기 lift set을 unmount하고 PanBinding이 take over. drag 종료 시 Space가 여전히 hold 중이면 peek로 복귀.

**구현**:
- PeekModeController + PanBinding 둘 다 router에 등록.
- PanBinding의 `acceptTarget`은 항상 false 반환하되 modifier ("space pressed")가 sustained 시 priority MODIFIER_OVERRIDE(90).
- PeekModeController는 reactive — Space keydown 시 자기 lift set 시작; Pan claim 시 자기 lift set 일시 unmount.

## Decision D — Drag commit boundary

Peek의 drag-to-Z는 visual preview + 1회 commit:

```
[lift set active]
  → user pointerdown on lifted item
     → controller.startDrag(itemId)
     → CSS --z-rank var update만 (no editor mutation)
  → user pointermove
     → controller.updateDrag(newRank) per RAF
     → CSS --z-rank var update만
  → user pointerup
     → controller.endDrag(commit=true)
     → controller calls editor.exec("agocraft.zOrder.reorderLocal", { orderedAsc })
     → 단일 ChangeStream emit → 1 undo step
```

[[feedback_doc_mutation_must_hit_history]] 준수: drag 중 mutation 0, drop에 단일 exec.

**Cmd+Z 의무**: peek drop 후 `Cmd+Z` 1회 → reorder 이전 상태로 복귀. e2e 박제 의무 (WI-019 acceptance).

## Decision E — Mode boundary와 e2e 박제 의무

WI-019 e2e (apps/web/e2e/history-zorder-peek.spec.ts):

1. **Happy path** — Space hold + drag → reorder + Cmd+Z.
2. **Mode 우선순위** — drawing 중 Space → peek 진입 안 함.
3. **Pan 양보** — Space hold + hover → peek; Space hold + drag → pan; drag 종료 후 hold 유지 → peek 복귀.
4. **drill scope** — drill-in한 frame 안의 item만 lift; 부모 frame siblings는 lift 안 함.
5. **Reduced-motion** — `prefers-reduced-motion: reduce` → lift transition 0ms (instant).
6. **Adapter 부재** — block-doc item에 z 명령 호출 → silent NOOP + 회귀 0.

## 정합 — weave 기존 design decisions

- **DR-005** (agocraft, capability registry) — ZOrderCapability가 7번째 application.
- **DR-009 / DR-010 / DR-011 / DR-012** (weave) — 같은 capability+adapter 패턴, 본 DR이 5번째 weave-local application.
- **DR-018** (agocraft, selection-chrome) — peek가 selection과 무관하게 동작 (Space로 trigger, selection state 변경 안 함).
- **Document mutation rule** (weave CLAUDE.md) — drag commit이 editor.exec 경유, mergeKey 자동.

## Consequences

긍정:
- 새 도메인 추가 시 (예: 미래의 freeform-canvas) adapter 1 파일 + register 1 줄. UI / spatial / peek 변경 0.
- block-doc 같은 z 부재 도메인은 자연스럽게 비활성 — UI에서 회색 처리.
- frame isolation으로 spatial index의 메모리 + query latency 모두 작음.
- pan과 peek의 결합이 사용자 학습 비용을 줄임 (둘 다 Space의 자연 확장).

부정 / risk:
- **Space의 dual meaning**이 사용자 혼란 가능성 — onboarding tooltip 박제 (`"Space + hover: 레이어 들어올리기 · Space + drag: pan"`).
- **Drill scope 한정으로 인한 미세 UX 손실** — drill-in한 frame 안에서 부모 frame의 큰 sibling item이 시각적으로 보이지만 peek 대상이 아님 → 부모 item을 z-order 조작하려면 drill-out 필요. 본 DR의 단순성 trade-off로 수용.
- **mode race 가능성** — Space hold 중 pan claim → peek unmount → drag 종료 → peek remount 의 transition이 어색할 가능성. WI-019 Phase 4에서 e2e + 사용자 dogfood로 검증.

## Mitigations

- **Drill scope tooltip** — peek 모드 진입 시 modeline pill에 "현재 프레임 · N items"를 짧게 표시. 사용자가 scope를 시각적으로 인지.
- **Space dual meaning 학습** — 처음 4회 Space 사용 시 onboarding hint overlay (8s auto-dismiss).
- **mode race telemetry** — peek↔pan transition의 frequency를 GrowthBook event로 수집 (1주 후 분석).

## References

- WI-019 — `records/work-items/WI-019-zorder-peek-ui.md`
- HANDOFF-005 — `records/decision-handoffs/HANDOFF-005-zorder-spatial-peek-mode.md` (sender record — weave가 발송)
- DR-design-008 — `records/design-reviews/DR-design-008-panel-switch-badge-kbd.md` (UI primitive 의존)
- agocraft DR-021 / DR-022 / WI-014 — capability source
- 관련 메모: [[feedback_doc_mutation_must_hit_history]], [[feedback_design_system_triage_mandatory]], [[feedback_shared_utilities_to_agocraft]], [[feedback_react_strictmode_singleton_dispose]]
