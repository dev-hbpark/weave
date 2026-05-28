# WI-043 — Frame layout UX (option+drag layout-type picker + ContextualToolbar layout-change)

## Metadata

| Field | Value |
|---|---|
| ID | WI-043 |
| Title | Frame 생성 시점에 layout 패러다임 선택 (Absolute / Flex / Grid) + 이미 만든 frame 의 layout 변경 — weave 측 user-visible UX |
| Owner | hbpark |
| Status | **Discovery 박제** (2026-05-28). agocraft WI-019 (v1 absolute-constraints) + WI-020 (v1.1 auto-flex + auto-grid) 의 weave 측 consumer surface. Build 는 agocraft 1.1.0-rc publish 후. |
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
| **B1** vendor adoption | weave | 1.1.0-rc repack + textAutoResize 정리 confirm | agocraft B6 후 |
| **B2** Option+drag popup layout-type toggle | weave | design-root.insertable.ts 수정 + 신규 toggle component | B1 후 |
| **B3** ContextualToolbar layout SegmentedControl | weave | frame-background-section.tsx 확장 + 3 layout icon + weave.frame.setLayout command | B2 후 |
| **B4** PropertiesPanel flex/grid fields | weave | 신규 또는 기존 패널 확장 + TrackSizeEditor | B3 후 |
| **B5** feature flag + ramp + e2e | weave | WI020_LAYOUT_VARIANTS_ENABLED flag + 5 e2e + axe smoke + size-diff | B4 후 |
| **B6** LG (post-staging) | weave | LG-003 또는 WI-019 LG follow-up | B5 후 |

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

## Links

- Feature: [features/frame-layout-ux/](../../features/frame-layout-ux/) (예정)
- Parent agocraft: [WI-019](../../../agocraft/records/work-items/WI-019-layout-management.md), [WI-020](../../../agocraft/records/work-items/WI-020-layout-variants-expansion.md)
- Wiring: [WI-042](WI-042-layout-management-wiring.md), [HANDOFF-006](../decision-handoffs/HANDOFF-006-from-agocraft-layout-management-wiring.md)
- agocraft FR/RISK: [FR-009](../../../agocraft/records/feasibility-reviews/FR-009-layout-variants-expansion.md), [RISK-002](../../../agocraft/records/risks/RISK-002-layout-variants-expansion.md)
- OS workflow: `docs/02-company-operating-system/END_TO_END_WORKFLOW.md`
- Memory: `~/.claude/projects/.../memory/project_weave_wi043_frame_layout_ux_2026_05_28.md`
