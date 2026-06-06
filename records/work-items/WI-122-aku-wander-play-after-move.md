# WI-122 — 워더 시 이동 후 스프라이트 재생 (이동만 하던 문제)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | WI-121 후속 수정 |
| Relates | WI-107(fly-to-frame) · ROAM_TRAVEL_MS(글라이드) |

## Problem (operator, 2026-06-06)

WI-121 후 "이동한 다음 재생을 해야 하는데 **이동만** 하고 있어".

## Root cause

intra-frame hop 간격이 `FRAME_HOP_MS=1200ms`였는데, hop의 글라이드(`goTo` → `moving=true`)는
`ROAM_TRAVEL_MS=1100ms` 동안 지속되고 그동안 `spriteMood`는 **locomotion 스프라이트
(move-left/right)** 를 보여준다(AkuAssistant). 즉 1200ms 중 1100ms가 이동(로코모션)이라 도착 후
편집 spell이 재생될 시간이 ~100ms뿐 → "이동만" 보임.

## Change (useAkuRoam)

워더 1사이클 = **MOVE → 도착 후 2루프 PLAY → MOVE**. hop 간격을
`FRAME_HOP_MS = ROAM_TRAVEL_MS + FRAME_PLAY_MS`(1100 + 1200 = **2300ms**)로 변경.
- 글라이드(1100ms): locomotion 스프라이트.
- 도착 후 휴식(1200ms = 2루프): `moving=false` → expression.mood(편집 spell) **재생**.
- 그 뒤 다음 hop.

## Acceptance

- [x] hop 후 편집 spell이 2루프(~1200ms) 재생된 뒤 다음 이동이 일어난다(이동→재생→이동).
- [x] 이동 중 locomotion, 정지 중 spell이 보인다(둘 다 표시).

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 94/94.
- 타이밍 상수 변경(streaming 전용 경로) — 실제 재생은 reverse-MCP 서버 필요로 오프라인 e2e 직접
  구동 불가. 사이클 = 글라이드(ROAM_TRAVEL_MS) + 2루프(6프레임@10fps) 계산.

See WI-121.
