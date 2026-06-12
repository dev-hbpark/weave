# WI-201 — 레일 타일 data-frame-id 중복: 스냅 후보 오염 + 테스트 경화

- 상태: DONE (2026-06-12)
- 출처: WI-200 잔여 후속 ②. 사용자 "레일 타일 data-frame-id 중복 후속도
  진행부탁해".
- 관련: WI-200/DR-129 (발견 경위), WI-039 (타일 data-frame-id 부여 근거),
  WI-073 (frame-move-snap)

## 문제

mixed flavor에서 하단 레일(ThumbnailPanel) 타일이 캔버스 frame과 같은
`data-frame-id`를 노출 (frame 2개 = `[data-frame-id]` 엘리먼트 4개):

1. **스냅 후보 오염** — `createFrameMoveSnap.begin`이
   `document.querySelectorAll("[data-frame-id]")` 전역 쿼리로 후보를
   수집 → 레일 타일 rect(WI-200 진단에서 `{x:120,y:588,w:160}` 확인)가
   가짜 정렬 타깃이 됨. body-포털 셀렉션 핸들(`[data-handle-kind]
   [data-frame-id]`)도 같은 경로로 오염 가능.
2. **테스트 취약** — `frame-move-snap.spec.ts`의 `els.nth(0)/nth(1)`이
   "문서 내 [data-frame-id]는 캔버스 frame뿐"을 가정. 현재는 DOM 순서
   (캔버스가 레일보다 앞)로 우연히 통과.

## 제약

타일의 `data-frame-id`는 **제거 불가** — WI-039가 의도적으로 부여:
reparent drag 컨트롤러의 `elementFromPoint` 드롭-타깃 hit-test +
`useHoverContext` 호버 프로브가 소비. 수정은 소비자 측 스코핑.

## 구현

1. `frame-move-snap.ts` — `begin`이 `deps.hostEl()`을 `scope`로 잡고
   movingEl 조회 + 후보 수집(`querySelectorAll`)을 그 서브트리로 한정.
   레일(ThumbnailPanel = DesignPage 오버레이)·body 포털 셀렉션 크롬은
   호스트 바깥이므로 정확히 배제. `scope === null` → 스냅 없이
   pass-through(기존 movingEl-미발견과 동일 거동). container/grid도
   중복 `deps.hostEl()` 호출 대신 `scope` 재사용으로 정리.
2. `frame-move-snap.spec.ts` — ① `frameBoxes(page)` 헬퍼: doc children
   id로 스테이지-스코프(`getByTestId("frame-stage")`) 엘리먼트를 짝지어
   box[i] ↔ frames(page)[i] 정합 보장(전역 nth() 가정 제거), ② grid
   테스트의 `.first()`도 스테이지 스코프.

## SVL (2026-06-12)

- `frame-move-snap.spec.ts` 2/2 green.
- typecheck ✓ / gates 5종 ✓ / unit 1228/1228 ✓ / build ✓ / biome ✓.
- 드래그 e2e 서브셋(reparent-modifier-drag·multi-drag·
  selection-follows-drag·rotation-snap·line-endpoint-snap-close·
  frame-manipulation): 13 passed / 1 failed —
  `reparent-modifier-drag.spec.ts:118`(reparent ghost 미출현)은
  **stash 후 HEAD 재실행으로 선재 실패 확증**(WI-200/201 무관) →
  **WI-202로 해결**(같은 first-match 취약 클래스 — slide-deck 캔버스가
  활성 페이지만 렌더해 `.first()`가 레일 타일을 잡음; 테스트 재작성).

## 메모 (스코프 외 잔여)

`document.querySelector('[data-frame-id="<id>"]')` 단일-조회 소비자들
(corner-radius-handle, poly-vertex-handle, LayoutEditHandles,
DesignPage 스크롤 등)도 first-match 의존 — DOM 순서(캔버스 < 레일)로
동작 중. 타일이 DOM에서 캔버스보다 앞으로 이동하는 리팩터가 생기면
같은 클래스의 버그 재발 — 그때 공용 `findFrameElement(host, id)`
헬퍼로 수렴할 것.

## 로그

- 2026-06-12 — WI 생성 → 스코핑 구현 + 테스트 경화 → SVL green → DONE.
  선재 reparent-modifier-drag:118 실패 발견(HEAD 확증)은 후속 분리.
