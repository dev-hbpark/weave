# WI-069 — Vertex selection + Delete-key removal (visual highlight)

## Problem

꼭지점 삭제는 우클릭 메뉴(WI-068)에만 있어 느림. 사용자: **꼭지점을 선택(시각 표시)하고 Delete 키로 삭제**. weave-only(코어 변경 없음).

## Decision

- **선택 상태 스토어** `selection-chrome/vertex-selection.ts`: 한 에디터당 선택 꼭지점 `{itemId,index}` 를 구독 가능한 작은 스토어로 보관(React state 아님) — 포털된 SelectionLayer 의 핸들이 **부모 재렌더 없이도** `useSyncExternalStore` 로 즉시 하이라이트되고, DesignPage keydown 도 같은 소스를 읽는다.
- **선택 + 하이라이트** (`poly-vertex-handle`): 1차 버튼 pointerdown → `vertexSelection.set`. 선택된 핸들은 `useVertexSelected` 로 **accent 채움 + 흰 링 + 약간 확대**(`data-selected="true"`) — 활성 점(삭제 대상)이 한눈에. (드래그/더블클릭/우클릭 메뉴와 공존.)
- **Delete/Backspace** (DesignPage keydown): 선택 꼭지점이 있으면 **그 점만 삭제**(item 삭제보다 우선) — min 가드(closed≥3 / open≥2), `weave.item.update`(poly subAttrs.points / line points) 1 패치 = 1 undo, 선택 해제. 없으면 기존 item 삭제로 폴백.
- **선택 해제**: 편집 item 이 선택 해제되면(effect) / **Escape(레이어드: 꼭지점 먼저 해제, item 은 유지; 꼭지점 없으면 item 해제)**.

## Verification

- e2e `vertex-delete.spec.ts`: 클릭→선택(data-selected) → Delete 삭제(4→3) → Cmd+Z 복원(→4); min(3)에서 Delete no-op; Escape 가 꼭지점만 해제(핸들/아이템 유지). 회귀: shape-poly-vertex-edit·mixed-curve·line-endpoint 등 10 e2e + 334 unit green. tsc·lint clean.
- 발견/대응: 초기 테스트가 midpoint-insert→Delete 를 같은 item 의 연속 `weave.item.update` 로 해 mergeKey 로 1 undo 병합 → quad 직접 생성으로 분리. Escape 가 item 까지 해제하던 것을 레이어드(꼭지점 우선)로 정정.

## Links

- 선행: WI-057(vertex handles), WI-066(role 레지스트리), WI-068(우클릭 메뉴 삭제). 코어 변경 없음(DR 불요).
