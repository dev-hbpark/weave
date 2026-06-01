# WI-068 — Mixed straight+curve UX (per-vertex corner/smooth)

## Problem

사용자: 한 선이 직선+곡선을 **동시에** 가질 수 있어야. UX 방향(AskUserQuestion):
**A. 꼭지점 타입 토글** — 점별 corner↔smooth. 전환 제스처: **더블클릭 + 꼭지점 우클릭 메뉴**.

코어 모델/지오메트리는 agocraft **DR-033 / WI-031**. 본 WI 는 host UX.

## Decision

- **핸들 모양 = 점 타입** (`vertex-handle-roles`): smooth → 원(50%), corner → 사각(2). `pointTypeOf(point.smooth, globalSmooth)` + `handleBorderRadius`. role 레지스트리는 드래그 전략만 담당(WI-066). `data-point-type` 노출.
  - **WI-066 supersede(부분)**: 끝점의 Alt-shape 토글(모양이 모디파이어로 바뀜)을 제거 — 모양은 이제 지속적 점 타입을 표시. Alt 는 끝점 **드래그 동작**(free-move)만 유지(`resolveDragStrategy`).
- **더블클릭 = corner↔smooth 전환** (`togglePointType` → 점의 `smooth` flip → `weave.item.update`로 points 기록; line/poly 공통 `composeAttrs`).
  - **곡선 전환 시 프레임(러버밴드) refit** (후속, WI-069 의 곡선-aware refit 재사용): 점을 smooth 로 바꾸면 닫힌 Catmull-Rom 이 꼭지점 hull 밖으로 부풀어 러버밴드를 벗어나던 문제 — 토글도 `smoothPolyBounds`(@agocraft/core)로 **곡선 bbox** 를 구해 `refitFrameToPoints(next, frame, θ, bounds)` 로 프레임을 곡선에 다시 맞춤(corner 만 남으면 bounds 생략 → 점 bbox). 삭제(WI-069)·드래그·토글이 모두 같은 곡선-aware refit 을 공유.
  - **드래그가 다른 점의 `smooth` 를 보존**: `applyDragStrategy`(free-move/endpoint-stretch)와 `refitFrameToPoints` 가 x/y 만 바꾸고 나머지 PolyVertex 필드(`smooth`)는 `{...p}` 로 통과 — 한 점을 끌어도 혼합 곡선이 유지(DR-033 회귀 방지).
- **꼭지점 우클릭 = 컨텍스트 메뉴**(`@weave/design-system` ContextMenu): 곡선/각진 전환 · 선으로 끊기(도형 poly, DR-031) · 꼭지점 삭제(≥min). 기존 더블클릭-삭제·우클릭-직접끊기를 메뉴로 통합. `VertexHandle`을 `forwardRef`+`...rest` 로 만들어 `ContextMenuTrigger asChild`가 ref/onContextMenu 를 버튼에 주입.
- `getPoly`가 점별 `smooth` + 전역 `smooth` 를 전달(PolyVertex.smooth, PolyShapeState.smooth).

## Verification

- 단위 `vertex-handle-roles.test.ts`(pointTypeOf/handleBorderRadius/strategy), `handle-gesture-runner.test.ts`. weave **334 unit** green.
- e2e: `mixed-curve-point-type.spec.ts`(더블클릭 토글 → data-point-type + border-radius + 점 smooth + `<polygon>`→`<path>` + Cmd+Z; **토글 곡선 refit** — 세 꼭지점 모두 smooth 시 곡선이 삼각형 밖으로 부풀어 프레임 w/h 가 변함; **드래그가 다른 점 smooth 보존**; 우클릭 메뉴 토글). `shape-poly-vertex-edit`(삭제를 메뉴로 이전 + 회귀). `line-endpoint-handle`(Alt-shape 토글 제거, 동작 유지). `shape-line-convert`(끊기를 메뉴로). 전부 green.
- 코어 재벤더 + install(+ `@small-think/client` override 재적용 — repack 이 비-agocraft override 를 덮어쓰므로 매 repack 후 재추가).

## Links

- agocraft DR-033 / WI-031. 선행: WI-066(handle role), WI-067(handle FSM), DR-031(끊기).
