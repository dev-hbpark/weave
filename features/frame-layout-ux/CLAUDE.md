# CLAUDE.md — Feature: frame-layout-ux

## Purpose

Local context for `frame-layout-ux` — agocraft `@agocraft/layout` v1 (absolute-constraints) 와 v1.1 (auto-flex + auto-grid) 의 weave 측 사용자 noticeable UX. Option+drag popup 의 layout-type toggle + ContextualToolbar 의 layout SegmentedControl + PropertiesPanel 의 paradigm-specific fields.

## Read order

1. `CLAUDE.md`
2. `RULE.md`
3. `WORK_ITEM.md` (redirect)
4. `README.md` (UX problem + 결정)
5. `ENGINEERING_PLAN.md` (agocraft 1.1.0-rc 채택 후 박제)

## Phase

**Discovery 박제** (2026-05-28). agocraft WI-020 의 B6 완료 후 Build 진입.

## Related agocraft work

- WI-019 (v1 absolute-constraints) — 본 feature 의 base. WI-042 가 weave 측 trunk 머지 (flag default false)
- WI-020 (v1.1 auto-flex + auto-grid) — 본 feature 의 v1.1 UX 의 platform 의무
- HANDOFF-006 (v1 active), HANDOFF-017 (v1.1, 예정 inbound)

## Escalate if

- agocraft WI-020 의 B1-B5 가 fail 또는 H4 미달 (bundle PoC) — weave UX 의무 일시 정지
- usability session (5 user × 5 task) 의 friction score 가 baseline 보다 높음 — UX 결정 A3 (toggle) 재검토
- design-system-triage 가 신규 컴포넌트 (3 layout icon + TrackSizeEditor) 의무를 Step 3 Grew 의 cost 미만으로 제한 권고
- RISK-002 의 14 control 중 a11y (C4.1-C4.5) 가 axe smoke 에서 fail
