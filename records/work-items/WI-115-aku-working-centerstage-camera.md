# WI-115 — 아쿠 작업 중 센터 스테이지 (중앙 고정 + 슬라이드 카메라 센터링 + 명암 스포트라이트)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-080 (센터 스테이지 모델 — WI-107 fly-to-frame 작업중 동작 대체) |
| Relates | DR-072/WI-110(인터랙션 락+스포트라이트) · WI-111(활동 단계) · WI-065(onFramesAdded fit) |

## Problem (operator, 2026-06-06)

1. 에이전트 편집 중 딤을 블러뿐 아니라 **밝기도 어둡게**, **아쿠 영역은 밝게**.
2. 작업 시작 시 아쿠가 **화면 가운데로 이동**한 후 연결.
3. 편집 중인 **루트 프레임(슬라이드)이 항상 화면 가운데** 오도록 카메라 이동.

## Change

- **AkuInteractionLock**(명암 스포트라이트): 딤 레이어 `blur(3px)+brightness(.5)+틴트`(중앙 마스크
  도려냄) + 신규 **bright 레이어** 중앙 `backdrop brightness(1.22) saturate(1.1)`+글로우(마스크로
  중앙만). rAF가 런처 중심 → CSS 변수(컨테이너)로, 두 레이어 공유.
- **useAkuRoam**: fly-to-frame 제거. streaming 시작 시 `viewportCentre()`로 글라이드 + 작업 내내
  중앙 유지(드라이버 streaming 분기 + 즉시 effect). `editor`/`changeStream`/`roamPointInRect`/
  `STREAM_DEBOUNCE_MS` 의존 제거.
- **useAkuFrameCamera**(신규): streaming 중 `changeStream`(user-command) 구독 → `findTrailDeep`로
  루트 프레임 id 해석 → `onZoomToFrame`(=DesignPage `handleZoomToFrame`/`cameraFitBox`)로 센터+핏.
  루트 id 디듀프. streaming 게이트(수동 편집은 카메라 안 움직임).
- **AkuAssistant**: `onZoomToFrame` prop 추가 + `useAkuFrameCamera` 배선, `useAkuRoam`에서 `editor`
  prop 제거. **DesignPage**: `onZoomToFrame={handleZoomToFrame}` 주입(레이어링 — 피처는 pages/ 미import).

## Acceptance

- [x] 편집 중 화면이 블러 + **어둡게**, 아쿠 주변 원은 **밝고** 선명.
- [x] 작업 시작 시 아쿠가 화면 정중앙으로 이동(이동 모습 visible) 후 작업.
- [x] 편집 중 루트 슬라이드가 카메라로 화면 중앙에 옴(슬라이드 바뀌면 재센터링, 같은 슬라이드는 디듀프).
- [x] 수동 사용자 편집은 카메라/중앙이동을 유발하지 않음(streaming 게이트). reduced-motion/드래그 충돌 없음.

## Verification (SVL gate — 2026-06-06)

- tsc 0(aku/DesignPage) · biome clean(변경 파일) · 아쿠 단위 91/91 · 아쿠 e2e 12/12(회귀 없음).
- 명암 스포트라이트: 동일 레이어 구조 정적 하니스 스크린샷 — 주변 어둡게+블러, 중앙 밝게+선명+글로우 확인.
- 작업중 경로(아쿠 중앙·카메라 센터링)는 reverse-MCP 서버 필요로 오프라인 e2e 직접 구동 불가 →
  공용 프리미티브로 확인: `viewportCentre()`는 수면-정중앙 진단에서 정확히 (597,300) 검증됨,
  `handleZoomToFrame`(cameraFitBox)는 기존 기능. 루트 id 해석은 `findTrailDeep`(기존 유틸).
- (참고) 무관 파일 `ImageBlock.tsx`/`corner-radius-field.tsx`(사용자 untracked WIP) 타입오류는 본 작업 밖.

See DR-080.
