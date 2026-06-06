# WI-118 — 아쿠 작업 스프라이트가 안 보이던 문제 (추가/수정 mood 지속 + 최소 유지)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-070 (expression mood seam) · WI-117(작업별 스프라이트) 후속 수정 |
| Relates | small-think `agent-phase` 리듀서(툴 상태 lifecycle) |

## Problem (operator, 2026-06-06)

WI-117에서 추가=spell-right / 수정=spell-left / 정리=puff를 배선했는데, 실제 편집 중
**정리(finalizing)를 제외하면 추가/수정 스프라이트가 거의 안 보임**.

## Root cause

`adding`/`updating` mood는 활동 캡션에 "추가"/"수정"이 있어야 켜진다. 그 캡션
(`${chipLabel(running.name)} 적용 중…`)은 **툴 status가 `running`일 때만** 생성됨 — 즉
`tool-start`↔`tool`(settle) 사이의 구간. weave 편집(`editor.exec`)은 즉시 끝나 이 구간이 수 ms라
스프라이트 엔진이 렌더하기 전에 지나감. settle 후 phase=`applying`엔 running 툴이 없어 캡션이
일반 "편집 적용 중…"(→ working → idea)로 떨어짐. 반면 **정리**는 phase=`streaming-text`(지속 구간)
라 오래 떠서 보였음.

## Change (weave 측만)

- `use-aku-agent.ts` `activityFor`: 편집 phase(`tool-calling`/`applying`)에 running 툴이 없어도
  **가장 최근 활성 툴 이름**으로 캡션 유지 → 작업 mood(추가/수정)가 작업 구간 내내 지속.
- `use-aku-expression.ts`: 편집 mood **최소 유지 latch**(`EDIT_HOLD_MS=700`, `adding/updating/working`)
  추가 — 빠른 툴 버스트에도 각 스프라이트가 ≥700ms 보이도록. 비편집 mood(생각/정리/idle 등) 전환은
  즉시(추론·마무리 즉각 표시).

## Acceptance

- [x] 아이템 추가 시 spell-right가 작업 구간 동안 보인다(순간 플래시 아님).
- [x] 아이템 수정 시 spell-left가 보인다.
- [x] 정리 중 puff 유지(기존 동작 회귀 없음).
- [x] 생각/idle/완료 전환은 즉시(latch가 비편집 mood를 지연시키지 않음).

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 93/93 · 아쿠 e2e 12/12.
- 실제 스프라이트 재생은 streaming(reverse-MCP 서버) 필요 → 오프라인 e2e 직접 구동 불가. 원인/수정은
  툴 상태 lifecycle(small-think `agent-phase`: tool-start→running, tool→ok)과 `activityFor`/latch
  로직으로 확정.

See WI-117 / DR-070.
