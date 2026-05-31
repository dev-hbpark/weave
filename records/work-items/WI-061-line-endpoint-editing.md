# WI-061 — Line endpoint editing (frame follows vertices)

## Problem

선(직선/자유선/곡선/자유곡선)을 정점 핸들로 편집할 때, 정점은 고정 박스 안에서만 움직이고 러버밴드(프레임)는 그대로였다. 사용자: 모든 poly 핸들이 프레임 크기·위치를 정점에 맞게 바꿔야 하고, 양끝점은 추가로 선 전체를 비율 유지한 채 균등 스케일해야 한다.

## Decision (user directives)

- 2026-05-31: 모든 poly vertex 드래그 → 프레임 refit(러버밴드 follow). 양끝점 → 반대쪽 끝점 기준 **전체 균등 스케일(비율 유지, similarity)**. (AskUserQuestion 확정)
- 직선도 2-point 열린 poly 로 통일(끝점 편집 가능).
- 박제: **DR-024**.

## Outcome — Implemented (2026-05-31)

- `poly-vertex-handle.tsx`: `refitFrameToPoints`(점 AABB→frame, 점 재정규화, θ≠0 fallback, 퇴화축 hairline) + 끝점 화면-공간 복소수 similarity. dispatch 를 `weave.item.update`(frame+points 단일 패치) 로.
- `getPoly` 가 frame 반환(DesignPage). 직선 seed = `STRAIGHT_LINE_SUBATTRS`(2-point open) — 두 add 메뉴 + add-menu 테스트 갱신.
- **검증**: `tsc` green. 신규 `line-endpoint-drag.spec.ts` pass. add-menu/line-selection-handles/shape-poly/shape-smooth-toggle 13 pass. 스크린샷 확인.

## Workflow trail

- Decision: `records/decisions/DR-024-poly-frame-follows-vertices.md`
- Builds on: DR-023 (kind-owned selection chrome), WI-057 (poly), WI-060
- Code: `apps/web/src/document/selection-chrome/poly-vertex-handle.tsx`, `apps/web/src/pages/DesignPage.tsx`
- Test: `apps/web/e2e/line-endpoint-drag.spec.ts`
