# WI-135 — 턴 종료 피날레 (중앙·2배·짜잔 2회 후 idle)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | DR-070 (expression mood→sheet) · WI-119(celebrate remap) 일부 되돌림 |
| Relates | WI-111(활동 단계) · WI-130(phrase 말풍선) |

## Problem (operator, 2026-06-07)

아쿠 에이전트의 작업이 **최종 종료**되면, **뷰포트 중앙**에서 **지금보다 2배 크기**로 짜잔~
스프라이트를 **2번 재생**한 후 **idle** 상태로 돌아가게.

## Change

- 신규 시트 `public/aku/sprites/celebrate.png`(3120×724 = 6프레임 520×724, 투명, 짜잔~ tada).
- `gpu-sprite-renderer` `SPRITES.celebrating` → `celebrate.png`(fps 6 = 1초/루프).
- `use-aku-expression`: `celebrating`을 `IDEA_MOODS`에서 제거(랜덤 스펠 치환 중단 — WI-119 일부
  되돌림) → celebrating mood가 tada를 그대로 표시. `CELEBRATE_MS` 1800 → **2400**(≈ 중앙 이동
  400ms + 2루프 2000ms). celebrate 윈도우는 streaming→idle + 적용된 편집이 있을 때만 발화(기존).
- `AkuAssistant`: `celebrating = expression.mood === "celebrating"`. celebrate 중 launcher style을
  **뷰포트 정중앙 + `transform: scale(2)`**(transform-origin center, 400ms transition)로 override,
  spriteMood를 `"celebrating"`으로 고정(턴 종료 직후 home-glide locomotion이 피날레를 가리지 않게).
  caption은 celebrate 윈도우 동안 celebrating phrase("완성! 어때요?" 등, WI-130).

## Acceptance

- [x] 작업 최종 종료 시 화면 정중앙에서 2배 크기로 tada 재생.
- [x] ≈2루프(2초) 후 celebrate 윈도우 종료 → idle 복귀(launcher 정상 위치/크기로 글라이드).
- [x] celebrating이 랜덤 스펠로 치환되지 않음(전용 시트). 다른 mood/로밍/수면 충돌 없음.

## Verification (SVL gate — 2026-06-07)

- tsc 0 · biome clean(변경 파일) · 아쿠 단위 104/104 · 아쿠 e2e 12/12.
- 피날레는 streaming→idle(reverse-MCP 서버) 경로 → 오프라인 e2e 직접 구동 불가. celebrate 윈도우
  (기존 검증) + mood→celebrate.png + launcherProps override 로직으로 구성.

## Notes

- 본 작업은 공유 파일 `AkuAssistant.tsx`를 편집해야 해서, 트리에 있던 미커밋 아쿠 변경
  (런처 streaming 중 유지 / thinking no-hop 등)을 같은 커밋에 함께 실었음(파일 내 비대화식 분리
  불가). 비-아쿠 WIP(commands/DR-082·083/WI-127·128 px-ratio·line-bounds)는 미스테이징 유지.

See DR-070 / WI-119.
