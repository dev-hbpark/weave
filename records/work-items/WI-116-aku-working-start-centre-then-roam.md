# WI-116 — 아쿠 작업: 시작은 중앙, 이후 편집 프레임으로 로밍

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-081 (DR-080의 중앙 고정 + 카메라 센터링 철회) |
| Relates | WI-107(fly-to-frame) · WI-111(활동 단계) · WI-110(스포트라이트, 유지) |

## Problem (operator, 2026-06-06)

작업 중 아쿠가 **화면 중앙에 고정**되어 있음(WI-115). 원하는 동작: **시작만 중앙**에서 하고,
이후에는 **편집되는 프레임으로 돌아다니던**(WI-107) 동작을 유지.

## Change

- **useAkuRoam**: `editor` prop 복원. streaming 시작 시 `viewportCentre()`로 1회 글라이드(시작 중앙).
  이후 `editor.changeStream`(user-command) 변경마다 `[data-frame-id]` 위치로 **fly-to-frame** 복원
  (디바운스 `STREAM_DEBOUNCE_MS=180`, 오프스크린/0크기 스킵). 드라이버 streaming 분기는 위치 미소유
  (활동 갱신 + 로밍/수면 금지)로 변경 — 중앙 고정 제거.
- **AkuAssistant**: `useAkuRoam`에 `editor` 재전달. `useAkuFrameCamera` 호출 + import 제거,
  `onZoomToFrame` prop 제거.
- **DesignPage**: AkuAssistant `onZoomToFrame={handleZoomToFrame}` 배선 제거(thumbnail 더블클릭용
  handleZoomToFrame 자체는 유지).
- **데코미션**: `useAkuFrameCamera.ts` 삭제. MASCOT.md 갱신.

## Acceptance

- [x] 작업 시작 시 아쿠가 화면 정중앙으로 이동(시작은 중앙).
- [x] 이후 편집되는 프레임으로 날아다님(WI-107 로밍 복원, 중앙 고정 아님).
- [x] per-edit 카메라 센터링 없음(편집 중 카메라 자동 이동 안 함). 턴 종료 fit-all(WI-065)은 유지.
- [x] 명암 스포트라이트(WI-110)·활동 단계(WI-111)·드래그·reduced-motion 충돌 없음.

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 91/91 · 아쿠 e2e 12/12.
- 작업중(streaming) 경로는 reverse-MCP 서버 필요 → 오프라인 e2e 직접 구동 불가:
  fly-to-frame은 WI-107 검증 코드 복원, 시작-중앙은 검증된 `viewportCentre`(수면-정중앙 (597,300)
  진단에서 확인) 재사용.

See DR-081 (supersedes-in-part DR-080).
