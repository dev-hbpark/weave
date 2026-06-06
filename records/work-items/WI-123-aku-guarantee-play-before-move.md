# WI-123 — 워더 2루프 재생 보장 (프레임 변경이 재생을 취소하지 않게)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | WI-121/WI-122 후속 수정 |
| Relates | WI-107(fly-to-frame) |

## Problem (operator, 2026-06-06)

재생 2번(2루프)이 **무조건 보장**되어야 함. 현재는 다른 프레임 편집이 시작되면(changeStream
새 프레임) **즉시 이동**(`flyToFrame`)하면서 진행 중인 재생을 취소함. 무조건 **재생 완료 후**에
이동이 처리되도록.

## Change (useAkuRoam)

- changeStream 구독을 **기록 전용**으로: 편집 중 프레임 id를 `editFrameRef`에만 저장(즉시 이동·
  디바운스 제거). 프레임 변경이 더 이상 Aku를 직접 움직이지 않음 → 재생을 취소할 수 없음.
- **워더 인터벌(`FRAME_HOP_MS` = 글라이드 + 2루프)** 이 유일한 mover. 매 사이클 경계에서만
  `editFrameRef`의 최신 타깃으로 이동 → 같은 프레임이든 새 프레임이든 **현재 2루프 재생이 끝난
  뒤**에 이동.
- 미사용 `STREAM_DEBOUNCE_MS` 제거.

## Acceptance

- [x] 편집 중 매 사이클: 이동 → 2루프 재생(완료 보장) → 이동.
- [x] 다른 프레임 편집이 시작돼도 현재 재생을 취소하지 않고, 재생 완료 후 사이클 경계에서 새
      프레임으로 이동.
- [x] 시작 중앙 글라이드(WI-116)·reduced-motion·드래그·수면 충돌 없음.

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 94/94 · 아쿠 e2e 12/12.
- 워더는 streaming(reverse-MCP 서버) 전용 경로라 오프라인 e2e 직접 구동 불가. 단일 mover(인터벌)
  로직상 사이클 경계 외 이동이 없으므로 2루프 재생이 구조적으로 보장.

See WI-121 / WI-122.
