# Engineering Plan — WI-036 QuickActionBar UX 재설계

## Surfaces (3)

| Surface | 변경 |
|---|---|
| **S1**: `packages/design-system/src/components/QuickActionBar.tsx` | `data-quick-actions-bar="true"` attribute 박제 + `hoverTargetUnion?: boolean` prop (default true). DR-design-012. |
| **S2**: `apps/web/src/document/interactions/use-hover-context.ts` | `readHoverInfo` 의 closest lookup 확장 — `[data-quick-actions-bar]` 도 frame hover 의 연속으로 인식 (의 ancestor 의 `[data-frame-id]` 가 있는 경우). + 200ms grace period — `setTimeout` ref + cleanup. |
| **S3**: `apps/web/src/pages/FrameStage.tsx` (NestedFrame) | bar 의 absolute mount — frame top-left edge 의 outside (frame edge 위 8px). counter-scale wrap (transform inverse). DesignPage 의 fixed mount 제거. |

## SOLID + GRASP review

| 원칙 | 적용 |
|---|---|
| **S** (Single Resp) | QuickActionBar = visibility filter + render. NestedFrame = mount 위치. useHoverContext = hover state machine + grace. 각 surface 의 책임 명확. |
| **O** (Open-Closed) | data attribute 추가는 backward-compatible. `hoverTargetUnion` default true → 기존 host 의 영향 0. grace period 의 default 200ms. |
| **L** (Liskov) | QuickActionBar 의 새 prop 은 optional. host substitution OK. |
| **I** (Interface Seg) | useHoverContext API 의 외부 shape 미변경 — internal grace timer 만 추가. |
| **D** (Dep Inversion) | primitive 가 host 의 hover state 를 모름 — host 가 attribute 박제로 의도 표시. |
| **Information Expert** | useHoverContext = hover lookup 의 expert. grace timer = useHoverContext 안 (다른 hook 의 책임 분산 0). |
| **Creator** | bar wrap div 의 lifecycle = QuickActionBar primitive. mount 위치 = host. |
| **Controller** | DesignPage = mount controller. NestedFrame = anchor controller. useHoverContext = state controller. |
| **Low Coupling** | primitive ↔ host 의 contract = data attribute 만. internal API 미공유. |
| **High Cohesion** | grace + lookup = useHoverContext. mount + counter-scale = NestedFrame. attribute = primitive. 분산 0. |

## Phase

### Phase 1 — primitive 확장 (DR-design-012)

- [ ] `QuickActionBar` 에 `hoverTargetUnion?: boolean` (default true) + `data-quick-actions-bar="true"` 박제.
- [ ] design-system unit test — attribute 박제 확인.
- [ ] `pnpm -F @weave/design-system build` + typecheck.

### Phase 2 — useHoverContext 확장

- [ ] `readHoverInfo` 의 closest lookup 의 union — `[data-frame-id]` OR (`[data-quick-actions-bar]` 의 ancestor 의 `[data-frame-id]`).
- [ ] grace period — `useRef<NodeJS.Timeout | null>(null)` + leave 시 200ms setTimeout, enter 시 clearTimeout.
- [ ] unit test — synthetic event 의 sequence (frame enter → leave → bar enter (300ms 후) → bar click). 의 detection.

### Phase 3 — NestedFrame anchor mount

- [ ] FrameStage 의 NestedFrame 안 absolute mount — `top: -32px, left: 0`. (frame 외부 위쪽 8px gap — visual breathing).
- [ ] counter-scale wrap — frame 의 cumulative scale 의 inverse 의 transform.
- [ ] DesignPage 의 fixed `top-16 right-4` mount 제거.

### Phase 4 — e2e

- [ ] `figma-quickaction-add.spec.ts` 의 기존 1 spec PASS 유지 (single hover + click).
- [ ] **신규**: connected gesture — hover frame → mouse 가 frame edge 밖 (10px gap) → bar 위 도착 → click. PASS.
- [ ] **신규**: grace expire — hover frame → leave → 300ms wait → bar 사라짐. PASS.
- [ ] WI-033 / WI-034 / WI-035 의 24 e2e 회귀 0.

### Phase 5 — LG-002 update

- [ ] LG-002 의 conditional P2 UX close.
- [ ] WI-036 의 status Done.

## Out of scope

- C (sticky + handle) 의 별 UI 패턴.
- AITooltip 의 같은 gap 패턴 (의 fix 가 검증되면 별 WI 후속).
- Frame 의 selected 시 bar 의 sticky pinned 모드.
- Bar 의 auto-flip (frame top 공간 부족 시 bottom).

## 의존

- WI-027 (QuickActionBar primitive) — 사용 중.
- WI-035 P2 (frame.addChild command) — 의 회피 경로 보존.
- DR-design-012 (primitive 확장 review) — Phase 1 의 prerequisite.

## Links

- WI-036, FR-007, RISK-006, DR-design-012.
- LG-002 의 P2 UX conditional close.
