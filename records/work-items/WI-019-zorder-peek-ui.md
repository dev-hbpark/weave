# WI-019 — Z-order Peek UI (consumer of agocraft WI-014)

## Metadata

| Field | Value |
|---|---|
| ID | WI-019 |
| Type | feature (consumer of agocraft primitive) + design-system growth |
| Owner (weave) | hbpark |
| Counterpart (agocraft) | HANDOFF-005 / WI-014 |
| Date opened | 2026-05-24 |
| Severity | P2 — new feature, no regression risk to existing UX |
| Status | **Open — Phase 0 (DS triage + adapter contract) ready** |
| Related | DR-013 (peek-mode adapter), DR-design-008 (4 new primitives), WI-013/14/15/16/17/18 (editor-core stack), HANDOFF-005 |

## Problem

design 다큐먼트 수가 늘어나면서 (Phase 11~13의 Frame-in-Frame nesting + 4 domain 각자의 item stack) z-order의 현재 상태를 시각적으로 확인하기 어렵다. 기존 편집 도구의 평면 layer list는:

- N개 다큐먼트의 평면 list scroll은 wayfinding 비용 큼.
- "여기 무엇이 쌓여 있나?"의 답이 직접 보이지 않음 — 사용자가 hidden item을 클릭해서 발견해야.
- nested frame과 결합 시 "이 frame의 layer 패널을 따로 봐야 하나?" 혼란.

2026-05-24 PoC (`workspace/weave/experiments/zorder-peek/index.html`, 744 줄)로 **Space-hold local stack lift + drag-to-Z reorder + Point Stack Inspector**의 인터랙션을 검증 — 사용자 dogfood에서 "마음에 들어" → production 적용 결정.

## Desired

| 측면 | 목표 |
|---|---|
| 진입 | `Space` hold + cursor hover. 평면 시각 유지 (canvas 14° subtle tilt). |
| 시각 | cursor 반경 24px의 K개만 공중으로 fan up — 주변은 dim. |
| Inspector | docked-right Panel에 cursor stack을 top=highest z 순서로 렌더. |
| Reorder | Inspector 행 drag 또는 lifted item vertical drag. |
| Commit | drop 시점에 단일 `editor.exec` → 1 undo step. |
| Scope | 현재 entered frame 내부의 item만 (DR-013 Decision B). |
| Mode | pan과 Space 결합 (DR-013 Decision C — Combined). |
| Reduced motion | `prefers-reduced-motion: reduce` 시 lift animation 0ms. |

## Acceptance Gate

### Phase 0 — Contracts ready

1. agocraft WI-014 Phase 0 완료 — type-only contracts published.
2. DR-013 (peek-mode adapter) accepted.
3. DR-design-008 (4 primitives) accepted + design-system-agent sign-off.

### Phase 1 — Design System growth (DR-design-008)

4. `@weave/design-system`에 `Panel`, `Switch`, `Badge`, `Kbd` 4 primitives 박제 + tokens resolve + theme 3종 e2e visual pass.
5. `@radix-ui/react-switch` 신규 의존 추가 — `library-adoption-supply-chain-governance-agent` sign-off.
6. Storybook (있다면) entry 박제 — 각 primitive의 variant matrix visual.

### Phase 2 — ZOrderCapability adapter 등록

7. agocraft WI-014 Phase 4 publish 완료 → weave deps bump → `pnpm install`.
8. `apps/web/src/document/zorder/` 신규 폴더 + 4 adapter:
   - `design-frame.zorder.ts`
   - `canvas-design-item.zorder.ts`
   - `slide-item.zorder.ts`
   - `hotspot.zorder.ts`
9. `useWeaveEditor`의 mount 시점에 `editor.capabilities.register(ZORDER_CAPABILITY, kind, adapter)` 4번 호출.
10. unit test: 4 adapter 각각 `readZ` / `writeZ` 정확성 (8 tests 이상).

### Phase 3 — Peek overlay + Inspector UI

11. `apps/web/src/document/peek-mode/PeekOverlay.tsx` — `vm.peekMode.isActive` 구독 + 3D CSS lift visual + cursor ring + ghost outline.
12. `apps/web/src/document/peek-mode/PointStackInspector.tsx` — Panel + Switch + Badge + Kbd 조합. cursor stack rendering + drag-to-reorder.
13. DesignPage에 PeekOverlay + Inspector wire — `useEditorVM(vm => vm.peekMode.liftSet)` 단일 구독.
14. PeekModeController instance를 `useWeaveEditor`에서 생성 + `vm.peekMode` slot에 expose.
15. Frame entered 변경 시 controller의 `resolveIndex`가 새 FrameSpatialIndex로 swap.
16. Space hotkey가 hand-tool / drawing / frame-manip mode와 자연 양보 (DR-013 Decision C).

### Phase 4 — e2e regression coverage

17. `apps/web/e2e/history-zorder-peek.spec.ts` 신규 — DR-013 §Decision E의 6 시나리오 모두 박제.
18. 기존 42/5/0 e2e baseline 유지.
19. `pnpm typecheck` + `pnpm test --run` + `pnpm e2e` 모두 green.
20. backdrop-filter 회귀 0 — [[feedback_backdrop_filter_under_transform]]의 `translateZ(0) + will-change: backdrop-filter` + `isolation: isolate` 박제 확인.
21. React StrictMode (dev) 환경에서 PeekModeController가 mount/cleanup pair에서 dispose 호출 0 — [[feedback_react_strictmode_singleton_dispose]] 회피 확인.

### Cross-cutting

22. WI-013 / WI-018에서 정착된 `editor.exec → ChangeStream → History` 의무 — drag commit이 단일 exec, mergeKey로 60Hz collapse, Cmd+Z로 정확히 복귀.
23. PoC의 5 인터랙션 (peek 진입 / hover lift / 1-hop expand toggle / drag reorder / drop commit) 모두 production-equivalent 구현.

## Phase 표

| Phase | 산출 | 의존 | 상태 |
|---|---|---|---|
| 0 — Contracts ready | DR-013 + DR-design-008 박제, agocraft WI-014 Phase 0 ready | agocraft WI-014 Phase 0 | 🔵 ready |
| 1 — Design System growth | 4 primitives in `@weave/design-system` + Radix Switch dep | DR-design-008 sign-off | ⏳ |
| 2 — Adapter 등록 | 4 ZOrderCapability adapters + register | agocraft WI-014 Phase 4 publish | ⏳ |
| 3 — Peek UI | PeekOverlay + PointStackInspector + Frame swap | Phase 1 + Phase 2 | ⏳ |
| 4 — e2e + verification | 6 e2e + baseline maintain | Phase 3 | ⏳ |

## Risks (weave 측)

| Risk | 영향 | 대응 |
|---|---|---|
| Space와 pan의 mode 충돌 (DR-013 Decision C) 실 사용에서 어색 | UX 손상 | Phase 4 사용자 dogfood + GrowthBook telemetry (peek↔pan transition frequency). 어색 시 modifier로 분리 (Option 3 fallback). |
| backdrop-filter drop ([[feedback_backdrop_filter_under_transform]]) | Inspector glass가 peek 진입 직후 flash | Phase 3 박제 의무: `translateZ(0)` + `will-change: backdrop-filter` + `isolation: isolate`. Storybook visual diff에서 check. |
| Frame nesting drill scope 한정으로 UX 손실 | 부모 frame siblings의 z 조작 시 drill-out 필요 | Phase 4 사용자 telemetry — frequency 보고 Phase 5 (modifier expansion) 트리거. |
| React StrictMode dispose | Dev에서 peek mode가 mount/cleanup으로 영구 disable | Phase 3 PeekModeController instance는 factory + 명시적 dispose. useEffect cleanup에서 dispose 호출 0. e2e가 dev mode strict-double-mount에서 회귀 검출. |
| design system primitive growth (4개)와 ThumbnailPanel / PropertiesPanel migration의 동시 진행 시 회귀 | 패널 visual / a11y 손상 | ThumbnailPanel / PropertiesPanel migration은 별 PR로 분리 (DR-design-008 §9). 본 WI에서 Panel만 출시 + Inspector 채택. |
| Adapter 부재 도메인 (block-doc) UI noise | block-doc item 위에서 peek 진입 시 빈 stack 표시 | Phase 3: `editor.capabilities.has` 사전 확인 — z 부재 도메인은 peek 진입 시 modeline에 "이 도메인은 z-order 미지원" 표시. |

## Cross-project channel

이 WI의 agocraft 측 작업은 `workspace/agocraft/records/decision-handoffs/HANDOFF-005-zorder-spatial-peek-mode.md`로 inbox 발송 완료. agocraft WI-014가 응답. 본 문서는 weave 측 책임 / acceptance gate / 회귀 risk만 기록.

## Status log

- 2026-05-24 — 본 WI 발행, HANDOFF-005 동시 발행, DR-013 + DR-design-008 proposed.
- 2026-05-24 — PoC source committed at `experiments/zorder-peek/index.html` (744 줄, 의존성 0, 사용자 dogfood 통과).

## References

- HANDOFF-005 — `records/decision-handoffs/HANDOFF-005-zorder-spatial-peek-mode.md` (sender record)
- DR-013 — `records/decisions/DR-013-peek-mode-adapter.md`
- DR-design-008 — `records/design-reviews/DR-design-008-panel-switch-badge-kbd.md`
- Feature folder: `features/zorder-peek/ENGINEERING_PLAN.md`
- agocraft WI-014 — `workspace/agocraft/records/work-items/WI-014-zorder-spatial-peek-mode.md`
- agocraft DR-021 / DR-022 — capability + spatial source
- PoC — `experiments/zorder-peek/index.html`
- 관련 메모: [[feedback_design_system_triage_mandatory]], [[feedback_doc_mutation_must_hit_history]], [[feedback_backdrop_filter_under_transform]], [[feedback_react_strictmode_singleton_dispose]], [[project_weave_phase13_2026_05_23]]
