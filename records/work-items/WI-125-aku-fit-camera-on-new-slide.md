# WI-125 — 새 슬라이드 생성 시 카메라 핏

> **Superseded by WI-126** (2026-06-06): 운영자가 "새 슬라이드뿐 아니라 편집 중인 아이템의
> 최상위 루트 슬라이드를 항상 핏"으로 확장 요청 → `useAkuNewSlideCamera`(문서 diff)는 삭제하고
> `useAkuFrameCamera`(편집 itemId → 루트, 루트 id 디듀프)로 대체. 새 슬라이드 생성도 그 add가
> 편집 이벤트라 포함됨.

| Field | Value |
|---|---|
| Status | Superseded by WI-126 |
| Owner | hbpark |
| Decision | DR-081(작업 중 카메라 — per-edit 센터링 철회) 보완 · WI-065(턴종료 fit-all) |
| Relates | use-frame-focus(handleZoomToFrame/cameraFitBox) · agocraft-mirror(absoluteFrameBox) |

## Problem (operator, 2026-06-06)

아쿠 에이전트가 **새 슬라이드(루트 프레임)를 생성**하면, 그 **생성 시점에** 카메라가 해당
슬라이드를 뷰포트에 핏하게 보여주도록 이동해야 하는데 **안 움직임**.

## Root cause

WI-116/DR-081에서 per-edit 카메라 센터링(useAkuFrameCamera)을 철회한 뒤, 에이전트 추가에 대한
카메라 이동은 **턴 종료 시 `onFramesAdded` → `handleFitAll`(전체 fit)** 뿐. 슬라이드 **생성 순간**
개별 핏은 없었음.

## Change

- 신규 훅 `useAkuNewSlideCamera`: `document`의 루트 자식(도메인 아이템) id 집합을 추적해 **새로
  나타난 루트 슬라이드**를 감지, streaming 중이면 `onZoomToFrame`(=DesignPage `handleZoomToFrame`
  = `cameraFitBox` 70%)로 그 슬라이드에 카메라 핏. 문서 모델 기반(`absoluteFrameBox`)이라 페인트
  전에도 동작. (WI-113 per-edit 센터링과 달리 **새 슬라이드 생성에만** 발화 → 로밍을 가리지 않음.)
- `AkuAssistant`에 `onZoomToFrame` prop 재도입 + 훅 배선. `DesignPage`에서
  `onZoomToFrame={handleZoomToFrame}` 주입.
- 기존 WI-065 턴종료 fit-all은 유지(덱 빌드 후 전체 보기).

## Acceptance

- [x] 에이전트가 새 루트 슬라이드를 만들면 그 즉시 카메라가 해당 슬라이드에 핏.
- [x] 기존 슬라이드 편집/내부 워더는 카메라를 움직이지 않음(새 슬라이드에만 발화).
- [x] 수동 슬라이드 추가는 영향 없음(streaming 게이트; 수동은 use-item-add가 처리).

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 94/94 · 아쿠 e2e 12/12.
- 새 슬라이드 핏은 streaming(reverse-MCP 서버) 전용 경로 → 오프라인 e2e 직접 구동 불가. 루트 id
  diff 로직 + 기존 `handleZoomToFrame`(검증된 카메라 핏)로 구성.

See DR-081 / WI-065.
