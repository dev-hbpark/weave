# WI-043 — Frame layout UX (option+drag layout-type picker + ContextualToolbar layout-change)

## Metadata

| Field | Value |
|---|---|
| ID | WI-043 |
| Title | Frame 생성 시점에 layout 패러다임 선택 (Absolute / Flex / Grid) + 이미 만든 frame 의 layout 변경 — weave 측 user-visible UX |
| Owner | hbpark |
| Status | **B1-B6 implementation green + relayout FIX verified, e2e + LG deferred** (2026-05-28). agocraft `1.0.0-rc.20260528021043` vendor adopted. Frame layout type UX: Option+drag A3 toggle + ContextualToolbar SegmentedControl + Bar.More paradigm-specific 4+4 control + TrackSizeEditor + padding + 3 design-system icons (DR-design-019). **FIX (2026-05-28): "자식 추가 시 자동 정렬 안 됨" 버그 — relayout-on-child-add wire 누락. `weave.item.add` 에 `computeChildAddRelayout` 추가 (부모 layout spec 있으면 onParentResize no-op 으로 전체 자식 재배치, 새 자식 frame override + sibling item.attrs patches 단일 transaction), reflow 게이트 WI019→WI019\|\|WI020, 두 flag 활성화. 5 integration test 검증.** weave 4-gate green (typecheck 19/19, vitest 207, declarativecheck OK, puritycheck OK, build). e2e (B5.2) + LG (B6 gate) operational readiness 신호 대기. alignSelf/justifySelf per-child editor + TrackSizeEditor drag-reorder 는 별 PR. |
| Severity | P2 (LG-001 영향 0, post-launch v1.x feature) |
| Created | 2026-05-28 |
| Target date | Discovery = 2026-05-28 (이 세션). Build = agocraft 1.1.0-rc 채택 + weave staging window |
| Closed | — |
| Related | agocraft [WI-019](../../../agocraft/records/work-items/WI-019-layout-management.md) (parent v1), agocraft [WI-020](../../../agocraft/records/work-items/WI-020-layout-variants-expansion.md) (parent v1.1), weave [WI-042](WI-042-layout-management-wiring.md) (v1 wiring), [HANDOFF-006](../decision-handoffs/HANDOFF-006-from-agocraft-layout-management-wiring.md) (v1 active), HANDOFF-017 (v1.1, agocraft B6 후 inbound 예정) |

## Summary

**현재 상태**:
- WI-042 가 agocraft v1 (absolute-constraints) 를 weave 에 wire — `WI019_LAYOUT_ENABLED = false` flag 뒤에서 dark.
- weave 사용자 가 frame 을 만들 때 (Option+drag popup) layout paradigm 선택 surface 부재.
- 이미 만든 frame 의 layout paradigm 사후 변경 부재 — ContextualToolbar `frame-background-section.tsx` 는 Background color 하나만.
- weave 의 `apps/web/src/document/insertable/design-root.insertable.ts` 가 RecommendationPopover 의 bucket(wide/tall/square) × kind(frame/image/text/shape) 8 종 추천 — layout 개념 없음.

**원하는 변화**:
- Option+drag popup 에 "Layout: Absolute / Flex / Grid" 옵션 추가 — 사용자가 frame 생성과 동시에 paradigm 선택. agocraft 의 `attrs.layout` 를 `weave.item.add` command 가 합성.
- ContextualToolbar 의 frame section 에 "Layout type" SegmentedControl 추가 — 선택 변경 시 `weave.frame.setLayout` 신규 command → `item.layout` Patch 발행.
- PropertiesPanel (없으면 신규) 에 paradigm-specific fields (Flex: direction/gap/justify/align/padding; Grid: columns/rows/span/gap/padding).
- 전 surface 가 `WI019_LAYOUT_ENABLED = true` 활성화 (별도 flag 분리 가능).

## Scope

### In scope (v1.1 — WI-020 ship 후)

- **A. Option+drag popup layout-type 옵션** (`apps/web/src/document/insertable/design-root.insertable.ts`):
  - bucket × kind 의 frame 추천 (wide-frame / tall-frame / square-frame) 에 layout sub-option 추가. UX 선택지:
    - **A1**. 1차 layer = bucket × kind (현재), 2차 layer = layout type (Absolute / Flex / Grid). 사용자가 frame 선택 → submenu 또는 secondary popover.
    - **A2**. 1차 layer 에 layout-typed frame 추천 (예: "와이드 Flex 프레임", "정사각 Grid 프레임") 으로 8 → ~15 개로 확장.
    - **A3**. frame 추천 옆에 작은 "Layout: [Absolute] [Flex] [Grid]" toggle (modifier-like).
  - **결정 의무**: Discovery 결론은 **A3** (선택 cost 최소, A1 의 submenu 은 popover-within-popover 의 a11y 비대, A2 는 추천 list 폭발). Engineering Plan 박제.
- **B. ContextualToolbar frame section** (`apps/web/src/document/toolbar/sections/frame-background-section.tsx`):
  - 기존 Background ColorPicker + 신규 "Layout type" SegmentedControl (Absolute / Flex / Grid) + IconLayoutAbsolute/Flex/Grid (DR-design 의무, RISK-002 C2.4).
  - 변경 시 `weave.frame.setLayout` 신규 command → `item.layout` Patch (before/after) + (optional) layoutChild bulk reset (자식이 absolute-constraints 정책이면 새 paradigm 의 default 정책으로 fallback — RISK-002 C2.3 cubic-bezier motion 적용).
- **C. PropertiesPanel paradigm-specific fields** (신규 또는 기존 패널 확장):
  - Flex: direction (row/column), gap (slider), justify (5 option), align (4 option), padding (4 input).
  - Grid: columns / rows 의 TrackSize list editor (ratio / fr / auto), span (자식별), gap (column + row), padding.
  - Mixed selection 대응 (MixedBadge 패턴 재사용).
- **D. 신규 command** (`apps/web/src/document/commands.ts`):
  - `weave.frame.setLayout({ itemId, layout: LayoutSpec | undefined })` — `item.layout` Patch 발행. 자식 layoutChild kind mismatch 면 absolute-constraints fallback (FR-009 T6 결정).
  - `weave.item.setLayoutChild({ itemId, policy: LayoutChildPolicy | undefined })` — `item.layoutChild` Patch.
  - `weave.item.add` 의 input 에 optional `layout?: LayoutSpec` — frame 생성과 동시에 attrs.layout 설정.
- **E. design-system 신규 컴포넌트** (`packages/design-system/`):
  - `IconLayoutAbsolute` / `IconLayoutFlex` / `IconLayoutGrid` (Triage Step 3 Grew, DR-design 의무)
  - TrackSizeEditor (signature: `value: ReadonlyArray<TrackSize>` + `onChange`, role=list) — Triage 판정 (Step 3 Grew 또는 Step 4 — composite reuse 후보)
- **F. feature flag** (`apps/web/src/document/layout/registry.ts`):
  - `WI019_LAYOUT_ENABLED` 와 별도 또는 통합. v1.1 UI 는 별도 flag `WI020_LAYOUT_VARIANTS_ENABLED` 권장 (rollback 독립). Build 의 결정 의무.
- **G. agocraft 1.1.0-rc 채택** (`apps/web/scripts/repack-vendor.sh` 재실행).
- **H. e2e**: 5 시나리오 (option+drag layout 선택 / ContextualToolbar 변경 / PropertiesPanel flex field 변경 / PropertiesPanel grid span / undo).

### Out of scope (v1.1)

- Layout transition / animation 의 motion deep-tune (cubic-bezier 정합만, advanced spring physics 제외).
- TrackSizeEditor 의 drag-handle resize UX (input 만 v1.1, drag 는 별 PR).
- Mixed-paradigm selection (선택된 frame 들의 layout 이 서로 다를 때) 의 자세한 UX — 기본 Mixed 표시만.
- A11y advanced patterns (focus restoration, focus trapping) — 표준 design-system pattern 적용 (RISK-002 C4.1-C4.5).
- 외부 host adoption 검증.
- agocraft v2 (wrap / baseline / grid-template-areas) — 별도 WI.

## Dependencies

- **agocraft WI-019 (v1)** — WI-042 wiring 통해 already trunk-merged (flag default false). 본 WI 의 base.
- **agocraft WI-020 (v1.1)** — 본 WI 의 user-visible UX 의 platform 의무. agocraft B1-B6 완료 + 1.1.0-rc publish 후 본 WI Build 가능.
- **weave LG-001** (2026-06-08) — 본 WI 의 v1.1 ship 은 LG-001 이후. Discovery / Feasibility / Risk / Plan 은 LG-001 전 병행 OK.
- **HANDOFF-006** (active) — 본 WI 가 agocraft v1 surface 위에 build. close 의무 (WI-042 의 별 PR phase).
- **HANDOFF-017** (예정) — agocraft B6 후 inbound. weave 측 wiring 의 contract.

## Done criteria

### Discovery (이 turn) — DONE
- [x] WI-043 발행 (이 파일)
- [x] feature folder skeleton — `features/frame-layout-ux/` (CLAUDE.md + RULE.md + README.md + WORK_ITEM.md)
- [x] 메모리 — `project_weave_wi043_frame_layout_ux_2026_05_28.md` + MEMORY.md 1 line
- [x] UX 결정 A3 (Option+drag toggle) 박제 + 결정 근거

### v1.1 ship (이 WI 의 close criterion)
- Option+drag popup 의 layout-type toggle (A3) 가 frame 생성과 동시에 attrs.layout 설정 + 5 user × 5 task usability session 통과
- ContextualToolbar layout SegmentedControl 변경이 `weave.frame.setLayout` command + cubic-bezier motion + child policy fallback 동작
- PropertiesPanel Flex/Grid 신규 field 가 mixed selection cover
- agocraft 1.1.0-rc 채택 + 4 gate (typecheck / vitest / declarativecheck / puritycheck) green
- e2e 5 시나리오 PASS
- axe-core a11y smoke PASS (RISK-002 C4.5)
- size-diff CI gate PASS (sub-path 자동 — wire 안 한 kind = byte 0)
- DR-design 박제 (3 layout icon + TrackSizeEditor Triage)

## Phases

| Phase | Owner / scope | Output | Status |
|---|---|---|---|
| **P0 Discovery** | weave | WI + feature folder + memory + UX 결정 (A3) | **DONE 2026-05-28** (이 turn) |
| **P1 Feasibility** | weave | 별도 FR (간단 — UX surface, 알고리즘 의존성 없음) | optional, agocraft FR-009 이 base 라 skip 가능 (Discovery 에서 확인) |
| **P2 Risk** | weave | 별도 RISK 또는 agocraft RISK-002 의 weave 측 conditions (C2.x + C4.x) 상속 | **agocraft RISK-002 conditions 14 항목 그대로 적용** |
| **P3 Engineering Plan** | weave | features/frame-layout-ux/ENGINEERING_PLAN.md | agocraft B6 완료 후 박제 |
| **B1** vendor adoption | weave | repack-vendor.sh 실행 (agocraft `1.0.0-rc.20260528021043` 채택) + `derive-text-auto-resize.ts` 의 LayoutChildPolicy union 확장 narrowing (auto-flex/auto-grid 자식 → WIDTH_AND_HEIGHT default) + `apps/web/src/document/layout/registry.ts` 에 `WI020_LAYOUT_VARIANTS_ENABLED` flag 신설 (default false, v1 flag 와 독립) + 활성화 시 createAutoFlexAdapter + createAutoGridAdapter mount + weave typecheck 통과. | **DONE 2026-05-28** |
| **B2** design-system layout icons + commands + Option+drag A3 toggle | weave | (a) `packages/design-system/src/components/Icon.tsx` 에 `IconLayoutAbsolute` / `IconLayoutFlex` / `IconLayoutGrid` 3 신규 SVG (Triage Step 3 Grew, RISK-002 C2.4) + barrel 확장; (b) `apps/web/src/document/commands.ts` 에 `weave.frame.setLayout` + `weave.item.setLayoutChild` 신규 (item.layout / item.layoutChild Patch 발행, no-op early-out, mergeKeyOf 통합) + `agocraft-mirror.ts` 의 reducer 에 두 case 추가; (c) `InsertableCapability` 에 `supportsLayoutTypeToggle` flag + `InsertableCommitContext.layoutType` optional 추가; `design-root.insertable.ts` 의 commit 이 frame-kind + layoutType 있을 때 `pickDefaultLayoutSpec` 호출하여 `attrsOverride.layout` 합성; `RecommendationPopover` 에 `LayoutTypeToggle` 신규 (3 radio with 3 icon, role=radiogroup, aria-checked); `agocraft-adapter.ts` 에 `AdapterExtras.getLayoutType` callback (closure over RubberBandLayer state); `RubberBandLayer` 에 `layoutType` useState + ref + popover wiring (showLayoutTypeToggle conditional spread for exactOptional). | **DONE 2026-05-28** |
| **B3** ContextualToolbar layout SegmentedControl | weave | `frame-background-section.tsx` 확장 — `Bar.Quick` 에 `SegmentedControl<LayoutKindChoice>` (3 option + 3 icon + aria-label) + Mixed-aware (homogeneous 검사 + MixedBadge) + onChange 가 `weave.frame.setLayout` 호출 (selected 의 모든 frame). `deriveLayoutChoice` / `specForChoice` 헬퍼. | **DONE 2026-05-28** |
| **B4** PropertiesPanel paradigm-specific fields | weave | `frame-background-section.tsx` 의 `Bar.More` 슬롯에 paradigm-conditional fields: (Flex) Direction SegmentedControl + Gap NumberSlider + Justify (5 option) + Align (4 option) — 4 control; (Grid) Column gap NumberSlider + Row gap NumberSlider + Justify (4) + Align (4) — 4 control. `Bar.Field` primitive (a11y wrap) + design-system NumberSlider/SegmentedControl. Mixed 또는 absolute 시 More 미출현. | **DONE 2026-05-28** |
| **B6 (early)** TrackSizeEditor + padding editor | weave | DR-design-019 박제 (3 layout icon + TrackSizeEditor, Triage Step 3 Grew × 4, RISK-002 C2.4). `packages/design-system/src/components/TrackSizeEditor.tsx` 신규 primitive (TrackSize discriminated union list editor — kind SegmentedControl + value NumberSlider + add/remove, role=list/listitem, a11y per-row aria-label, minRows/maxRows). Grid Bar.More 에 columns/rows TrackSizeEditor 통합. Flex + Grid 양쪽 Bar.More 에 `PaddingFields` (4-side NumberSlider sub-form, 공유 컴포넌트). 4 gate green (typecheck 19/19, vitest 202, declarativecheck OK, puritycheck OK, build). **alignSelf/justifySelf per-child editor + TrackSizeEditor drag-reorder 는 별 PR** (per-child surface — frame-background-section 의 parent-spec scope 밖). | **DONE 2026-05-28** |
| **B5** feature flag + 4-gate green | weave | `WI020_LAYOUT_VARIANTS_ENABLED` flag (B1 에 박제) + weave typecheck 19/19 + declarativecheck OK + puritycheck OK (.domain-purity not enforced — host) + vitest 202/202 (apps/web 18 files) + build PASS. | **DONE 2026-05-28** (4-gate) |
| **B5.2** e2e + axe smoke | weave | 5 e2e 시나리오 (option+drag layout / ContextualToolbar 변경 / PropertiesPanel flex / PropertiesPanel grid / undo) + axe-core smoke (RISK-002 C4.5) + size-diff CI gate 검증 | **deferred — Operational Readiness 단계 신호 대기** (memory `feedback_operational_readiness_deferred.md` policy — 사용자가 명시적 "운영 준비단계 시작" 선언 시 진행) |
| **B6** LG (post-staging) | weave | LG-003 또는 WI-019 LG follow-up | **deferred — Operational Readiness 단계 신호 대기** |

## Escalation triggers

### Product Discovery Skill

| Trigger | 적용 | 조치 |
|---|---|---|
| data | 없음 | — |
| payment | 없음 | — |
| AI | 없음 | — |
| **public** | weave 의 public surface 변경 (사용자 facing UX) — but 외부 API 아님 | LG 의무 (LG-003) |
| legal | 없음 | — |

### DECISION_ESCALATION_PROTOCOL

| Trigger | 적용 | 조치 |
|---|---|---|
| **User experience impact** | **YES** — 핵심 user-visible 변경 | usability session 의무 (5 user × 5 task) |
| Architecture boundary change | minimal — 기존 ContextualToolbar / PropertiesPanel 확장 + 신규 command 2 종 | SOLID + GRASP review (Engineering Plan) |
| Release schedule impact | minimal — LG-001 영향 0 | post-LG-001 staging window |

### Pair-with

- **design-system-agent** (의무) — 3 layout icon + TrackSizeEditor Triage
- **interaction-motion-philosophy-agent** (의무) — cubic-bezier motion (C2.3)
- **copy-information-architecture-agent** (의무) — SegmentedControl helper text + docs (C2.1, C2.2)
- **frontend-architecture-agent** (의무) — PropertiesPanel a11y + Field/Label/Description primitive (C4.2)
- **content-seo-strategy-agent** (선택) — Flex vs Figma vs CSS 차이표 docs page (C2.2)

## Build Log — Manipulation Constraints UI (2026-05-28)

레이아웃이 부여하는 **이동/크기변경/회전 제한**을 selection chrome 에 반영하는 작업 완료. 핵심 원칙: 제약의 *계산*은 전적으로 agocraft `LayoutEngine.getChildConstraints` 소유(WI-020/WI-021), weave 는 그 값을 **읽어서 UI 만 필터** — 레이아웃 분기 0.

- `FrameStage.tsx` `resolveHandles`: `getChildConstraints({ root, itemId })` 의 `canResizeWidth/Height` 로 resize 핸들 dir 필터(코너는 양축 모두 허용 시에만 생존), `canRotate=false` 면 rotate 핸들 제거. text auto-resize 제한과 **교집합**으로 합성.
- `FrameStage.tsx` frame-move binding: `acceptTarget` 가 `canMove=false` 인 자식의 free body-drag 를 decline → 선택만 되고 이동 안 됨(reflow snap-back 잰크 방지). absolute/top-level frame 은 기존대로 자유 이동.
- `LAYOUT_FEATURE_ENABLED` 게이트 하에서만 동작 (host policy).

검증 (Continuous Self-Verification, `e2e/layout-constraints-verify.spec.ts`):
- absolute child → `resize-{8} + rotate` 전부.
- flex-row(stretch) child → `["resize-e","resize-w"]` (주축만, rotate 없음).
- grid child → `[]` (핸들 없음).

agocraft 4-gate green (layout 182 test) + weave 4-gate green (212 test, typecheck/declarative/build). vendor `1.0.0-rc.20260528043207`.

### FIX — 레이아웃 컨테이너 프레임 이동 경로 (2026-05-28)

첫 구현은 `canMove=false` 자식의 free body-drag 를 `acceptTarget` 으로 decline 했는데, **stretch flex/grid 는 자식이 프레임을 가득 채워서** 컨테이너 프레임을 잡을 본문 영역이 사라져 **프레임 자체가 이동 불가**가 됨 (사용자 지적). Figma auto-layout 모델로 교체:

- `acceptTarget` 게이트 제거. 대신 `frameAccess.resolveTarget` 가 move 대상을 **가장 가까운 movable 조상**으로 climb (`climbToMovable` — agocraft `getChildConstraints().canMove` 만 읽음, 레이아웃 계산 0). layout 자식을 누르면 그 컨테이너가 이동 대상.
- **선택 기반 redirect**: 단일/다중 선택된 프레임 *내부 아무 곳*(본문·shape·텍스트·중첩 프레임)을 drag 하면 그 프레임(→movable 조상)이 이동 대상. shape 가 프레임을 채워도 컨테이너가 잡힘. (무선택 시 기존 shape-bail 보존 → shape 단독 drag 비활성 유지.)
- 자식의 *개별* 이동은 여전히 제한(=컨테이너가 움직임) — 사용자 합의된 "flex/grid 자식 이동 제한"과 일치.

검증 (`layout-constraints-verify.spec.ts`, 실드래그): stretch flex 프레임의 자식 위를 drag → 컨테이너 frame `(0.08,0.15)→(0.17,0.24)` 이동, 자식의 프레임-내 ratio 불변. `figma-parent-first-select` + `layout-relayout-verify` 회귀 0. (별개 사전-존재 실패 `figma-cmd-click-deep-select` 2건 = ThumbnailPanel 중복 data-frame-id strict-locator 이슈, 본 변경과 무관 — stash 후 baseline 재현 확인.)

### FIX — reparent 시 새 부모 layout 편입 (2026-05-28)

플렉스 프레임 F 안의 도형 S 를 내부 프레임 F2 의 자식으로 변경하면 S 가 F 의 layout 을 벗어나 F2 의 layout 을 따라야 하는데, `weave.item.reparent` 가 tree-move(+visual-preserving newFrameRatio) 만 하고 layout 을 무시 (사용자 지적).

- `reparentItem.run` 이 patchEntries 계산 후 각 entry 에 대해 agocraft `getLayoutEngine().onReparent({ root: ctx.document.root, itemId, oldParentId, newParentId })` 호출, 반환 full-attrs Patch 를 `item.reparent` patch **뒤에** append (1 transaction, Cmd+Z atomic). `LAYOUT_FEATURE_ENABLED` 게이트.
- 모든 layout 결정(새 부모 배치 / policy 재할당 / 이전 부모 reflow)은 agocraft 소유 — weave 는 append 만.

검증 (`layout-constraints-verify.spec.ts`): flex F=[S, 내부 grid F2] 에서 S→F2 reparent → S.parent=F2, S.layoutChild `auto-flex→auto-grid` 재할당, S grid cell 배치(x≈0), 이전 부모 F 가 남은 F2 를 x 0.51→0 reflow. 11 e2e green (constraint/move/reparent + relayout + parent-first 회귀 0). weave 212 unit + 4 gate green. vendor `1.0.0-rc.20260528054808`.

### FIX — 디자인 루트로 reparent drag 가능하게 (2026-05-28)

프레임 내부 아이템을 디자인 루트로 Cmd/Ctrl+Shift+드래그하면 아무 일도 안 일어남 (사용자 지적). 원인: 드롭 타겟 판정 `frameIdFromTarget` 이 `closest("[data-frame-id]")` 만 보는데, 디자인 루트는 `[data-design-plane="true"]` 컨테이너라 `data-frame-id` 가 없음 → 빈 플레인 영역 드롭 시 candidate=null → reparent 미발동. (ContextMenu 는 `@root` sentinel + `resolvePickerTargetId` 로 이미 루트 지원.)

- `use-reparent-drag-controller.ts` 에 `resolveDropTarget(x,y)` 추가: 프레임 위면 그 frame id, 아니면 design-plane 위일 때 `getDocument().root.id` 로 fallback. onMove/onUp 모두 사용. 루트 타겟 시 design-plane element 에 drop highlight.
- command 측은 이미 루트 지원 확인 (`findItemInTree` 가 root node 매칭, `absoluteFrameBox` 가 root 특수처리). 변경 불필요.

검증 (`layout-constraints-verify.spec.ts`): 프레임 자식 S 를 빈 플레인으로 Cmd+Shift+드래그 → S.parent=root. **fix 없이는 S 가 소스 프레임에 잔류(baseline 재현 확인)**. weave-only (vendor 변경 0), 7 verify e2e + 212 unit + 4 gate green.

### FIX — 플렉스 자식 FILL (2026-05-28)

"플렉스 프레임에 요소 추가 시 항상 프레임 영역에 꽉 차야 하는데 아이템 크기를 유지한 채 추가됨; 하나면 리사이즈 불가 + 꽉 참" (사용자). agocraft 엔진 측 수정으로 해결 (라이브러리 소유) — weave 코드 변경 0, vendor `1.0.0-rc.20260528064431` 채택만.

검증 (`layout-constraints-verify.spec.ts`): align=start 플렉스 프레임에 layoutChild 없는 shape 추가 → 프레임 전체 채움 `{x:0,y:0,w:1,h:1}` (authored 0.2×0.2 무시), selection chrome 리사이즈/회전 핸들 `[]` (리사이즈 불가). 명시 정책(grow0/basis0.3) 자식은 보존(relayout regression green). vendor 채택 외 weave 변경 없음, 11 verify e2e + 212 unit + 4 gate green.

**후속 — 다중 아이템 (2026-05-28)**: 2개 이상이면 리사이즈 핸들이 보여야 함 (사용자). agocraft count-based 제약 채택 (vendor `1.0.0-rc.20260528065618`) — weave 변경 0. 검증: 플렉스 프레임에 정책 없는 shape 2개 추가 → 각 ≈0.49 균등 분할(gap 0.02), c1 선택 시 핸들 `["resize-e","resize-w"]` 표시(주축 width 만, cross stretch 라 n/s 없음). 단일 아이템은 여전히 `[]`. 9 verify e2e green.

### PIVOT — 순수 CSS flexbox (2026-05-28)

사용자 최종 결정: "무조건 가득 차야 하는 것 잊고 오직 CSS flex 처럼". FILL 모델 폐기 → 표준 CSS flexbox. agocraft 엔진 측 정정 (vendor `1.0.0-rc.20260528071600`) + weave 기본 flex spec align=stretch (CSS `align-items` 기본). 핵심: 자식은 기본 grow 0 (content 크기, justify 배치), align/justify/gap/padding 가 정확히 동작, 속성 tweak 시 자식 사이즈 보존.

검증 (`layout-constraints-verify.spec.ts`): align=stretch flex 에 정책 없는 shape 추가 → `{width:0.2(authored 유지), height:1(stretch)}`, 핸들 `["resize-e","resize-w"]`(grow0 → main 리사이즈 가능, cross stretch). 2개 추가 → 각자 authored width(0.2/0.25) 유지, justify-start 배치(균등 분할 아님). relayout regression(명시 정책 보존) green. 9 verify e2e + 212 unit + 4 gate green.

## Links

- Feature: [features/frame-layout-ux/](../../features/frame-layout-ux/) (예정)
- Parent agocraft: [WI-019](../../../agocraft/records/work-items/WI-019-layout-management.md), [WI-020](../../../agocraft/records/work-items/WI-020-layout-variants-expansion.md)
- Wiring: [WI-042](WI-042-layout-management-wiring.md), [HANDOFF-006](../decision-handoffs/HANDOFF-006-from-agocraft-layout-management-wiring.md)
- agocraft FR/RISK: [FR-009](../../../agocraft/records/feasibility-reviews/FR-009-layout-variants-expansion.md), [RISK-002](../../../agocraft/records/risks/RISK-002-layout-variants-expansion.md)
- OS workflow: `docs/02-company-operating-system/END_TO_END_WORKFLOW.md`
- Memory: `~/.claude/projects/.../memory/project_weave_wi043_frame_layout_ux_2026_05_28.md`
