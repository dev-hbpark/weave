# DR-080 — 아쿠 작업 중 "센터 스테이지": 화면 중앙 고정 + 편집 슬라이드 카메라 센터링 + 명암 스포트라이트

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-115
- **Relates / supersedes-in-part:** WI-107(fly-to-frame 로밍 — 작업 중 동작을 본 DR이 대체),
  DR-072(편집 중 인터랙션 락 + 스포트라이트), WI-110(스포트라이트), WI-111(활동 기반 단계).
- **Operator directive (2026-06-06):**
  1. 편집(streaming) 중 딤을 블러 + **밝기도 어둡게**, 아쿠 영역은 **밝게**.
  2. 작업을 시작하면 아쿠가 **화면 가운데로 이동**한 뒤 연결.
  3. 편집 중인 **루트 프레임(슬라이드)이 항상 화면 가운데** 오도록 카메라 이동.

## Context

기존(WI-107): 에이전트 작업 중 아쿠가 편집되는 프레임의 화면 rect로 **날아갔다**(fly-to-frame).
프레임이 화면 가장자리/오프스크린이면 아쿠가 구석으로 가거나 사라져, "무엇을 작업 중인지"가
오히려 안 보였다. 운영자는 반대 모델을 원함 — **아쿠는 중앙 고정**, **카메라가 편집 슬라이드를
아쿠 밑(중앙)으로 가져온다**. 무대 조명처럼 중앙만 밝고 주변은 어둡게.

## Decision

작업(streaming) 중 "센터 스테이지" 모델:

1. **명암 스포트라이트(AkuInteractionLock)** — 딤 레이어를 `blur(3px) + brightness(0.5) + 어두운
   틴트`로 강화하고 중앙은 마스크로 도려냄(블러/딤 미적용). 추가 **bright 레이어**가 중앙
   ~180px를 `backdrop brightness(1.22) saturate(1.1)` + 소프트 글로우로 **정상보다 밝게**. rAF가
   런처 중심을 CSS 변수로 추적 → 두 레이어가 공유. (패널 닫힘 = spotlight; 열림 = 전체 암전.)
2. **아쿠 중앙 이동(useAkuRoam)** — fly-to-frame 제거. streaming 시작 시 아쿠가 **뷰포트 정중앙**
   으로 글라이드(이동 중 move 스프라이트 → 도착 후 connecting/working), 작업 내내 중앙 유지.
   `viewportCentre()`는 수면-정중앙과 동일 헬퍼(정확히 (vw−box)/2,(vh−box)/2).
3. **편집 슬라이드 카메라 센터링(useAkuFrameCamera)** — streaming 중에만 `editor.changeStream`
   (user-command) 구독 → `findTrailDeep`로 편집 item의 **최상위 루트 프레임 id** 해석 → DesignPage
   의 `handleZoomToFrame`(= `cameraFitBox`, FRAME_FIT_FILL 70%)로 센터+핏. 루트 id로 **디듀프**
   (같은 슬라이드 편집 폭주 시 재핏 안 함; 다른 슬라이드로 옮기면 재센터링). **수동 사용자 편집
   은 카메라를 절대 안 움직임**(streaming 게이트) — 사람 편집과 안 싸움.

레이어링: 아쿠 피처는 pages/ 를 import 하지 않음 — DesignPage가 `onZoomToFrame={handleZoomToFrame}`
콜백을 주입(카메라 핏 수학은 FrameStage/페이지 소유 유지). 루트 id 해석만 공용 document 레이어
(`agocraft-mirror.findTrailDeep`) 사용.

## Consequences

- 작업 중 항상 중앙 무대: 아쿠+편집 슬라이드가 한가운데, 주변은 어둡게 → 시선 집중.
- WI-107 fly-to-frame 로직 제거(아쿠가 오프스크린 프레임 따라가던 문제 해소). `useAkuRoam`에서
  `editor`/`changeStream`/`roamPointInRect` 의존 제거(decommission).
- 턴 종료 후 프레임 추가가 있었다면 기존 WI-065 `onFramesAdded`(fit-all)가 1회 발동(전체 덱
  보여주기) — 작업 중 per-edit 센터링과 시점이 달라 충돌 없음.
- 검증 한계: streaming 경로는 reverse-MCP 서버 필요 → 오프라인 e2e로 직접 구동 불가. 공용
  프리미티브(viewportCentre 정중앙 = 검증됨, handleZoomToFrame = 기존 테스트됨)와 코드 리뷰로
  확인. 명암 스포트라이트는 동일 레이어 구조 스크린샷으로 시각 검증.
