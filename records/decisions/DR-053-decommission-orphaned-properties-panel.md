# DR-053 — Decommission the orphaned PropertiesPanel + interaction-rows

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-091
- **Relates:** WI-090 / DR-052 (link unit — surfaced the orphan), DR-027/WI-071
  (ContextualToolbar — the surface that replaced the panel), CLAUDE.md §
  Decommission Sweep

## Context

While building the link-unit authoring UI (WI-090) we found `pages/PropertiesPanel.tsx`
and the whole `pages/interaction-rows/` directory (button-trigger / camera-target /
entrance-animation / hotspot / hover-effect / reveal-on-step rows + a row/summary
registry) are **orphaned dead code**:

- `PropertiesPanel` is imported by **nothing** (no render site, no lazy import,
  no test). It exports only `PropertiesPanel` + `PropertiesPanelProps`, neither used.
- `interaction-rows/` is imported **only** by `PropertiesPanel`. Its registry
  exports (`getInteractionRow` / `getInteractionSummary` / `registerInteractionRow`
  / `InteractionRowProps` / `CommitBehavior`) have no external consumer.
- No e2e / unit test references it (the two e2e mentions are stale comments only).

The editor's UX moved to the selection-driven `ContextualToolbar` + per-kind
`sections/` (DR-027) and the cross-kind `FlexChildSection` / `GridChildSection` /
`LinkSection` (WI-090). The panel was left behind by that migration without being
removed — exactly the dead-content accumulation the Decommission Sweep prevents.
Its button-trigger row was also incomplete (no URL field, no slide picker — the
gap WI-090 fixed in the toolbar instead).

## Decision

**Decommission** `pages/PropertiesPanel.tsx` and `pages/interaction-rows/` (8 files).

- No live capability is lost: manual authoring for those behavior kinds was
  unreachable (never mounted); the behaviors remain authorable by the aku agent
  (`features/aku/agent/weave-capabilities.ts`) and at runtime via the interaction
  registry (WI-090 Phase 1).
- The forward direction for **manual** authoring of the remaining behavior kinds
  (hotspot / hover-effect / entrance-animation / camera-target / reveal-on-step)
  is the established pattern — a cross-kind ContextualToolbar section, the way
  `LinkSection` was added — **not** reviving this panel. Re-introduce per kind
  when there is product demand; the git history holds the old rows as a reference.

## Consequences

- (+) ~894 LOC of dead code removed; one fewer never-rendered surface to mislead
  future contributors (and the agent) into thinking manual behavior authoring exists.
- (+) The interaction-behavior authoring story is now single-surfaced
  (ContextualToolbar sections) and consistent with every other editor control.
- (−) Manual authoring for hotspot / hover / animation / camera / reveal is not
  available in the UI (it already wasn't). Tracked as potential future toolbar
  sections; agent authoring covers them meanwhile.

## 비채택 대안

- **패널 유지(현상)**: 죽은 코드 누적 + "저작 UI가 있다"는 오해 → 기각(Decommission Sweep).
- **패널을 마운트해 부활**: 현 UX(ContextualToolbar)와 이중 저작 surface·일관성 붕괴 → 기각.
- **남은 행들을 즉시 toolbar 섹션으로 포팅**: 제품 수요 미확인 상태의 선투자 → 비범위(수요 시 개별 추가).
