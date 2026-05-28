# Feature: frame-layout-ux

Start with [`CLAUDE.md`](./CLAUDE.md) and [`WORK_ITEM.md`](./WORK_ITEM.md).

## Problem statement (user lens)

**weave 사용자가 frame 을 만들 때 "이 frame 안의 자식들이 자동 정렬되는 방식" 을 선택하고, 만든 후에도 그 paradigm 을 바꿀 수 있기를 원한다.**

현재 surface:
1. **Option+drag popup** (RecommendationPopover, `apps/web/src/document/insertable/design-root.insertable.ts`) — bucket(wide/tall/square) × kind(frame/image/text/shape) 8 종 추천. layout 개념 부재 — 사용자가 frame 을 만들면 항상 자식 absolute 배치.
2. **ContextualToolbar frame section** (`apps/web/src/document/toolbar/sections/frame-background-section.tsx`) — Background color 1 control. layout 변경 UI 부재.
3. **PropertiesPanel** — layout paradigm-specific fields 부재.

이 격차로 사용자가 (a) Figma 식 Auto Layout 표현 불가, (b) PPT 식 grid layout 표현 불가, (c) 이미 만든 frame 의 정렬 paradigm 사후 변경 불가. 모든 자식을 수동 배치.

## Target user

### Primary — weave end-user (디자이너 / presenter / 콘텐츠 제작자)

**Job-to-be-done**:
> frame 을 그릴 때 "이 안은 가로 정렬" / "이 안은 3-column grid" 라고 한 번에 선언하고, 자식을 추가하면 자동 정렬되기를. 만든 후에도 paradigm 변경 가능하기를.

### Secondary — host developer (외부 weave SDK consumer, post-launch)

**Job-to-be-done**:
> agocraft 의 platform-tier layout 을 SDK 로 사용. weave 의 UX pattern 을 참조해 자체 host UI 빠르게 구현.

## UX 결정 (Discovery 결론)

### Option+drag popup 의 layout-type 옵션 — **A3: toggle 채택**

3 후보:
- **A1**. 1차 layer = bucket × kind (현재), 2차 layer = layout type submenu. **불채택** — popover-within-popover 의 a11y 비대.
- **A2**. 1차 layer 에 layout-typed frame 추천 (8 → 15+). **불채택** — 추천 list 폭발, popover height 비대.
- **A3**. frame 추천 옆에 작은 "Layout: [Absolute] [Flex] [Grid]" toggle. **채택** — 선택 cost 최소, list 폭증 없음, mode 처럼 작동.

### ContextualToolbar layout 변경 — **SegmentedControl**

Frame section 에 Background ColorPicker 옆에 SegmentedControl (3 option) 추가. 변경 시 cubic-bezier symmetric motion (RISK-002 C2.3).

### PropertiesPanel — **paradigm-specific fields**

Layout type === "auto-flex": direction / gap / justify / align / padding (5 control).
Layout type === "auto-grid": columns / rows (TrackSizeEditor) / span (per child, in ItemSection) / gap (column + row) / padding (8 control).
Layout type === "absolute-constraints": anchor 2-axis picker (WI-042 의 existing surface).

## Alternatives benchmarked

| 대안 | 비용 / Cost | 한계 |
|---|---|---|
| **Do nothing** | 0 | Figma / PPT 격차 유지. 사용자가 frame 마다 자식 수동 배치 |
| **A1 (submenu)** | 중 | popover-within-popover, a11y 어려움, mobile 터치 hit area 비대 |
| **A2 (15+ 추천)** | 중 | list 폭증, scroll, scan cost ↑ |
| **A3 (toggle)** ← 채택 | 작 | mode 의미 표시 명확, list 폭증 없음, mobile compact |
| **Sidebar panel only (popup 변경 없음)** | 작 | popup 의 paradigm 선택 부재 → frame 생성 후 panel 가서 변경하는 2-step 의무 — H1 cost ↑ |
| **Inline toolbar (frame 위 떠다님)** | 중 | viewport 점유 + 다른 selection-driven 표면과 충돌 |

## MVP scope

### In scope (v1.1)

- Option+drag popup 의 A3 toggle (Absolute / Flex / Grid)
- ContextualToolbar frame section 의 layout SegmentedControl
- PropertiesPanel paradigm-specific fields (flex 5 control + grid 8 control)
- 신규 commands: `weave.frame.setLayout`, `weave.item.setLayoutChild` (이미 WI-042 가 partial), `weave.item.add` 의 optional `layout` input
- design-system 신규: 3 layout icon + TrackSizeEditor
- feature flag `WI020_LAYOUT_VARIANTS_ENABLED` (v1 flag 와 독립)
- agocraft 1.1.0-rc 채택
- 5 e2e + axe smoke + size-diff CI gate
- DR-design 박제 (3 icon + TrackSizeEditor Triage + SegmentedControl integration)
- usability session 5 user × 5 task

### Out of scope (v1.1)

- Layout transition motion 의 advanced spring physics (cubic-bezier 정합만)
- TrackSizeEditor 의 drag-handle resize (input 만)
- Mixed-paradigm selection 의 자세한 UX (기본 Mixed 표시만)
- agocraft v2 (wrap / baseline / grid-template-areas) UI
- 외부 host SDK adoption 가이드

## Success metric

| Metric | Baseline | v1.1 target | 측정 방법 |
|---|---|---|---|
| frame creation 후 자식 추가까지 task time | 박제 필요 | -30% | 5 user × 5 task usability session (E5 in WI-020) |
| Flex paradigm 의 사용자 의도 일치율 | n/a | ≥ 90% | 5 user 의 "이 결과가 예상과 같았나?" 답변 |
| Grid paradigm 의 사용자 의도 일치율 | n/a | ≥ 85% | 동일 |
| WI019_LAYOUT_ENABLED + WI020_LAYOUT_VARIANTS_ENABLED size-diff | 0 KB gz (현재 dark) | ≤ +12 KB gz (agocraft 1.55 + 3 + 4 = 8.55 KB + weave UI 3.5 KB est) | size-diff CI gate |
| axe-core a11y smoke 위반 | n/a | 0 | weave e2e |

## Escalation triggers

| Trigger | 적용 | 조치 |
|---|---|---|
| data | 없음 | — |
| payment | 없음 | — |
| AI | 없음 | — |
| **public** | weave 의 user-visible UX 변경 | LG-003 의무 |
| legal | 없음 | — |

## Next steps

WI-043 § Phases 참조 — P0 (Discovery, 이 turn) 완료, B1-B6 는 agocraft 1.1.0-rc publish 후.

## Links

- 프로젝트 레벨: [WI-043](../../records/work-items/WI-043-frame-layout-ux.md)
- agocraft parent: [WI-019](../../../agocraft/records/work-items/WI-019-layout-management.md), [WI-020](../../../agocraft/records/work-items/WI-020-layout-variants-expansion.md)
- wiring: [WI-042](../../records/work-items/WI-042-layout-management-wiring.md), [HANDOFF-006](../../records/decision-handoffs/HANDOFF-006-from-agocraft-layout-management-wiring.md)
- agocraft FR/RISK 상속: [FR-009](../../../agocraft/records/feasibility-reviews/FR-009-layout-variants-expansion.md), [RISK-002](../../../agocraft/records/risks/RISK-002-layout-variants-expansion.md)
- OS workflow: `docs/02-company-operating-system/END_TO_END_WORKFLOW.md`
