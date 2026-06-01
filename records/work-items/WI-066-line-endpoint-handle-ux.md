# WI-066 — Open-line endpoint handle UX (square shape + modifier free-move)

## Problem

사용자: 자유선/열린 poly의 **양 끝점 핸들**을 ① 일반 꼭지점(원형)과 구분되게 **사각형**으로 표시하고, ② **특정 모디파이어 키**를 누른 채 드래그하면 끝점도 다른 꼭지점처럼 **자유롭게 위치 이동**되게 하고 싶다.

현재(WI-061/WI-057): 끝점 드래그는 반대쪽 끝점을 기준으로 한 **닮음 변환(scale+rotate)** 으로 "모양 유지하며 늘이기"만 가능했고, 모든 핸들이 동일한 원형이었다.

## Decision

`apps/web/src/document/selection-chrome/poly-vertex-handle.tsx` (weave-only; 코어/agocraft 변경 없음):

- **사각형 끝점 + 모드 반영 핸들**: 열린 poly/line의 첫·마지막 점(`!closed && (idx===0 || idx===n-1)`)은 사각형(`borderRadius: 2`), 내부 꼭지점은 원형(`"50%"`). 핸들을 작은 컴포넌트 `VertexHandle`로 추출 — 끝점이면 window `keydown`/`keyup`/`blur` 를 구독해 **Alt 누름/뗌에 따라 모양을 실시간 토글**(stretch=사각형 ↔ free=원형, `data-handle-mode` 노출). render 클로저는 컴포넌트가 아니라 hooks 를 못 쓰므로, 자체 state 를 가진 컴포넌트가 부모 재렌더 없이도 키 이벤트에 스스로 재렌더. `data-handle-role`, aria-label("끝점"/"정점"), title 도 부여.
- **모디파이어 자유 이동**: 드래그 중 **Alt/Option** 키를 누르면(`ev.altKey`, move 이벤트마다 라이브 판정 → 드래그 중 토글 가능) 끝점의 닮음 변환을 끄고 내부 꼭지점과 동일하게 그 점만 자유 이동. 핸들 모양 토글과 동일 모디파이어라 시각 피드백이 실제 동작과 일치. shape(poly)·line VM 공통 적용(닫힌 poly는 끝점 없음 → 무영향).

모디파이어 선택: **Alt(Option)** — "대체 드래그 동작"의 관용 키이며 vertex 드래그 맥락에서 충돌 없음.

- **Rule 6 — 핸들 역할 레지스트리(다형성)**: 초기 구현은 `isEndpoint ? … : …` 인라인 분기(드래그 전략 + 비주얼 2곳)였음 → 사용자 지적으로 **역할별 어댑터 + 레지스트리**로 리팩터(`vertex-handle-roles.ts`, 순수 모듈). 두 개의 컴파일-강제 매핑 레코드(`SHAPE_KIND_ADAPTERS` 패턴):
  - **DRAG_STRATEGIES** (`free-move` / `endpoint-stretch`) — 전략 1개당 구현 1개. endpoint-stretch 의 퇴화 케이스는 free-move 로 **위임**(분기 아님).
  - **POINT_HANDLE_ADAPTERS** (`vertex` / `endpoint`) — 역할당 어댑터 1개. 어댑터가 default strategy + (선택적) modifier-override strategy + `visual(modifierActive)` + label/title 보유.
  - `classifyPointHandle(idx,count,closed)` 로 호출부는 intent(role)만 선언, `resolvePointHandle(role)` 가 어댑터 해소, `resolveDragStrategy(adapter, alt)` 가 **단일 모드 게이트**로 (role,modifier)→strategy 결정. `poly-vertex-handle.tsx` 의 `beginVertexDrag`/`VertexHandle` 에 인라인 endpoint 분기 0건.
  - 단위 테스트 `vertex-handle-roles.test.ts`(6): classify / 전략 게이트 / 비주얼 다형성 / free-move 단일점 이동·endpoint-stretch anchor 고정.
  - (midpoint 핸들은 별도 생성기 — 판별자 인라인 분기가 아니라 독립 spec 이므로 Rule 6 대상 아님. 향후 필요 시 동일 레지스트리로 흡수 가능.)

## Verification

- 타입체크 clean.
- e2e (Continuous Self-Verification): `e2e/line-endpoint-handle.spec.ts` — 끝점이 `data-handle-role="endpoint"` + `border-radius:2px`(내부는 vertex), **Alt+드래그 시 중간 꼭지점 화면 위치 유지(자유 이동)** vs **일반 드래그 시 중간 꼭지점 이동(닮음 변환)**. 1/1 green.
- 회귀: `shape-poly-vertex-edit.spec.ts`(5/5) + `shape-line-convert.spec.ts` green.
  - 부수 수정: `WI-057 — dragging a vertex handle moves…`(닫힌 삼각형 정점-0 드래그)가 본 작업과 무관하게 실패 중이었음(stash 후에도 동일 → 사전 존재). **원인**: 정점-0은 위쪽 apex(y=0)인데 아래로 드래그해도 여전히 최상단 → **DR-024 frame-follows-vertices refit 이 그 vertex 의 정규화 y 를 다시 0 으로** 되돌려 `moved.y > 0` 단정이 성립 불가. WI-057 테스트(refit 도입 前, raw 좌표 검사)가 이후 DR-024 refit 으로 조용히 무효화된 **stale 단정**(코드 버그 아님). **수정**: 사용자가 실제 보는 동작 = 핸들의 **화면 위치가 우+하로 이동**했는지로 단정 변경(refit-invariant) + 기존 undo 좌표 복원 검사 유지. 이제 green.

## Links

- 선행: WI-061(line endpoint editing) · WI-057(poly vertex handles) · WI-065(shape↔line conversion UI).
