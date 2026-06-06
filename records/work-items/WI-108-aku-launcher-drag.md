# WI-108 — 아쿠 런처 드래그(마우스 따라 이동 + drag-struggle 스프라이트)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-074 (single roaming launcher — drag is an extension) |
| Relates | WI-107(로밍 런처) · WI-104(엔진/스프라이트) |

## Problem (operator, 2026-06-06)

런처 아쿠에 **드래그 동작**이 없음. 드래그하면 런처가 **마우스를 따라 이동**하고, 그동안
새 `drag-struggle` 스프라이트로 버둥대는 모습을 표현하고 싶다.

## Change

- 신규 스프라이트 `public/aku/sprites/drag.png`(drag-struggle, 3120×768 = 6프레임 520×768, 투명).
- `mood.ts`: `AkuMood += "dragging"`(UI 전용, resolveAkuMood 미발화) + intensity. `gpu-sprite-renderer`
  SPRITES `dragging → drag.png`(fps 12).
- `useAkuRoam.ts`: 드래그 추가 — `onPointerDown`(포인터 추적), 임계값 4px로 **tap↔drag 구분**
  (tap→`onTap`=패널 열기; drag→포인터 따라 이동, 뷰포트 클램프). 드래그 중 `dragging=true`,
  자동 로밍(idle/stream) 스케줄러 정지, 드롭 지점에서 로밍 재개.
- `AkuAssistant`: 런처 `onClick`→`onPointerDown=roam.onPointerDown`(tap=openPanel). spriteMood =
  dragging?`dragging`: moving?move:expression.mood. 드래그 중 `transition:none`(즉시 추적).
- `AkuLauncher`: `cursor-grab active:cursor-grabbing`.

## Acceptance

- [x] 런처를 드래그하면 마우스를 따라 이동(뷰포트 클램프).
- [x] 드래그 중 `drag` 스프라이트(버둥)가 보인다.
- [x] 드래그는 패널을 열지 않고, **탭(이동 없음)** 은 패널을 연다.
- [x] 드롭 후 그 위치에서 자동 로밍 재개 · reduced-motion/streaming/coachmark와 충돌 없음.

## Verification (SVL gate — 2026-06-06)

- tsc 0(aku 파일) · biome clean · 아쿠 단위 66/66 · 아쿠 e2e 11/11.
- 드래그 diag e2e: `moodDuringDrag="dragging"` · 런처 이동(moved) · 드래그 후 패널 0 · 탭 후 패널 1.
- (참고) 무관 파일 `ImageBlock.tsx`/`corner-radius-field.tsx`(사용자 untracked WIP)에 별개 타입오류 — 본 작업 밖.

See DR-074. Assets: MASCOT.md.
