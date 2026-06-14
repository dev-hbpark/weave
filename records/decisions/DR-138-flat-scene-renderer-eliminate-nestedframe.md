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

## 단계 경계 + S3 결과(2026-06-14, 3커밋, 라이브검증)

**S3 — 셀렉션 크롬 scene 순수화.** 핵심 통찰: S2 이후 렌더 요소는 scene의 순수 투영이므로, 크롬이
요소를 측정하든 scene 구조를 직접 읽든 *기하학적으로 동일*. 실제 동작버그가 있던 두 곳만 행동변화가
있고(나머지는 소싱 변경):

- **위치 버그(수정)**: 핸들·아웃라인이 **회전 프레임에서 AABB 위치**였음(SelectionLayer가 회전요소의
  `getBoundingClientRect`=축정렬 bbox 측정). → S3-1: 기본 변형 핸들/아웃라인/잠금배지를
  `resolveHandleGeometry`(회전인지 design px) + 라이브 `[data-design-plane]` rect 투영으로. 아웃라인=
  회전 rect placement(`hideOutline` + SelectionLayer **`interactive` 플래그** 신설: 박스-스팬 데코 placement가
  하단 아이템 클릭을 가로채는 회귀 차단).
- **hit-test 버그(수정)**: `findFramesAtPoint`가 rotation=0 AABB 콘 가정(자체 비율수학). → S3-2: 엔진
  `computeScene`+`hitTestScene`로 위임(동일 시그니처·호출부 무변경). 회전 프레임 hit/레이어피커 정확.
- **소싱만 변경(행동 동일)**: freeform 핸들(poly-vertex/코너반경/레이아웃에딧)은 이미 회전인지였고(요소에서
  θ·offset 읽어 정확수학) S2 이후 그 DOM이 scene 미러. → S3-3: scene-geom 버스(`chrome-geom.ts`)로
  소싱 전환(+DOM 폴백 유지, 무회귀). 차트는 이미 scene bounds 사용.

**카브아웃(의도, 측정 성격)**: ① 텍스트 자동너비/높이 chrome=라이브 콘텐츠 DOM(엔진 글리프 미측정 —
DR-053 측정 카브아웃과 동류) ② hotspot 영역 드래그 parent rect(별개 기능). 둘 다 scene-순수화 대상 아님.

## 검증

- S2: weave 타입체크 + 단위 1377 green + 라이브 스모크(에디터 마운트·페이지 프레임 정확·예외0).
- S3: tsc/biome 클린 + 단위 1374 green(−3=제거된 `recoverUnrotatedSize` 테스트) + 라이브
  `e2e/selection-chrome-rotation.spec.ts` 4 테스트(networkidle 회피 부트스트랩): 핸들 회전코너(rotated SE가
  AABB SE보다 >20px 이격·드래그 발화), 코너반경 회전그립, 레이아웃에딧 flex 라인, 레이어피커 중첩 — 전부
  green·페이지예외0. poly-vertex는 동일 버스 패턴(transitive) + 커널 단위테스트로 커버.

## Consequences

- NestedFrame.tsx 삭제. 호스트는 (a)사용자 의도 (b)콘텐츠 intrinsic (c)표시정책 오버레이만 제공.
- 회전-인지 hit-test 가능(엔진 `hitTestScene`) — S3에서 `findFramesAtPoint` 대체 완료.
- 셀렉션 크롬 지오메트리 단일소유=엔진 scene. weave 잔여 DOM 측정=의도된 2개 카브아웃 + no-publish 폴백.
