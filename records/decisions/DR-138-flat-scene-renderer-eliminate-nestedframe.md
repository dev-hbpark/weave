# DR-138 — 평면 scene 렌더러로 NestedFrame 제거; 위치/핸들 지오메트리는 엔진 scene이 소유

- **Status:** ACCEPTED · 2026-06-14
- **Pairs with:** agocraft DR-054 / WI-041(엔진이 retained-mode LayoutScene 소유).
- **Relates:** WI-216/DR-053(엔진이 레이아웃 사이징 소유 — 이 결정의 선행), WI-198(memo 퍼포먼스),
  WI-163(페이지=아트보드), WI-039(포커스 딤/아이솔레이트).
- **Driver(운영자):** "NestedFrame 개념 자체를 없애라. 프레임은 프레임일 뿐. 셀렉션·핸들도 엔진의
  아이템모델 기반 바닐라로, 에디터 뷰모델은 단순히 그리기만."

## Context

`NestedFrame.tsx`(~950줄)가 (a) 프레임 비율→절대 px를 React에서 **재귀** 계산하고 (b) 그 결과를
DOM(`getBoundingClientRect`/`offsetWidth`)으로 되읽어 셀렉션 핸들 지오메트리를 만들었다. 이 DOM
측정 의존이 "호스트는 그리기만" 을 막는 병목이었다(정밀검사 결론). agocraft DR-054로 엔진이
`computeScene`(트리 전체 절대 지오메트리)을 소유하게 되어, 호스트가 위치 계산도 DOM 측정도 할
필요가 없어졌다.

## Decision

**1. 재귀 `NestedFrame` 제거 → 평면 렌더러.**
- `FrameScene`: `computeScene({...root, children: 가시 top frames}, designW, designH)` 후 `scene.entries`를
  평면 맵. DFS pre-order = 페인트 순서(자식이 부모 위에 칠해짐 — 전 계층 `overflow:visible`라 평면
  절대배치가 중첩 시각과 일치).
- `SceneFrame`: **단일** 아이템을 엔진 계산 절대 지오메트리(`cx/cy/w/h/rotation` 프리미티브)로 렌더.
  비재귀. 강체라 `left=cx-w/2, top=cy-h/2` + `rotate(rotation)`(center-origin) 한 번으로 조상 회전
  체인까지 정확히 재현(rotation=절대각, computeScene이 합성). per-frame 책임(이벤트/선택칩/핫스팟/
  flip/컬링/hit-gate/포커스) 전부 보존.

**2. WI-198 퍼포먼스 보존.** 지오메트리를 **프리미티브 props**로 전달 → `SceneFrame`이 memo로 비교하므로
매 틱 새 scene 객체가 와도 변하지 않은 프레임은 재렌더 bail. computeScene은 O(N) 순수math(저렴).

**3. flip 단순화.** frame은 FLIP_ALLOWED_KINDS 제외이고 평면 렌더에선 자식이 별도 엔트리라, flip은
leaf 콘텐츠만 감싼다(과거 children-flip 분기는 죽은 코드 → 제거).

## 단계 경계

- **이번(S2)**: 위치는 scene이 소유. 셀렉션 핸들 지오메트리는 **아직 SelectionLayer가 selfRef DOM 측정**
  (resolveAnchor) — S3에서 `resolveHandleGeometry(scene)`로 전환.
- 텍스트 auto-resize `composeTextBounds`도 S3에서 scene로.

## 검증

- weave 타입체크 클린 + 단위 1377/1377 green.
- 라이브(playwright 헤드리스): 슬라이드 에디터 마운트, 페이지 프레임 `left:0;top:0;1920×1080` 정확 배치,
  JS 예외 0(유일 에러=무관 404 KV/asset). data-frame-* 속성·이벤트 의미 보존(e2e 셀렉터 무영향).
- 잔여 라이브 검증(블록 선택칩 위치·회전·드래그)은 S3/S5에서.

## Consequences

- NestedFrame.tsx 삭제. 호스트는 (a)사용자 의도 (b)콘텐츠 intrinsic (c)표시정책 오버레이만 제공.
- 회전-인지 hit-test 가능(엔진 `hitTestScene`) — S3에서 `findFramesAtPoint` 대체.
