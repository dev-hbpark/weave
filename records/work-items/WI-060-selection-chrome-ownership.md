# WI-060 — Selection chrome ownership refactor

## Problem

선택 핸들(selection chrome) 결정 로직이 `FrameStage.resolveHandles`(렌더 컨테이너)에 중앙집중되어, 텍스트 모드(`switch(mode)`)·도형 sub-kind(`if` 체인)·레이아웃 제약을 한 클로저가 전부 안다. WI 마다 분기가 누적되는 OCP 붕괴 진행형 + CLAUDE.md Rule 6(kind/mode 위 switch 금지) 위반. 사용자 지적: "핸들 관리가 너무 중앙집중형, 각 아이템이 자기 컨텍스트를 관리해야".

## Decision (user directives)

- 2026-05-31: 구조 리팩토링 **검토 → 기록 먼저(옵션 1)** 후 단계 구현.
- 방향: kind/sub-kind 가 자기 selection view-model 을 소유(등록), 레이아웃 등 cross-cutting 제약은 단일 사후 필터로 분리. agocraft 계약 불변. 행위 보존.
- 박제: **DR-023** (kind-owned VM + cross-cutting constraint filter; SOLID/GRASP 체크리스트 embed).

## Plan

`features/selection-chrome/ENGINEERING_PLAN.md` — 5 phase (행위 보존 refactor, 단계별 e2e 가드):
1. default VM 등록화 (FrameStage inline 생성 제거)
2. shape VM 신설 (선 계열 + poly vertex 통합)
3. text VM 신설 (모드 게이팅 → adapter map)
4. 레이아웃 제약 필터 추출
5. 정리 + 게이트(분기 0 확인)

## Status

- **Implemented** (2026-05-31) — DR-023 Accepted, 5단계 리팩토링 완료(행위 보존).
  - 신규: `selection-chrome/{text,shape}-selection-view-model.tsx`, `layout-constraint-filter.ts`; `frame-default-view-model.tsx` 에 공유 `transformHandleSpecs` 추출.
  - `FrameStage.resolveHandles` 를 `resolve → layout filter → position` 로 축소 — kind/mode/sub-kind 분기 0개(게이트 통과). default/text/shape VM 은 DesignPage 에서 레지스트리 등록.
  - **검증**: `tsc` green. 핸들/텍스트모드/도형/add-menu 36 + figma-quickaction 14 + layout/rotation 18 e2e green. 회귀 0 — 큰 묶음 실행의 6 실패는 모두 pristine 에서도 실패(기존)하거나 flaky 로 확인.

## Workflow trail

- Decision: `records/decisions/DR-023-selection-chrome-ownership.md`
- Plan: `features/selection-chrome/ENGINEERING_PLAN.md`
- Related: DR-018 (registry 도입), DR-016 / DR-022 (텍스트 resize 게이팅 — phase 3 에서 text VM 으로 이전), CODE_STRUCTURE_DESIGN_RULES Rule 6
- 현행 코드: `apps/web/src/pages/FrameStage.tsx:877-995`
