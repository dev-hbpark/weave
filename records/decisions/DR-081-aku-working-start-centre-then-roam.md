# DR-081 — 아쿠 작업: 시작은 중앙, 이후 편집 프레임으로 로밍 (중앙 고정 철회)

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-116
- **Supersedes-in-part:** DR-080 (작업 중 아쿠 중앙 **고정** + per-edit 카메라 센터링).
- **Keeps:** WI-110/DR-072 명암 스포트라이트(블러+밝기↓, 아쿠 주변 밝게). WI-107 fly-to-frame.
- **Operator directive (2026-06-06):** "아쿠가 편집 시작을 중앙에서 하는 거지 고정되어 있는 게
  아니야. 처음 시작을 중앙에서 하고 이후는 편집되는 프레임으로 돌아다니던 걸 유지해야 해."

## Context

DR-080에서 작업(streaming) 중 아쿠를 **뷰포트 중앙에 고정**하고 `useAkuFrameCamera`로 편집
프레임을 카메라로 중앙에 가져왔다. 운영자 피드백: 아쿠가 **고정**되어 보임. 원하는 것은
**시작만 중앙**, 그 다음은 **WI-107처럼 편집되는 프레임으로 날아다니는** 동작.

카메라가 매 편집마다 프레임을 중앙에 모으면, 아쿠가 프레임으로 날아가도 늘 중앙 부근 →
"고정"처럼 보여 로밍이 가려진다. 따라서 per-edit 카메라 센터링을 **철회**한다.

## Decision

작업(streaming) 중 아쿠 위치(useAkuRoam):

1. **시작(streaming→true)**: `viewportCentre()`로 **한 번** 글라이드(시작은 중앙 무대).
2. **이후**: `editor.changeStream`(user-command) 변경마다 편집된 item의 `[data-frame-id]`
   화면 rect로 **fly-to-frame**(WI-107 복원, 디바운스 180ms, 오프스크린·0크기 스킵).
3. 드라이버 streaming 분기는 **위치를 소유하지 않음** — 활동 타임스탬프만 갱신(작업 직후
   editing→home 복귀 보장), 로밍/수면 금지. 위치는 fly-to-frame이 소유.
4. **per-edit 카메라 센터링 제거**(`useAkuFrameCamera` 데코미션, `AkuAssistant`의
   `onZoomToFrame` prop + DesignPage 배선 제거). WI-065 `onFramesAdded`(턴 종료 fit-all)는 유지.

## Consequences

- 작업 시작은 중앙, 이후 아쿠가 편집 프레임을 따라 날아다님(가시적 로밍 복원).
- 카메라는 더 이상 편집 중 자동 이동 안 함(사용자/턴종료 fit만). 오프스크린 프레임이면 아쿠가
  날아가지 않고 제자리(WI-107 가드) — 운영자가 수용한 기존 동작.
- 검증 한계: streaming 경로는 reverse-MCP 서버 필요 → 오프라인 e2e로 직접 구동 불가. fly-to-frame은
  WI-107 검증 코드 복원, 시작-중앙은 검증된 `viewportCentre`(수면-정중앙에서 (597,300) 확인) 재사용.
