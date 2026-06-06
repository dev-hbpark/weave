# WI-121 — 편집 프레임 내부 랜덤 워더 (2 스프라이트 루프마다 이동)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | WI-116/DR-081(작업 중 프레임 로밍) 후속 |
| Relates | WI-107(fly-to-frame) · WI-104(sprite-engine 6프레임/시트) |

## Problem (operator, 2026-06-06)

작업 중 아쿠가 **편집 대상 프레임이 바뀔 때만** 이동함. 그게 아니라 **스프라이트가 두 번
재생될 때마다** 편집 프레임 영역 안에서 랜덤하게 이동했으면 — "두 번 재생 → 이동 → 두 번 재생
→ 이동" 식.

## Change (useAkuRoam)

- `flyToFrame(itemId)`를 `useCallback`으로 추출(프레임 rect 내 랜덤점으로 `goTo`, 기존 로직).
- 편집 프레임 추적 ref `editFrameRef` 추가 — changeStream(user-command)에서 갱신.
  프레임 **타깃이 바뀌면 즉시** `flyToFrame`(기존 동작 유지).
- **신규 인터벌(`FRAME_HOP_MS=1200`)**: streaming 중 `editFrameRef`가 있으면 매 1200ms마다
  `flyToFrame`로 현재 프레임 내부 랜덤점 hop. 편집 스프라이트는 6프레임 @ 10fps라 1루프 600ms,
  **2루프 = 1200ms** → "두 번 재생마다 이동"과 일치.
- streaming 시작 시 `editFrameRef=null`로 초기화(이전 턴/사용자 편집 프레임을 쫓지 않게),
  streaming 종료(인터벌 cleanup) 시에도 null.

참고: 엔진 `frames()`는 rAF 렌더 카운트(≈60/s)라 "루프 수"가 아니므로, 루프 시간(2×6/10s)을
타이머로 환산해 사용. 편집 중 표시 스프라이트는 항상 spell(fps 10)이라 정확히 맞음.

## Acceptance

- [x] 편집 프레임이 바뀌면 즉시 이동(기존).
- [x] 같은 프레임을 편집하는 동안에도 2루프(1200ms)마다 프레임 내부 랜덤 위치로 hop.
- [x] 시작 중앙 글라이드(WI-116)·reduced-motion·드래그·패널/수면과 충돌 없음.

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 94/94 · 아쿠 e2e 11 pass(+1 무관 flaky 재시도 통과).
- 인터벌 hop은 streaming(reverse-MCP 서버) 필요 → 오프라인 e2e 직접 구동 불가. `flyToFrame`은
  WI-107 검증 코드, 1200ms는 6프레임@10fps×2루프 계산(엔진 `frames()` 시맨틱 확인 후).

See WI-116 / DR-081.
