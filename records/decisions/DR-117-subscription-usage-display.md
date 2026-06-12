# DR-117 — 구독 윈도우 사용률을 cost 푸터의 연장으로 표시

- **Date:** 2026-06-11 · **Status:** Accepted · **WI:** WI-177
- **Relates:** DR-116 (cost 푸터/unknown-내로잉), small-think DR-059
  (`cost.limits` additive 필드), DR-011 (onUnknown:"preserve")

## Context

byo-ssh 는 운영자 구독으로 돌므로 달러보다 "Session/주간 윈도우의 몇 %"가
실질 비용 감각이다. small-think DR-059 가 기존 `cost` 이벤트에 additive
`limits` 배열(윈도우별 최신 스냅샷, utilization 0–1, resetsAt epoch 초)을
실어 보낸다.

## Decision

1. **새 표면이 아니라 cost 푸터의 연장.** 윈도우 %는 비용 의미론의 일부 —
   별도 칩/배너 대신 같은 푸터 줄 끝에 "Session 23% · 주간 41%" 로 붙인다.
   훅/MessageList 는 무변경 (WI-176 경로가 자동 포함) — 표시 로직 전부가
   `cost-event.ts` 순수 함수에 머문다.
2. **라벨·순서는 데이터 맵, 미지 윈도우는 원문 표기** (Rule 6 +
   onUnknown:"preserve"): 서버가 모르는 새 윈도우 id 를 보내도 떨어뜨리지
   않고 원문으로 보여준다. 다음 윈도우 추가는 맵 1행이다.
3. **항목 단위 검증/강등.** malformed 윈도우 항목은 개별 탈락하고 살아남은
   항목만 싣는다; malformed `resetsAt` 은 그 필드만 버린다. costUsd 강등
   (DR-116)과 동일한 "부분 손상이 레코드를 죽이지 않는다" 원칙.
4. **의미는 "지금 윈도우가 찬 %"다** — 이 태스크의 소모분이 아니다 (같은
   구독을 다른 세션/기기도 소모). 푸터는 짧게, 이 캐비앗은 hover 툴팁에
   "태스크 종료 시점의 전체 사용률"로 명시한다.
5. **표시 클램프 0–100%.** 계약은 0–1 fraction (DR-059 가 인테이크에서
   percent 방어 정규화까지 함) — 그래도 표시는 한 번 더 클램프한다.

## Consequences

- api 모드/구버전 서버는 limits 가 없어 푸터가 기존과 동일 — 무해.
- 윈도우 % 는 cost 와 함께 영속된다. 리로드 후엔 "그 턴이 끝난 시점"의
  스냅샷으로 읽힌다 (시간이 지나면 실제 윈도우와 다를 수 있음 — 의도된
  기록 의미론).

## Verification

- `cost-event.test.ts` 19 green; apps/web vitest 1121 green; tsc/biome clean;
  루트 게이트 5종 green. WI-177 참조.
