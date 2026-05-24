# Engineering Plan — Z-order Peek UI (WI-019)

## Feature scope and risks

**Scope**: agocraft WI-014가 공급하는 ZOrderCapability + `@agocraft/spatial` + PeekModeController를 weave에서 consume. 5 작업:

1. `@weave/design-system`에 Panel / Switch / Badge / Kbd 4 primitives 박제 (DR-design-008).
2. weave 4 도메인 (`design-frame`, `canvas-design-item`, `slide-item`, `hotspot`)에 ZOrderCapability adapter 등록.
3. `<PeekOverlay />` — 3D CSS lift, cursor ring, ghost outline, dim surroundings.
4. `<PointStackInspector />` — Panel + Switch + Badge + Kbd 조합으로 cursor stack 시각화 + drag reorder.
5. e2e + baseline 회귀 보호.

**원천 PoC**: `experiments/zorder-peek/index.html` (744 줄, 의존성 0, 2026-05-24).

**Risks** (DR-013 + WI-019에서 상세 박제):
- R1 — Space + pan 결합 (DR-013 Decision C)의 사용자 학습 비용.
- R2 — backdrop-filter drop 회귀 ([[feedback_backdrop_filter_under_transform]]).
- R3 — Frame nesting drill scope 한정으로 UX 손실 (DR-013 Decision B).
- R4 — React StrictMode singleton dispose ([[feedback_react_strictmode_singleton_dispose]]).
- R5 — ThumbnailPanel / PropertiesPanel migration timing (DR-design-008 §9).

## Architecture

### Layers

```
┌──────────────────────────────────────────────────────────────┐
│ weave application (apps/web/)                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ DesignPage                                              │ │
│ │   ↳ <FrameStage>                                        │ │
│ │       ↳ <PeekOverlay>           — 3D CSS lift           │ │
│ │   ↳ <PointStackInspector>       — Panel + DS primitives │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ apps/web/src/document/peek-mode/                        │ │
│ │   PeekOverlay.tsx                                       │ │
│ │   PointStackInspector.tsx                               │ │
│ │   StackRow.tsx                                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ apps/web/src/document/zorder/                           │ │
│ │   design-frame.zorder.ts                                │ │
│ │   canvas-design-item.zorder.ts                          │ │
│ │   slide-item.zorder.ts                                  │ │
│ │   hotspot.zorder.ts                                     │ │
│ │   register.ts                                           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ @weave/design-system                                         │
│   Panel.tsx / Switch.tsx / Badge.tsx / Kbd.tsx               │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │ npm / yalc
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ agocraft (WI-014)                                            │
│   @agocraft/spatial         — createSpatialIndex / Frame...  │
│   @agocraft/core            — ZORDER_CAPABILITY + helper     │
│   @agocraft/manipulation    — 6 zOrder commands              │
│   @agocraft/interaction     — createPeekModeController       │
└──────────────────────────────────────────────────────────────┘
```

### Data flow

```
[Space keydown]
  → InputBus → HotkeyRegistry → PeekModeController
  → vm.peekMode.isActive.set(true)

[cursor move]
  → useEditorVM(vm.peekMode.liftSet) → React re-render
  → PeekOverlay applies CSS --z-rank to lifted items
  → PointStackInspector lists stack rows

[user drags Inspector row]
  → row.onDragEnd → controller.startDrag/updateDrag/endDrag(true)
  → endDrag → editor.exec("agocraft.zOrder.reorderLocal", { orderedAsc })
  → command resolves ZOrderCapability per kind
  → adapter (e.g., design-frame.zorder.ts) returns Patch[]
  → ChangeStream → History → 1 undo step
  → FrameSpatialIndex marks dirty → next query rebuilds

[Space keyup]
  → controller.dispose? No — keyup just resets isActive + liftSet to null
```

### Boundaries

- PeekOverlay는 `useEditorVM` 만 의존. ChangeStream 직접 구독 0.
- ZOrderCapability adapter는 `editor.document` read + Patch[] return. setAgoDoc 직접 0 ([[feedback_doc_mutation_must_hit_history]]).
- Inspector의 row drag는 controller API 통과. row 자체가 editor.exec 호출 0.

## APIs / data model

### Adapter contracts

```ts
// design-frame.zorder.ts
import { createZOrderAdapter } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";

export function createDesignFrameZOrderAdapter(deps: { editor: Editor }) {
  return createZOrderAdapter({
    readZ: (itemId) => {
      const idx = deps.editor.document.root.children.findIndex(c => c.id === itemId);
      return idx >= 0 ? idx : 0;
    },
    writeZ: (itemId, z) => {
      // Build array-move Patch — agocraft Patch type supports path-based moves
      return [{ op: "move", from: ["root", "children", currentIdx], to: ["root", "children", z] }];
    },
  });
}
```

```ts
// canvas-design-item.zorder.ts — same shape, different path
// slide-item.zorder.ts — attrs.layerIndex numeric reassignment (not array)
// hotspot.zorder.ts — parent.attrs.hotspots array index
```

### Component APIs

```ts
// PeekOverlay
interface PeekOverlayProps {
  controller: PeekModeController;
  frameRect: { x: number; y: number; w: number; h: number };
}
// internally: useEditorVM(controller.liftSet) → render lifted items via CSS --z-rank

// PointStackInspector
interface PointStackInspectorProps {
  controller: PeekModeController;
}
// internally: useEditorVM → render Panel + Switch + StackRow rows
```

### Error / edge cases

- block-doc item hover → `editor.capabilities.has(ZORDER_CAPABILITY, "block-doc")` false → modeline pill "z-order 미지원" + Inspector empty state.
- 5+ items at cursor → Inspector scrollable (Panel.Body native scroll).
- Frame entered 변경 → controller.resolveIndex가 새 FrameSpatialIndex로 swap. 이전 frame의 lift set 즉시 해제.

## Specialist reviews

| Agent | Surface | When |
|---|---|---|
| `design-system-agent` | 4 primitives token resolution + variant ceiling | DR-design-008 review (Phase 1 진입 전). |
| `frontend-design-pattern-agent` | a11y / focus restoration / reduced-motion / Radix wrapping | DR-design-008 review. |
| `library-adoption-supply-chain-governance-agent` | `@radix-ui/react-switch` 채택 | DR-design-008 review. |
| `rendering-performance-review` skill | 3D CSS lift, backdrop-filter under transform, will-change 정책 | Phase 3 진입 전. |
| `web-baseline-review` skill | prefers-reduced-motion, focus-visible, kbd semantic | Phase 3. |
| `frontend-architecture-agent` | Panel compound + ThumbnailPanel / PropertiesPanel migration plan | DR-design-008 Phase 2 follow-up. |

## Tests

### Unit

- `apps/web/src/document/zorder/__tests__/*.test.ts` — 4 adapter 각 happy + edge (8+ tests).
- `apps/web/src/document/peek-mode/__tests__/peek-overlay.test.tsx` — lifted item CSS var update, ghost rendering, dim surrounding logic (5+ tests).
- `apps/web/src/document/peek-mode/__tests__/inspector.test.tsx` — Panel layout, Switch state binding, StackRow drag (5+ tests).

### Integration

- `apps/web/src/document/peek-mode/__tests__/peek-flow.test.tsx` — controller mock → Space keydown → cursor move → Inspector populates → drag row → editor.exec called once. (3 tests)

### End-to-end

- `apps/web/e2e/history-zorder-peek.spec.ts` (DR-013 Decision E):
  1. Happy path — Space hold + drag → reorder + Cmd+Z.
  2. Mode 우선순위 — drawing 중 Space → peek 진입 안 함.
  3. Pan 양보 — Space hold + hover → peek; Space hold + drag → pan; drag 종료 후 hold 유지 → peek 복귀.
  4. drill scope — 부모 frame siblings는 lift 안 함.
  5. Reduced-motion — 0ms lift.
  6. Adapter 부재 — block-doc item 위에서 peek 진입 silent.

### Security-sensitive negatives

- Long drag (60Hz, 5초) → 단일 undo step 유지 (mergeKey 자동).
- Frame swap during peek → 이전 frame의 lift set 즉시 unmount, 새 frame의 spatial index 갱신.
- Concurrent Cmd+Z during peek → peek mode 유지, history 1 step back.

## Rollout / rollback

### Feature flag

- GrowthBook flag: `weave.zorder-peek.enabled`. default off in production.
- Phase 4 e2e green 후 dev / staging만 on. 1 주 dogfood 후 production 점진 ramp (10% → 50% → 100%).

### Ramp plan

| Stage | Target | Gate |
|---|---|---|
| Dev local | self | Phase 4 e2e |
| Staging | internal | telemetry baseline 1주 |
| Prod 10% | early adopters cohort | peek↔pan transition frequency < 5/sess avg |
| Prod 50% | broad | Cmd+Z 회귀 0 + e2e nightly green 1 주 |
| Prod 100% | all | sustained 2 주 stable |

### Kill-switch

- Flag off → `useWeaveEditor`가 PeekModeController instance 생성 skip → PeekOverlay + Inspector mount 안 함.
- Adapter 4개는 등록되어 있어도 무해 (peek 없으면 호출 0).
- Rollback 후 deps revert 불필요 — agocraft 측 모듈은 그대로 둠.

### Reversibility

100% additive. 기존 weave UI / 기존 editor 동작에 0 영향. 사용 안 하면 dead code (tree-shake로 dist에서 제거 가능).

## Migration plan

데이터 모델 변경 없음. 기존 frame / item / hotspot의 z 표현은 그대로 사용 — adapter가 그 표현을 read/write할 뿐.

ThumbnailPanel / PropertiesPanel의 Panel primitive migration은 **별 PR로 분리** (DR-design-008 §9). 본 WI에서는 Panel을 새로 짓고 Inspector에만 채택.

## Estimate

| Phase | 예상 소요 | 범위 (best – worst) | 위험 요인 |
|---|---|---|---|
| Phase 0 — Contracts | 0.3 일 | 0.2 – 0.5 일 | DR-013 + DR-design-008 review iteration |
| Phase 1 — DS growth (4 primitives) | 1.5 일 | 1 – 3 일 | Radix Switch sign-off + token resolution + 3 theme visual diff |
| Phase 2 — 4 adapter | 0.5 일 | 0.3 – 1 일 | agocraft Patch type / Path 컨벤션 학습 |
| Phase 3 — Peek UI | 1.5 일 | 1 – 3 일 | 3D CSS edge case (backdrop-filter drop, R2), mode race (R1, R3) |
| Phase 4 — e2e + verify | 0.7 일 | 0.5 – 2 일 | 6 e2e + baseline maintain |
| **합계** | **4.5 일** | **3 – 9.5 일** | agocraft WI-014 publish 지연 시 Phase 2 blocked |

agocraft WI-014와 동기 진행 시 1 주 내. agocraft 측 4 일 + weave 측 4.5 일 = 8.5 일 (serial). Phase 0~1은 agocraft 작업과 병렬 가능 → 실효 5~6 일.

## References

- WI-019 — `records/work-items/WI-019-zorder-peek-ui.md`
- DR-013 — `records/decisions/DR-013-peek-mode-adapter.md`
- DR-design-008 — `records/design-reviews/DR-design-008-panel-switch-badge-kbd.md`
- HANDOFF-005 — `records/decision-handoffs/HANDOFF-005-zorder-spatial-peek-mode.md`
- agocraft WI-014 — `workspace/agocraft/records/work-items/WI-014-zorder-spatial-peek-mode.md`
- agocraft DR-021 / DR-022 — capability + spatial source
- PoC — `experiments/zorder-peek/index.html`
