# WI-126 — 편집 중인 아이템의 최상위 루트 슬라이드를 항상 카메라 핏

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-081 보완 · WI-125(새 슬라이드 핏) 대체 |
| Relates | use-frame-focus(handleZoomToFrame/cameraFitBox) · agocraft-mirror(findTrailDeep) |

## Problem (operator, 2026-06-06)

아쿠 에이전트가 **편집하고 있는 프레임/아이템이 속한 최상위 루트 슬라이드(프레임)** 가 항상
뷰포트에 핏되도록 카메라가 이동해야 한다.

## Change

- 신규(복원) 훅 `useAkuFrameCamera`: streaming 중 `editor.changeStream`(user-command) 구독 →
  편집 itemId를 `findTrailDeep`로 **최상위 루트 슬라이드 id**로 해석 → `onZoomToFrame`
  (=DesignPage `handleZoomToFrame` = `cameraFitBox` 70%)로 그 루트 슬라이드에 카메라 핏.
  **루트 id 디듀프**: 같은 슬라이드 내 여러 아이템 편집은 1회만 핏, 편집 루트가 바뀔 때만 재핏.
- `useAkuNewSlideCamera`(WI-125) 삭제 — 본 훅이 포함(슬라이드 add도 편집 이벤트).
- `AkuAssistant`에서 `useAkuFrameCamera` 배선(getDocument=docRef). `onZoomToFrame` prop·DesignPage
  주입 유지.
- 아쿠 워더(WI-121~124)는 그대로 — 카메라가 편집 루트 슬라이드를 보여주고, 아쿠는 그 안에서 로밍.
  (WI-113의 "아쿠 중앙 고정 + 카메라"와 달리 아쿠가 로밍하므로 정적이지 않음.)

## Acceptance

- [x] 에이전트가 어떤 아이템/프레임을 편집하든 그 최상위 루트 슬라이드가 카메라에 핏된다.
- [x] 같은 슬라이드 내 연속 편집은 재핏 안 함(디듀프), 다른 슬라이드로 가면 재핏.
- [x] 새 슬라이드 생성도 포함(그 add가 편집 이벤트 → 루트=자신 → 핏). 수동 편집은 카메라 안 움직임.

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 94/94 · 아쿠 e2e 12/12.
- 카메라 핏은 streaming(reverse-MCP 서버) 전용 경로 → 오프라인 e2e 직접 구동 불가. `findTrailDeep`
  (기존 유틸) + 검증된 `handleZoomToFrame`으로 구성(WI-113에서 동작 확인된 메커니즘 복원).

See WI-125 (superseded) / DR-081.
