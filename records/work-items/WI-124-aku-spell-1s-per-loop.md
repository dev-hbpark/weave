# WI-124 — 편집 스펠 재생 속도 1초/루프

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | WI-117/WI-121~123 후속 튜닝 |

## Problem (operator, 2026-06-06)

편집 스펠 재생을 조금 더 느리게 — **1초에 한 번 재생**(1 루프 = 1초).

## Change

- `gpu-sprite-renderer` SPRITES: `adding`(spell-right)/`updating`(spell-left) fps **10 → 6**
  (6프레임 @ 6fps = 1초/루프).
- `useAkuRoam` `FRAME_PLAY_MS` **1200 → 2000**(2루프 = 2초), `FRAME_HOP_MS = ROAM_TRAVEL_MS +
  2000`. 워더 사이클의 "도착 후 2루프 재생" 시간을 새 속도에 맞춰 갱신(WI-122/123 보장 유지).

## Acceptance

- [x] 편집 스펠이 1초에 한 번(루프) 재생.
- [x] 워더: 이동 → 2루프(=2초) 재생 완료 → 이동. 2번 재생 보장 유지.

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 94/94.
- fps/타이밍 상수 변경(streaming 전용 재생) — 오프라인 e2e 직접 구동 불가. 6프레임/6fps = 1초/루프
  계산, FRAME_PLAY_MS = 2루프 = 2000ms로 정합.

See WI-122 / WI-123.
