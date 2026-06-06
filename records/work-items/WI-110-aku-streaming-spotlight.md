# WI-110 — 편집 중 딤에 아쿠 주변 선명 원(spotlight)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-072 (편집 중 인터랙션 락 — spotlight는 그 위 확장) |
| Relates | WI-105(인터랙션 락) · WI-107(단일 로밍 런처) · WI-104(엔진/스프라이트) |

## Problem (operator, 2026-06-06)

아쿠가 일하는 동안 딤(블러) 처리할 때, **일하는 아쿠 중앙으로부터 아쿠 높이의 2배 정도
반지름을 갖는 원 영역**은 블러 없이 **선명하게** 보이게 하고 싶다 — 아쿠가 무엇을 편집하는지
가려지지 않도록.

## Change

- `AkuInteractionLock`: `spotlight?: boolean` prop 추가. true일 때 딤/블러 레이어에
  **알파 radial-gradient MASK**를 적용 — `transparent 0 → transparent 240px → #000 300px`.
  마스크로 비워진(transparent) 픽셀은 아무것도 그리지 않으므로 `backdrop-blur`가 그 영역에
  적용되지 않음 → **선명한 구멍**(spotlight). 240px ≈ 아쿠 높이(120px)의 2배, 300px까지
  부드럽게 페더링.
- 구멍을 **움직이는 런처에 고정**: `requestAnimationFrame` 루프가 매 프레임
  `[data-aku-launcher]`의 `getBoundingClientRect()` 중심을 CSS 변수
  `--aku-spot-x/--aku-spot-y`로 써넣음 → 로밍 글라이드 중에도 구멍이 아쿠를 따라감.
- `AkuAssistant`: `<AkuInteractionLock locked={status==="streaming"}
  spotlight={status==="streaming" && !open} />`. **패널이 닫혔을 때(런처가 보일 때)만**
  spotlight — 그래야 돌아다니는 작업 아쿠 주변이 선명. 패널이 열려 있으면 spotlight 없이
  전체 블러(런처가 없으니 추적 대상도 없음).

## Acceptance

- [x] 편집(streaming) 중 화면이 딤+블러된다(기존 WI-105 동작 유지).
- [x] 패널이 닫혀 있으면 작업 아쿠 중심 ~240px 반지름 원이 블러 없이 선명하다.
- [x] 아쿠가 다른 프레임으로 이동하면 선명한 원이 함께 따라간다(rAF 추적).
- [x] 패널이 열려 있으면 마스크 없이 전체 블러(추적 대상 없음).
- [x] 락 해제(status→idle) 시 마스크/rAF가 정리되어 잔존하지 않는다.

## Verification (SVL gate — 2026-06-06)

- tsc 0(aku 파일) · biome clean · 아쿠 단위 66/66 · 아쿠 e2e 11/11.
- CSS 기법(backdrop-blur 레이어를 알파 radial-gradient 마스크로 뚫어 선명 구멍) 시각 검증:
  동일 레이어 구조 정적 하니스 스크린샷에서 중심 원은 선명(줄무늬·텍스트 또렷), 외곽은
  블러+딤으로 확인. 마스크 중심을 `--aku-spot-*` 변수로 이동 → 구멍 위치 추종 확인.
- (참고) 무관 파일 `ImageBlock.tsx`/`corner-radius-field.tsx`(사용자 untracked WIP)에 별개
  타입오류 — 본 작업 밖.

## Notes

- 번호 충돌: 사용자 WIP가 WI-108/109(corner-radius)를 선점 → 본 아쿠 작업은 WI-110으로 채번.
  (앞선 아쿠 드래그는 WI-108-aku-launcher-drag.md로 corner-radius WI-108과 파일명만 분리됨.)

See DR-072. 동작 매핑/에셋: MASCOT.md.
