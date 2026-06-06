# WI-119 — idea 상황 → 랜덤 스펠 / 연결중 → thinking

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-070 (expression mood seam) · WI-117/WI-118 후속 |
| Relates | WI-107(로밍 connecting/looking 재사용) |

## Problem (operator, 2026-06-06)

1. 편집 중 **idea**(idea.png)가 계속 보인다 — idea가 보이는 상황들은 **두 스펠
   (spell-right/spell-left)이 랜덤하게** 나타나면 좋겠다.
2. **연결중 상태**에서는 **thinking** 스프라이트가 나오면 좋겠다.

## Change

- **idea 은퇴 → 랜덤 스펠 (useAkuExpression)**: idea가 쓰이던 mood(`working`=그 외 편집,
  `celebrating`=완료 ✨)를 진입 시 **랜덤으로 `adding`(spell-right) 또는 `updating`(spell-left)**
  으로 치환. 한 occurrence당 1회 추첨 후 고정(min-hold latch와 통합). 실제 추가/수정 작업은
  그대로 각자 스펠(우→spell-right, 좌→spell-left) 유지.
- **연결중 → thinking (mood.ts)**: `resolveAkuMood`에서 connectionState `connecting`/`reconnecting`
  → mood **`thinking`**(was `connecting`). `connecting` mood 자체는 move-left 시트에 그대로 매핑
  유지 — `useAkuRoam`의 **왼쪽 로밍 locomotion**이 재사용하기 때문(연결 상태와 분리).
- `gpu-sprite-renderer`의 working/celebrating SPRITES 항목은 이제 expression에서 치환되어
  도달하지 않는 **dead fallback**(타입 exhaustiveness용)으로 주석 표기. idea.png는 런타임 미사용.

## Acceptance

- [x] 그 외 편집(배경 변경/삭제 등)·완료 시 idea 대신 두 스펠 중 랜덤 표시(occurrence당 고정).
- [x] 추가→spell-right, 수정→spell-left는 그대로(랜덤 아님).
- [x] 연결/재연결 중 thinking 스프라이트.
- [x] 왼쪽 로밍 locomotion(move-left)·드래그·수면 등 회귀 없음(connecting mood 시트 유지).

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 93/93(mood.test 연결→thinking 갱신) · 아쿠 e2e 12/12.
- 랜덤 스펠·연결 thinking의 실제 재생은 streaming/connecting(reverse-MCP 서버) 필요 → 오프라인
  e2e 직접 구동 불가. mood resolve는 `mood.test`로, 치환/latch는 로직으로 확정.

See WI-117/WI-118 / DR-070.
