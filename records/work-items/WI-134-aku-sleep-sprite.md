# WI-134 — 잠자는 스프라이트 전용 시트 교체

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | DR-070 (expression mood→sheet) |
| Relates | WI-111(활동 단계 sleeping) · WI-104(엔진) |

## Problem (operator, 2026-06-07)

`sleeping` mood가 `idle.png`를 재사용 중 — **수면 마스크+침대 전용 시트**로 교체.

## Change

- 신규 시트 `public/aku/sprites/sleep.png`(3120×724 = 6프레임 520×724, 투명) — 침대에 누워
  수면 안대를 쓴 아쿠.
- `gpu-sprite-renderer` `SPRITES.sleeping`: `idle.png` → `sleep.png`(fps 3 유지 — 잔잔한 호흡).
- MASCOT.md 시트 목록/매핑 갱신(sleep, paint 추가).

## Acceptance

- [x] 1분 무편집 후 수면(화면 정중앙 이동 후 doze, WI-111) 시 sleep.png 재생.
- [x] 다른 mood/렌더 박스/엔진 경로 영향 없음(동일 3120×724 규격 드롭-인).

## Verification (SVL gate — 2026-06-07)

- tsc 0(aku) · biome clean(변경 파일) · 아쿠 단위 99/99.
- 동일 규격(3120×724) 시트 드롭-인이라 엔진이 기존과 동일 경로로 로드. 수면 재생은 1분 무편집 후
  표시(장시간) — 동작 매핑만 변경.

See DR-070 / WI-111.
