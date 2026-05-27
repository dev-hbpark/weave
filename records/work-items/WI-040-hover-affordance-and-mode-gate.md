# Work Item — WI-040

## Metadata

| Field | Value |
|---|---|
| ID | WI-040 |
| Title | Canvas hover affordance (3-tier: hovered / siblings / parent) + InteractionMode 가드 통합 |
| Owner | hbpark |
| Status | Engineering Plan in draft |
| Severity | P2 (bug + feature; LG-001 에 hover affordance line 추가 예정. 버그는 가드 누락이라 사용자 인지 가능) |
| Created | 2026-05-27 |
| Target date | LG-001 (2026-06-08) 이전 Phase 1 (bug fix) 필수, Phase 2-3 (hover overlay) 권장 |
| Closed | — |

## Summary

캔버스에서 마우스가 한 아이템 위에 머무르면 **(a) 그 아이템 자체**, **(b) 같은 부모 안의 형제 아이템들**, **(c) 부모 frame (또는 상위 부모 아이템)** 을 3 단계로 시각적으로 구분해 보여주는 hover affordance. 사용자가 아이템의 컨테인먼트 관계를 한눈에 파악할 수 있게 함. **편집 모드 (`InteractionMode === "idle"`) 에서만 표시.**

이 WI 는 같은 PR 단위로 묶지 않는 두 영역을 포함:

1. **Bug 가드 (Phase 1, 별도 PR)** — 현재 코드에서 hover/select/drag 가 InteractionMode 비-idle 상태에서 새어 나가는 누락 지점을 가드.
   - **Hand/Pan 모드 (`isSpaceDown || handMode` → InteractionMode "hand") 중 모든 item drag 가 동작** — `createFrameMoveBinding` 가 vendor 단에서 mode-aware 가 아니어서 host 측에서 binding 등록을 안 하는 방식으로 차단해야 함.
   - **LayerPicker open (InteractionMode "context-menu") 상태에서 selection handles + rubber-band overlay 가 여전히 보임** — `SelectionLayer` / `RubberBandLayer` 의 렌더 게이트가 mode 를 안 봄.
   - `useHoverContext` 가 InteractionMode 가드 없음 → 향후 hover overlay 가 비-idle 모드에서 깜박일 위험.
2. **Hover affordance feature (Phase 2-3, 별도 PR)** — 새 design-system primitive `HoverAffordanceLayer` + DesignPage wiring. Phase 1 의 새 hook `useEditAffordancesAllowed()` 를 가시성 게이트로 사용.

## Background — 가드 누락 사실 (코드 인용)

- **selection (FrameStage.tsx:516)** — `if (!selectionAllowed) return;` (`useFrameSelectionAllowed()` = mode === "idle"). 정상.
- **frame move (FrameStage.tsx:1554)** — `createFrameMoveBinding` 호출 시 `modifiers: { alt: "forbidden", button: 0 }` 만. hand/panning/context-menu 모드 가드 0. vendor API (`CreateFrameMoveBindingDeps`) 는 `enabled` predicate 미지원 → host 가 binding 등록 자체를 mode 별로 제어해야 함.
- **resize / rotate (FrameStage.tsx:1600, 1635)** — 동일. mode 가드 0.
- **rubber-band (FrameStage.tsx:1525)** — `transitionFrom("idle", "rubber-band")` 으로 진입 시 가드는 있으나, **이미 진입한 후 mode 가 context-menu 로 바뀌어도 overlay 가 계속 보이는 케이스**가 있음 (LayerPicker가 context-menu 모드를 publish 하면서 rubber-band overlay 가 안 사라짐).
- **hover (use-hover-context.ts:176)** — `window.addEventListener("pointermove", … capture: true)` 모드 가드 0. 향후 overlay 합쳐졌을 때 새는 risk.
- **handMode publish (FrameStage.tsx:1209-1214)** — `transitionFrom("idle", "hand")` 정상 동작. 모드는 publish 됨. 그러나 위 binding 들이 안 봄.
- **Peek ("Layers") mode (use-peek-mode.ts)** — InteractionMode 를 **publish 하지 않음**. 자체 `peek.isActive` 상태만 보유. 즉 peek 활성 중에도 mode === "idle" 로 유지 → selection chrome, rubber-band overlay, frame drag binding 모두 idle 가드를 통과 → **peek 인스펙터 위에 selection 핸들과 rubber-band 박스가 그대로 떠 있음** (사용자 보고 2026-05-27). 추가 복잡성: vendor agocraft 의 InteractionMode 가 closed union 이라 "peek" 를 enum 에 추가 불가. weave-only product 상태이므로 별도 axis (`PeekActiveContext`) 로 분리 — 가드 hook 들이 mode + peekActive 두 축을 합성.

## Scope

### Phase 1 — Mode gate hardening (별도 PR, 머지 → 즉시 release)

**In scope**:

- 신규 hook `useEditAffordancesAllowed()` in `apps/web/src/document/interactions/interaction-mode.tsx`:
  - 반환 `InteractionMode === "idle"`.
  - `useFrameSelectionAllowed()` 와 동일 결과지만 의도 차별화 — *"affordance 표시 가능한가"* 의 단일 출처. Rule 6 (single-source mode hook) 준수.
  - 추후 hover overlay 의 visibility 게이트로 재사용.
- FrameStage 의 `useEffect`-based binding registration 을 mode 의존성으로 분기:
  - `createFrameMoveBinding`, `createFrameResizeBinding`, `createFrameRotateBinding` 는 mode === "idle" 일 때만 register. 비-idle 시 unregister → 자연스럽게 drag 가 시작될 수 없음.
  - `createRubberBandBinding` 도 동일.
  - `createPanBinding` 은 mode === "hand" 일 때만 register (현재는 항상 register, `enabled` 가 panActive 체크). 단순화 가능하지만 v1 에서는 기존 enabled-gate 유지.
  - useEffect 의존성에 `mode` 추가.
- `SelectionLayer` 의 host-level chrome 렌더링 게이트:
  - `useEditAffordancesAllowed()` 가 false 일 때 SelectionLayer 자체를 mount 안 함 (또는 props 로 `visible={false}` 전달). Layer-picker open 시 handles + outline 사라짐.
  - 단, **mid-drag (mode === "frame-manipulating")** 동안은 handles 가 계속 보여야 함. 별도 `useSelectionChromeVisible()` hook 신설 → `mode === "idle" || mode === "frame-manipulating"`.
- `RubberBandLayer` 의 overlay 렌더링 게이트:
  - rubber-band overlay 는 mode === "rubber-band" 일 때만 보여야 함 (이미 그렇지만, **end-of-gesture 의 layer-picker open** 직후에 overlay 가 잔류하는 케이스 확인 필요). 진단 + 잔류 시 cleanup.
- e2e (`apps/web/e2e/mode-gate-hardening.spec.ts` 신규):
  1. Space hold (or hand tool toggle) → 캔버스 위 frame 을 drag → frame 위치 불변 + pan 만 동작.
  2. 동일 조건에서 canvas-shape child 도 drag → 위치 불변.
  3. 우클릭으로 LayerPicker open → SelectionLayer handles, rubber-band overlay 모두 invisible.
  4. LayerPicker close → handles 복귀.
  5. Text editing 진입 중 다른 frame click → 선택 변경 X (기존 idle 가드가 잡지만 e2e 로 박제).

**Out of scope (Phase 1)**:

- 새 design-system primitive 없음.
- HoverAffordanceLayer 없음 (Phase 2-3).
- Vendor agocraft API 변경 없음 (mode-aware `enabled` predicate 추가는 HANDOFF 별도).

### Phase 2 — DR-design-016 + HoverAffordanceLayer primitive (별도 PR)

**In scope**:

- DR-design-016 발행 (records/design-reviews/DR-design-016-hover-affordance-layer.md):
  - Design System Triage 결과 박제: Step 3 Grew (새 primitive).
  - 3-tier 시각 토큰 명세: hover (strong: 2px solid accent + 4% glow), sibling (1px dashed accent-muted, opacity 0.55), parent (1px solid accent-muted + 4% inset tint).
  - 색은 모두 같은 hue base (var(--accent)) — 채도/스타일만 분리 → 한 그룹의 관계로 즉시 인지.
  - reduced-motion 대응: glow 제거, fade-in 즉시.
  - accessibility: visual-only affordance, screen reader 영향 없음 (`aria-hidden`).
- `packages/design-system/src/components/HoverAffordanceLayer.tsx`:
  - Props: `{ hovered: Rect | null; siblings: Rect[]; parent: Rect | null }` — coordinate space 는 design-plane 절대 px (host 가 변환 책임).
  - 내부에서 3 종 outline div 렌더. 토큰 기반. `pointer-events: none` 강제.
  - tree-shake 3-gate (ESM / sideEffects:false / no-decorators) — design-system 의 기존 export 패턴 준수.
- Storybook-equivalent demo (`apps/web/src/dev/HoverAffordanceLayerDemo.tsx` 같은 dev-only route): 정지 디자인에 hardcoded rect 로 3 종 표시 — visual review 용. production wiring 미포함.

**Out of scope (Phase 2)**:

- DesignPage wiring 미포함.
- 실시간 hover 추적 미포함.

### Phase 3 — DesignPage wiring + e2e (별도 PR)

**In scope**:

- `apps/web/src/pages/DesignPage.tsx`:
  - 기존 `useHoverContext()` 의 `hoveredId` 를 입력으로:
    - `findItemDeep(doc, hoveredId)` → 아이템 존재 확인.
    - `findParentAndIndex(doc, hoveredId)` (agocraft-mirror.ts:625) → 부모 + 인덱스 획득.
    - 부모 자식 리스트 = 형제 후보 → 자기 자신 제외.
    - 부모의 절대 frame box → parent overlay 좌표.
    - 각 형제의 절대 frame box → siblings overlay 좌표.
  - 좌표 변환 = `absoluteFrameBox(doc, id, designW, designH)` (WI-038 P2 도입) 재사용.
  - `<HoverAffordanceLayer />` mount in design-plane overlay subtree (SelectionLayer 와 동일 z-band; **SelectionLayer 아래** — selection chrome 가 hover overlay 위에 그려져야 우선 시인성).
  - visibility = `useEditAffordancesAllowed() && hoveredId !== undefined && !hoveredIsHandle && !hoveredIsQuickActionBar`.
- e2e (`apps/web/e2e/hover-affordance.spec.ts` 신규):
  1. Frame hover → 3 종 outline 등장 (data-hover-tier="hovered|sibling|parent" attribute 박제).
  2. PresentPage hover → outline 없음.
  3. Mid-drag (frame-manipulating mode) → outline 없음.
  4. Text editing → outline 없음.
  5. Hover 가 부모 frame 자체 위 (자식 없는 frame) → 형제 후보 없음 → hovered + parent 만.

**Out of scope (Phase 3)**:

- Hover persistence policy (sticky vs follow) — 단순 follow.
- Keyboard-driven hover preview (Tab/Arrow) — 미지원.

## Decisions (link)

- **DR-016 (예정)** — useEditAffordancesAllowed() vs useFrameSelectionAllowed() 분리 사유. *(미발행 — Phase 1 implementation 함께 박제)*
- **DR-design-016 (예정)** — 3-tier 시각 토큰 + Step 3 Grew triage. *(Phase 2 함께 박제)*

## Risk

- **R1** — Phase 1 binding-registration mode 분기가 frame-manipulating 진입 직후 unregister/re-register race 를 유발할 가능성. Mitigation: dependency 에 `mode` 만 넣고, mode === "frame-manipulating" 일 때는 기존 idle 등록 유지 (drag 가 mode 전환을 트리거하므로 register/unregister 가 미드-드래그에 일어나면 binding 이 사라짐). **idle | frame-manipulating** 두 모드에서 register 유지.
- **R2** — RubberBandLayer 의 잔류 overlay 가 layer-picker open 직후 발생 — Phase 1 진단 중 reproduce 시도. 못 잡으면 별도 후속 ticket.
- **R3** — Hover affordance 가 dense 디자인에서 시각 노이즈 발생 (형제 20+ 개) — 처음 v1 에서는 그대로 렌더. v1.1 에서 max-siblings cap 검토.
- **R4** — `findParentAndIndex` 가 O(n) — pointermove 마다 호출 시 60fps 보장 필요. 200ms 미만 hover-grace 안에 stable 한 경우 memoize. Performance smoke 가 Phase 3 launch gate 의무.

## Dependencies

- WI-038 P2 의 `absoluteFrameBox` 헬퍼 (이미 머지).
- WI-027 의 `useHoverContext` (이미 머지).
- agocraft `findParentAndIndex` (이미 머지).
- Vendor agocraft 변경 없음.

## Acceptance

- Phase 1 e2e 5 spec PASS.
- Phase 2 demo route 에서 3 종 시각 톤이 같은 hue 안에 있다고 design review 가 박제 (DR-design-016 §"Visual evidence").
- Phase 3 e2e 5 spec PASS, performance smoke 60fps hover (M1, Chromium).
- LG-001 hover affordance row CONDITIONAL READY 이상.

## History

- 2026-05-27 — WI-040 발행. Phase 1 코드 위치 audit 완료. (auto-memory: project_weave_wi040_hover_and_mode_gate_2026_05_27)
- 2026-05-27 — Phase 1 머지: useEditAffordancesAllowed / useSelectionChromeVisible / useFrameDragBindingsAllowed hook 3개 + PeekActiveContext + RubberBandLayer 잔류 cleanup + 5 e2e PASS. 사용자 보고 peek leak 추가 fix 포함.
