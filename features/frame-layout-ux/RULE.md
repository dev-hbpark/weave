# RULE.md — Feature: frame-layout-ux

## Architectural rules

1. **All mutations go through History** — `weave.frame.setLayout` / `weave.item.setLayoutChild` / `weave.item.add` 의 layout 추가 모두 `editor.exec` 를 거쳐 `item.layout` / `item.layoutChild` Patch 발행. setAgoDoc 직접 호출 금지 (CLAUDE.md 의 Document mutation rule).
2. **No emoji in UI** — 모든 layout type label / icon 은 design-system 의 IconLayoutAbsolute / IconLayoutFlex / IconLayoutGrid 사용. 이모지 절대 금지 (workspace feedback).
3. **Design System Triage 의무** — 3 신규 layout icon + TrackSizeEditor 둘 다 Triage 의 Step 3 (Grew) 또는 Step 4 (composite reuse). DR-design 박제 의무.
4. **cubic-bezier symmetric motion** — layout type 변경 시 자식 transition 의 cubic-bezier 는 symmetric (P1.X = 1−P2.X) — crossfade / mid-flow 의 perceived speed feedback (workspace feedback `feedback_cubic_bezier_p2_x_loading.md`).
5. **No switch on layout kind** — layout type 별 UI dispatch 는 registry (Rule 6 OS-root). 신규 paradigm 추가 시 inline `if (kind === "auto-flex")` 금지.
6. **Feature flag isolation** — v1 (WI019_LAYOUT_ENABLED) 와 v1.1 (WI020_LAYOUT_VARIANTS_ENABLED) 의 flag 가 독립. rollback 시 v1.1 만 끌 수 있어야 함 (v1 그대로 유지).
7. **Mixed selection ARIA** — paradigm 이 서로 다른 frame 선택 시 SegmentedControl 이 MixedBadge 표시 + aria-pressed="mixed" (또는 aria-checked 없음 + describedby="Mixed").
8. **Layout type 변경 시 child policy fallback** — parent layout kind 가 변경되면 자식의 layoutChild kind 가 mismatch 됨. adapter 가 absolute-constraints 으로 lossless fallback (FR-009 T6 결정) — UI 가 별도 처리 의무 0.

## Discovery 단계의 작업 범위

- Discovery 단계는 **코드 작성 금지**. WI / feature docs / 메모리만.
- Build 진입은 agocraft 1.1.0-rc 채택 + 사용자 sign-off 후.

## Cross-project boundary

- 본 feature 는 weave 내 user-visible UX. agocraft 측 변경 의무가 발견되면 `records/decision-handoffs/HANDOFF-NNN-from-weave-...md` 발행.
- agocraft 의 platform layer 변경은 본 feature 폴더 안에 박제 금지.
